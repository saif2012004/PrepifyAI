# app/routes/q.py – PrepifyAI question generation + answer checking (Groq pipeline)
import asyncio
import json
import logging
import os
from pathlib import Path
from typing import Any, List

import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text

from app.core.config import settings
from app.database import get_db
from app.models.generated_question import GeneratedQuestion
from app.models.question_generation_job import QuestionGenerationJob
from app.models.user import User
from app.schemas.generated_question import QuestionAnswerSubmission, QuestionAnswerResponse
from app.services.performance_service import PerformanceService
from app.core.security import get_current_user, get_optional_user
from app.schemas.question_gen_route import (
    GeneratedQuestionsResponse,
    GenerationJobStatusResponse,
    JobQueuedResponse,
    QuestionRequest,
    TopicQuestionSetResponse,
)
from app.services.question_generation_job_runner import run_generation_job
from app.services.question_generation_pipeline import (
    persist_generated_questions,
    sync_generate_question_batch,
)
from app.services.question_generation_cache import cache_get_response, cache_set_response
from app.services.generator import NO_TEXTBOOK_CONTENT_DETAIL
from app.services.question_generator import QuestionGenerator
from app.services.syllabus_context_service import (
    HTTP_DETAIL_NO_CHUNKS_FOR_SUBJECT,
    HTTP_DETAIL_NO_RELEVANT_TEXTBOOK_TOPIC,
    HTTP_DETAIL_NO_USABLE_SYLLABUS_MATCH,
    build_syllabus_context_for_generation,
)
from app.services.subject_resolver import DuplicateSubjectEntriesError, SubjectResolver
from app.services.validation_service import QuestionGenerationValidator, QuestionValidationError

# Ensure app/.env is loaded (same path as main.py) so GROQ_API_KEY is available
try:
    from dotenv import load_dotenv

    _env_path = Path(__file__).resolve().parent.parent / ".env"
    load_dotenv(_env_path)
except ImportError:
    pass

router = APIRouter()

logger = logging.getLogger(__name__)
_marks_column_checked = False
_logged_missing_groq_key = False


class ExplainRequest(BaseModel):
    question_id: int
    student_answer: str | None = None


class ExplainResponse(BaseModel):
    question_id: int
    model_answer: str
    explanation: str
    missing_points: list[str]


@router.post(
    "/generate-questions/",
    response_model=GeneratedQuestionsResponse,
    summary="Generate questions (board / MDCAT / ECAT) — async I/O, bounded wait",
    description=(
        "Async FastAPI handler: blocking Groq+RAG in a thread pool (see ``QUESTION_GENERATION_HARD_CAP_SEC``, "
        "default 180s). Textbook chunks are loaded first when strict syllabus is on. "
        "Identical requests may return cached JSON when ``REDIS_URL`` is set. "
        "On timeout, returns **504** (no placeholder MCQs). "
        "For long runs, use **POST /questions/generation-jobs/** and poll **GET /questions/generation-jobs/{job_id}**."
    ),
)
async def get_questions(req: QuestionRequest, db: AsyncSession = Depends(get_db)):
    if not QuestionGenerator.is_enabled():
        return QuestionGenerator.disabled_response()

    try:
        QuestionGenerationValidator.validate_sync_request(req)
    except QuestionValidationError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message) from e

    cached = await cache_get_response(req)
    if cached is not None:
        return cached

    global _marks_column_checked
    key = (getattr(settings, "GROQ_API_KEY", None) or os.environ.get("GROQ_API_KEY") or "").strip()
    if not key:
        global _logged_missing_groq_key
        if not _logged_missing_groq_key:
            _logged_missing_groq_key = True
            logger.warning(
                "Question generation returned 503: GROQ_API_KEY is empty or missing. "
                "Set it in FYP-Backend-main/app/.env (same folder as this app package) and restart uvicorn."
            )
        raise HTTPException(
            status_code=503,
            detail="GROQ_API_KEY not set. Add GROQ_API_KEY=your_key to app/.env and restart.",
        )

    # Ensure the marks column exists — once per process (was: every request, slow on Postgres).
    if not _marks_column_checked:
        try:
            await db.execute(
                text("ALTER TABLE generated_questions ADD COLUMN IF NOT EXISTS marks INTEGER NULL;")
            )
            await db.execute(
                text(
                    "ALTER TABLE generated_questions ADD COLUMN IF NOT EXISTS generation_topic VARCHAR(200) NULL;"
                )
            )
            await db.commit()
        except Exception:
            await db.rollback()
        _marks_column_checked = True

    normalized_topic = (req.topic or "").strip()

    try:
        subject = await SubjectResolver(db).get_or_create_for_generation(
            board=req.board,
            class_level=req.class_level,
            subject_name=req.subject,
            book_version="2024",
        )
    except DuplicateSubjectEntriesError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e

    exam = QuestionGenerator.exam_prompt_label(req)
    try:
        rag_k = max(1, min(int(getattr(settings, "RAG_TOP_K", 5) or 5), 20))
        fast_mode = bool(getattr(settings, "QUESTION_GENERATION_FAST_MODE", False))
        if fast_mode:
            fast_cap = max(1, min(int(getattr(settings, "RAG_TOP_K_FAST", 3) or 3), 20))
            rag_k = min(rag_k, fast_cap)

        strict_syllabus = bool(getattr(settings, "QUESTION_GENERATION_STRICT_SYLLABUS", False))
        prebuilt_context: str | None = None
        prebuilt_sources: list | None = None
        if strict_syllabus:
            prebuilt_context, prebuilt_sources, syllabus_meta = await build_syllabus_context_for_generation(
                db,
                int(subject.subject_id),
                normalized_topic,
                rag_k,
            )
        else:
            syllabus_meta = {
                "subject_chunk_rows": 0,
                "context_part_count": 0,
                "combined_text_length": 0,
                "rows_used": 0,
                "insufficient_content": False,
            }
        chunk_n = len(prebuilt_sources) if isinstance(prebuilt_sources, list) else 0
        ctx_chars = len((prebuilt_context or "").strip()) if strict_syllabus else 0
        combined_len = int(syllabus_meta.get("combined_text_length") or 0) if strict_syllabus else ctx_chars
        rows_used = int(syllabus_meta.get("rows_used") or 0) if strict_syllabus else 0
        logger.info(
            "question_gen.retrieval subject_id=%s topic=%r chunks_in_context=%s rows_used=%s "
            "combined_text_len=%s ctx_chars=%s strict_syllabus=%s qtype=%s",
            subject.subject_id,
            normalized_topic[:200],
            chunk_n,
            rows_used,
            combined_len,
            ctx_chars,
            strict_syllabus,
            (req.qtype or "").strip().lower(),
        )
        if strict_syllabus and not (prebuilt_context or "").strip():
            n_pool = int(syllabus_meta.get("subject_chunk_rows") or 0)
            if syllabus_meta.get("insufficient_content"):
                detail = HTTP_DETAIL_NO_RELEVANT_TEXTBOOK_TOPIC
            elif n_pool == 0:
                detail = HTTP_DETAIL_NO_CHUNKS_FOR_SUBJECT
            else:
                detail = HTTP_DETAIL_NO_USABLE_SYLLABUS_MATCH
            logger.warning(
                "question_gen.no_syllabus_text subject_id=%s topic=%r subject_chunk_rows=%s insufficient=%s — 404",
                subject.subject_id,
                normalized_topic[:200],
                n_pool,
                bool(syllabus_meta.get("insufficient_content")),
            )
            await db.rollback()
            raise HTTPException(status_code=404, detail=detail)

        # Keep a safer minimum cap for live sync requests to avoid false 504s
        # during first-call warmup (embedding/model cold start).
        hard_cap = max(300, int(getattr(settings, "QUESTION_GENERATION_HARD_CAP_SEC", 300) or 300))
        timeout_base = max(120, int(getattr(settings, "QUESTION_GENERATION_TIMEOUT_SEC", 180) or 180))
        live_cap_raw = int(getattr(settings, "QUESTION_GENERATION_LIVE_MAX_SEC", 0) or 0)
        qtype_norm = (req.qtype or "").strip().lower()
        if qtype_norm in ("mcq", "mcqs", "multiple choice", "multiple choice questions"):
            timeout_sec = max(timeout_base, 260)
        elif qtype_norm in ("long", "long question", "long questions"):
            timeout_sec = max(timeout_base, 240)
        else:
            timeout_sec = max(timeout_base, 150)
        effective_timeout_sec = min(hard_cap, timeout_sec)
        if live_cap_raw > 0:
            effective_timeout_sec = min(effective_timeout_sec, max(10, live_cap_raw))
        effective_timeout_sec = max(180, min(effective_timeout_sec, hard_cap))
        logger.info(
            "question_gen.pre_generation subject_id=%s topic=%r chunks_in_context=%s rows_used=%s "
            "combined_text_len=%s strict_syllabus=%s qtype=%s num_questions=%s",
            subject.subject_id,
            normalized_topic[:200],
            chunk_n,
            rows_used if strict_syllabus else 0,
            combined_len if strict_syllabus else 0,
            strict_syllabus,
            (req.qtype or "").strip().lower(),
            req.num_questions,
        )
        try:
            source_dicts, raw_questions, gen_meta = await asyncio.wait_for(
                asyncio.to_thread(
                    lambda: sync_generate_question_batch(
                        normalized_topic,
                        req.subject,
                        exam,
                        req.difficulty,
                        req.qtype,
                        req.num_questions,
                        rag_k,
                        context=prebuilt_context if strict_syllabus else None,
                        source_dicts=prebuilt_sources if strict_syllabus else None,
                        allow_global_rag_fallback=not strict_syllabus,
                        subject_id=int(subject.subject_id),
                    ),
                ),
                timeout=max(10, effective_timeout_sec),
            )
        except asyncio.TimeoutError as e:
            logger.warning(
                "question_gen.timeout subject_id=%s topic=%r chunk_count=%s effective_timeout=%ss hard_cap=%s",
                subject.subject_id,
                normalized_topic[:200],
                chunk_n,
                effective_timeout_sec,
                hard_cap,
            )
            await db.rollback()
            raise HTTPException(
                status_code=504,
                detail=(
                    f"Question generation timed out after {effective_timeout_sec}s. "
                    "Increase QUESTION_GENERATION_HARD_CAP_SEC or use POST /questions/generation-jobs/."
                ),
            ) from e
        persisted = await persist_generated_questions(
            db,
            subject,
            req,
            source_dicts,
            raw_questions,
            commit_db=True,
            generation_meta=gen_meta,
        )
        if persisted.questions:
            await cache_set_response(req, persisted)
        return persisted
    except HTTPException:
        await db.rollback()
        raise
    except ValueError as e:
        await db.rollback()
        msg = str(e)
        if msg == NO_TEXTBOOK_CONTENT_DETAIL or NO_TEXTBOOK_CONTENT_DETAIL in msg or "no relevant textbook" in msg.lower():
            logger.warning("Question generation: no grounded textbook content (%s)", msg)
            raise HTTPException(status_code=404, detail=NO_TEXTBOOK_CONTENT_DETAIL) from e
        low = msg.lower()
        if any(
            x in low
            for x in (
                "valid json",
                "empty message",
                "not valid json",
                "truncated array",
                "model returned text",
            )
        ):
            logger.warning("Question generation: model output parse issue (%s)", msg[:500])
            raise HTTPException(status_code=502, detail=msg)
        logger.exception("Question generation validation failure: %s", e)
        raise HTTPException(status_code=503, detail=msg)
    except DuplicateSubjectEntriesError as e:
        await db.rollback()
        logger.exception("Duplicate subject catalog entries: %s", e)
        raise HTTPException(status_code=409, detail=str(e)) from e
    except Exception as e:
        await db.rollback()
        logger.exception(
            "Question generation failed (board=%s class=%s subject=%s topic=%s exam_type=%s): %s",
            req.board,
            req.class_level,
            req.subject,
            normalized_topic,
            req.exam_type,
            e,
        )
        raise HTTPException(
            status_code=502,
            detail="Question generation failed due to a server-side processing error. Check logs for details.",
        )


@router.post(
    "/generation-jobs/",
    response_model=JobQueuedResponse,
    status_code=202,
    summary="Enqueue question generation (returns immediately; poll GET /generation-jobs/{job_id})",
    description=(
        "Does not block on Groq or RAG. Use this from mobile/web to avoid HTTP timeouts. "
        "Poll ``GET .../generation-jobs/{job_id}`` until ``status`` is ``completed`` or ``failed``."
    ),
)
async def enqueue_question_generation(
    req: QuestionRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    if not QuestionGenerator.is_enabled():
        try:
            QuestionGenerationValidator.validate_enqueue_request(req)
        except QuestionValidationError as e:
            raise HTTPException(status_code=e.status_code, detail=e.message) from e
        try:
            subject = await SubjectResolver(db).get_or_create_for_generation(
                board=req.board,
                class_level=req.class_level,
                subject_name=req.subject,
                book_version="2024",
            )
        except DuplicateSubjectEntriesError as e:
            raise HTTPException(status_code=409, detail=str(e)) from e
        job_id = str(uuid.uuid4())
        row = QuestionGenerationJob(
            job_id=job_id,
            status="pending",
            request_json=req.model_dump(mode="json"),
            subject_id=subject.subject_id,
        )
        db.add(row)
        await db.commit()
        background_tasks.add_task(run_generation_job, job_id)
        prefix = (settings.API_V1_STR or "/api/v1").rstrip("/")
        dn = QuestionGenerator.disabled_notice()
        return JobQueuedResponse(
            job_id=job_id,
            status="pending",
            message=dn,
            poll_url=f"{prefix}/questions/generation-jobs/{job_id}",
            feature_disabled_notice=dn,
        )

    global _marks_column_checked
    key = (getattr(settings, "GROQ_API_KEY", None) or os.environ.get("GROQ_API_KEY") or "").strip()
    if not key:
        raise HTTPException(
            status_code=503,
            detail="GROQ_API_KEY not set. Add GROQ_API_KEY=your_key to app/.env and restart.",
        )
    if not _marks_column_checked:
        try:
            await db.execute(text("ALTER TABLE generated_questions ADD COLUMN IF NOT EXISTS marks INTEGER NULL;"))
            await db.execute(
                text("ALTER TABLE generated_questions ADD COLUMN IF NOT EXISTS generation_topic VARCHAR(200) NULL;")
            )
            await db.commit()
        except Exception:
            await db.rollback()
        _marks_column_checked = True

    try:
        QuestionGenerationValidator.validate_enqueue_request(req)
    except QuestionValidationError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message) from e

    try:
        subject = await SubjectResolver(db).get_or_create_for_generation(
            board=req.board,
            class_level=req.class_level,
            subject_name=req.subject,
            book_version="2024",
        )
    except DuplicateSubjectEntriesError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e

    job_id = str(uuid.uuid4())
    row = QuestionGenerationJob(
        job_id=job_id,
        status="pending",
        request_json=req.model_dump(mode="json"),
        subject_id=subject.subject_id,
    )
    db.add(row)
    await db.commit()
    background_tasks.add_task(run_generation_job, job_id)
    prefix = (settings.API_V1_STR or "/api/v1").rstrip("/")
    return JobQueuedResponse(
        job_id=job_id,
        status="pending",
        poll_url=f"{prefix}/questions/generation-jobs/{job_id}",
    )


@router.get("/generation-jobs/{job_id}", response_model=GenerationJobStatusResponse)
async def get_generation_job(job_id: str, db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(QuestionGenerationJob).where(QuestionGenerationJob.job_id == job_id))
    row = r.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Job not found")
    result = None
    if row.result_json:
        result = GeneratedQuestionsResponse.model_validate(row.result_json)
    return GenerationJobStatusResponse(
        job_id=row.job_id,
        status=row.status,
        error_message=row.error_message,
        result=result,
    )


@router.post(
    "/generate-topic-set/",
    response_model=TopicQuestionSetResponse,
    summary="Generate MCQ + short + long question set for one topic",
)
async def generate_topic_set(req: QuestionRequest, db: AsyncSession = Depends(get_db)):
    """
    Deterministic topic-focused bundle for Prepare-with-AI:
    - MCQs (with options + answer)
    - Short questions
    - Long questions
    """
    if not QuestionGenerator.is_enabled():
        try:
            QuestionGenerationValidator.validate_sync_request(req)
        except QuestionValidationError as e:
            raise HTTPException(status_code=e.status_code, detail=e.message) from e
        normalized_topic = (req.topic or "").strip()
        return TopicQuestionSetResponse(
            topic=normalized_topic,
            subject=req.subject,
            board=req.board,
            class_level=req.class_level,
            mcqs=[],
            short_questions=[],
            long_questions=[],
            retrieval_sources=[],
            feature_disabled_notice=QuestionGenerator.disabled_notice(),
        )

    try:
        QuestionGenerationValidator.validate_sync_request(req)
    except QuestionValidationError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message) from e

    normalized_topic = (req.topic or "").strip()

    exam_type_norm = (req.exam_type or "board").strip().lower()

    def _clone_with(qtype: str, n: int) -> QuestionRequest:
        return QuestionRequest(
            board=req.board,
            class_level=req.class_level,
            subject=req.subject,
            topic=normalized_topic,
            difficulty=req.difficulty,
            qtype=qtype,
            exam_type=req.exam_type,
            num_questions=n,
        )

    # Reuse existing endpoint logic to keep behavior consistent and robust.
    # Strict format requested: 10 MCQs, 5 short, 3 long.
    mcq_req = _clone_with("MCQ", 10)
    short_req = _clone_with("Short", 5)
    long_req = _clone_with("Long", 3)
    # Long questions should be medium/hard only.
    if (req.difficulty or "").strip().lower() not in ("hard",):
        long_req.difficulty = "medium"

    mcq_res = await get_questions(mcq_req, db)
    if exam_type_norm in ("mdcat", "ecat"):
        short_res = GeneratedQuestionsResponse(questions=[], retrieval_sources=mcq_res.retrieval_sources)
        long_res = GeneratedQuestionsResponse(questions=[], retrieval_sources=mcq_res.retrieval_sources)
    else:
        short_res = await get_questions(short_req, db)
        long_res = await get_questions(long_req, db)

    # Keep retrieval sources from MCQ run (same topic/context base).
    return TopicQuestionSetResponse(
        topic=normalized_topic,
        subject=req.subject,
        board=req.board,
        class_level=req.class_level,
        mcqs=mcq_res.questions,
        short_questions=short_res.questions,
        long_questions=long_res.questions,
        retrieval_sources=mcq_res.retrieval_sources,
    )


@router.post("/submit-answer/", response_model=QuestionAnswerResponse)
async def submit_answer(
    answer_submission: QuestionAnswerSubmission,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    """
    Submit an answer to a generated question.
    Uses key-based / semantic / AI grading and records performance for the logged-in user.
    """
    # Verify question exists
    result = await db.execute(
        select(GeneratedQuestion).where(
            GeneratedQuestion.question_id == answer_submission.question_id
        )
    )
    question = result.scalar_one_or_none()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    _st = (question.is_approved or "approved").lower()
    if _st not in ("approved",):
        raise HTTPException(
            status_code=403,
            detail="This question is not approved for practice yet.",
        )

    # Guest mode: evaluate heuristically without requiring login or saving progress.
    if current_user is None:
        ua = (answer_submission.user_answer or "").strip().lower()
        ca = (question.correct_answer or "").strip().lower()
        if not ua:
            return QuestionAnswerResponse(
                is_correct=False,
                score_percentage=0.0,
                score_marks=0.0,
                max_marks=float(question.marks or 5),
                explanation="No answer provided.",
                correct_answer=question.correct_answer or "",
                gamification=None,
            )
        overlap = 0.0
        if ca:
            ca_tokens = {t for t in ca.split() if len(t) > 2}
            ua_tokens = {t for t in ua.split() if len(t) > 2}
            overlap = (len(ca_tokens & ua_tokens) / max(1, len(ca_tokens))) * 100
        score_pct = max(10.0, min(100.0, overlap if overlap > 0 else 35.0))
        max_marks = float(question.marks or 5)
        score_marks = round((score_pct / 100.0) * max_marks, 2)
        return QuestionAnswerResponse(
            is_correct=score_pct >= 50.0,
            score_percentage=round(score_pct, 1),
            score_marks=score_marks,
            max_marks=max_marks,
            explanation="Guest evaluation is approximate. Sign in for full tracked AI grading.",
            correct_answer=question.correct_answer or "",
            gamification=None,
        )

    service = PerformanceService(db)
    try:
        return await service.evaluate_answer(
            user_id=current_user.user_id,
            answer_submission=answer_submission,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error evaluating answer: {str(e)}",
        )


@router.post("/explain-answer/", response_model=ExplainResponse)
async def explain_answer(
    req: ExplainRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    """
    Rich explanation endpoint: explains model answer and highlights missing points.
    """
    q_res = await db.execute(
        select(GeneratedQuestion).where(GeneratedQuestion.question_id == req.question_id)
    )
    q = q_res.scalar_one_or_none()
    if q is None:
        raise HTTPException(status_code=404, detail="Question not found")

    _st = (q.is_approved or "approved").lower()
    if _st not in ("approved",):
        raise HTTPException(
            status_code=403,
            detail="This question is not approved for practice yet.",
        )

    model_answer = q.correct_answer or ""
    student_answer = (req.student_answer or "").strip()
    key = (getattr(settings, "GROQ_API_KEY", None) or os.environ.get("GROQ_API_KEY") or "").strip()

    # Fallback explanation if LLM key is unavailable
    if not key:
        missing = []
        if student_answer:
            if student_answer.lower() not in model_answer.lower():
                missing = ["Include more key concepts from the model answer."]
        return ExplainResponse(
            question_id=q.question_id,
            model_answer=model_answer,
            explanation="Model answer and summary are provided. Configure GROQ_API_KEY for richer explanation.",
            missing_points=missing,
        )

    try:
        from groq import Groq

        client = Groq(api_key=key)
        prompt = (
            "You are a helpful tutor.\n"
            f"Question: {q.question_text}\n"
            f"Model answer: {model_answer}\n"
            f"Student answer: {student_answer}\n\n"
            "Return JSON only with keys: explanation (string), missing_points (array of short bullet strings)."
        )
        explain_model = (
            getattr(settings, "GROQ_QUESTION_MODEL", None) or "llama-3.1-8b-instant"
        ).strip()
        resp = client.chat.completions.create(
            model=explain_model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=400,
        )
        content = (resp.choices[0].message.content or "").strip()

        # simple tolerant parse
        import json

        start = content.find("{")
        end = content.rfind("}") + 1
        if start >= 0 and end > start:
            data = json.loads(content[start:end])
            explanation = str(data.get("explanation", "")).strip() or "See model answer."
            mp = data.get("missing_points", [])
            missing_points = [str(x).strip() for x in mp if str(x).strip()] if isinstance(mp, list) else []
        else:
            explanation = "See model answer."
            missing_points = []
    except Exception:
        explanation = "See model answer."
        missing_points = []

    return ExplainResponse(
        question_id=q.question_id,
        model_answer=model_answer,
        explanation=explanation,
        missing_points=missing_points,
    )
