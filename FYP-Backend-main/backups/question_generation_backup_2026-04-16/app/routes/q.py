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
from app.utils.subject_query import DuplicateSubjectEntriesError, get_or_create_subject_triple
from app.schemas.question_gen_route import (
    GeneratedQuestionItem,
    GeneratedQuestionsResponse,
    GenerationJobStatusResponse,
    JobQueuedResponse,
    QuestionRequest,
    RetrievalSourceItem,
    TopicQuestionSetResponse,
)
from app.services.question_generation_job_runner import run_generation_job
from app.services.question_generation_pipeline import (
    persist_generated_questions,
    sync_generate_question_batch,
)

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


def _build_timeout_fallback_questions(req: "QuestionRequest", topic: str) -> list[GeneratedQuestionItem]:
    qtype_norm = (req.qtype or "").strip().lower()
    difficulty = (req.difficulty or "medium").strip().capitalize()
    topic_label = (topic or "this topic").strip()
    subject_label = (req.subject or "this subject").strip()

    if qtype_norm in ("mcq", "mcqs", "multiple choice", "multiple choice questions"):
        count = max(1, min(int(req.num_questions or 1), 2))
        out: list[GeneratedQuestionItem] = []
        for i in range(1, count + 1):
            stem = f"[Fallback] {subject_label}: Which statement best describes {topic_label}?"
            options = {
                "A": f"It is directly related to {topic_label}.",
                "B": "It is unrelated to the current chapter.",
                "C": "It is only a historical term with no scientific use.",
                "D": "It is never tested in board examinations.",
            }
            out.append(
                GeneratedQuestionItem(
                    question_id=-(1000 + i),
                    question_number=i,
                    question=(
                        f"{stem}\nA) {options['A']}\nB) {options['B']}\nC) {options['C']}\nD) {options['D']}"
                    ),
                    marks=1,
                    answer="A",
                    explanation=f"Fast fallback question ({difficulty}) generated because live LLM timed out.",
                    stem=stem,
                    options=options,
                )
            )
        return out

    count = max(1, min(int(req.num_questions or 1), 2))
    marks = 8 if qtype_norm in ("long", "long question", "long questions") else 3
    return [
        GeneratedQuestionItem(
            question_id=-(2000 + i),
            question_number=i,
            question=f"[Fallback] Explain {topic_label} in {subject_label} at {difficulty} level.",
            marks=marks,
            answer=f"{topic_label} can be explained using core textbook concepts from {subject_label}.",
            explanation="Fast fallback response generated because live LLM timed out.",
        )
        for i in range(1, count + 1)
    ]


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
    summary="Generate questions (board / MDCAT / ECAT) — synchronous",
    description=(
        "Generate questions using the Groq LLM + FAISS retriever. "
        "This call waits for the full LLM round-trip (can exceed 60s on cold start). "
        "For mobile clients and to avoid HTTP timeouts, prefer **POST /questions/generation-jobs/** "
        "and poll **GET /questions/generation-jobs/{job_id}** until completed."
    ),
)
async def get_questions(req: QuestionRequest, db: AsyncSession = Depends(get_db)):
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

    # Validate user topic input early so we fail with a clear 4xx (not a 5xx later in generation).
    normalized_topic = (req.topic or "").strip()
    if not normalized_topic:
        raise HTTPException(status_code=422, detail="Error: Valid topic required")

    exam_type_norm = (req.exam_type or "board").strip().lower()
    qtype_norm_in = (req.qtype or "short").strip().lower()
    if exam_type_norm in ("mdcat", "ecat") and qtype_norm_in not in (
        "mcq",
        "mcqs",
        "multiple choice",
        "multiple choice questions",
    ):
        raise HTTPException(
            status_code=422,
            detail=f"{exam_type_norm.upper()} supports MCQs only. Use qtype='MCQ'.",
        )

    # Resolve or create subject for this board + class + subject name (handles duplicate rows safely).
    try:
        subject = await get_or_create_subject_triple(
            db,
            board=req.board,
            class_level=req.class_level,
            subject_name=req.subject,
            book_version="2024",
        )
    except DuplicateSubjectEntriesError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e

    # Build an exam label that also encodes exam type for the LLM prompt
    et = (req.exam_type or "board").strip().lower()
    if et == "mdcat":
        exam = f"MDCAT Entry Test | Board: {req.board} | Class: {req.class_level}"
    elif et == "ecat":
        exam = f"ECAT Engineering Entry Test | Board: {req.board} | Class: {req.class_level}"
    else:
        exam = f"{req.board} Class {req.class_level}"
    try:
        rag_k = max(1, min(int(getattr(settings, "RAG_TOP_K", 5) or 5), 20))
        fast_mode = bool(getattr(settings, "QUESTION_GENERATION_FAST_MODE", False))
        if fast_mode:
            # Fast mode trades some recall for lower retrieval + prompt latency.
            rag_k = 1

        timeout_base = int(getattr(settings, "QUESTION_GENERATION_TIMEOUT_SEC", 60) or 60)
        live_cap_raw = int(getattr(settings, "QUESTION_GENERATION_LIVE_MAX_SEC", 0) or 0)
        qtype_norm = (req.qtype or "").strip().lower()
        if qtype_norm in ("mcq", "mcqs", "multiple choice", "multiple choice questions"):
            timeout_sec = max(timeout_base, 180)
        elif qtype_norm in ("long", "long question", "long questions"):
            timeout_sec = max(timeout_base, 220)
        else:
            timeout_sec = max(timeout_base, 120)
        # Optional env cap (e.g. fail-fast in prod). 0 = use full timeout_sec (avoids 60s ceiling when base is 240s).
        if live_cap_raw > 0:
            effective_timeout_sec = min(timeout_sec, max(10, live_cap_raw))
        else:
            effective_timeout_sec = timeout_sec
        try:
            source_dicts, raw_questions = await asyncio.wait_for(
                asyncio.to_thread(
                    sync_generate_question_batch,
                    normalized_topic,
                    req.subject,
                    exam,
                    req.difficulty,
                    req.qtype,
                    req.num_questions,
                    rag_k,
                ),
                timeout=max(10, effective_timeout_sec),
            )
        except asyncio.TimeoutError as e:
            logger.warning(
                "Primary question generation timed out "
                "(effective_timeout=%ss configured_timeout=%ss live_max_cap=%s board=%s class=%s subject=%s topic=%s qtype=%s)",
                effective_timeout_sec,
                timeout_sec,
                live_cap_raw if live_cap_raw > 0 else "off",
                req.board,
                req.class_level,
                req.subject,
                normalized_topic,
                req.qtype,
            )
            await db.rollback()
            raise HTTPException(
                status_code=503,
                detail="INSUFFICIENT_CONTEXT_FOR_REQUESTED_QUESTION_COUNT",
            ) from e
        if not raw_questions:
            raise HTTPException(
                status_code=404,
                detail=(
                    f"No MCQs found for topic '{normalized_topic}'. "
                    "Try a related topic, reduce num_questions, or adjust difficulty."
                ),
            )
        return await persist_generated_questions(
            db, subject, req, source_dicts, raw_questions, commit_db=True
        )
    except HTTPException:
        await db.rollback()
        raise
    except ValueError as e:
        await db.rollback()
        logger.exception("Question generation validation failure: %s", e)
        raise HTTPException(status_code=503, detail=str(e))
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

    normalized_topic = (req.topic or "").strip()
    if not normalized_topic:
        raise HTTPException(status_code=422, detail="Error: Valid topic required")

    exam_type_norm = (req.exam_type or "board").strip().lower()
    qtype_norm_in = (req.qtype or "short").strip().lower()
    if exam_type_norm in ("mdcat", "ecat") and qtype_norm_in not in (
        "mcq",
        "mcqs",
        "multiple choice",
        "multiple choice questions",
    ):
        raise HTTPException(
            status_code=422,
            detail=f"{exam_type_norm.upper()} supports MCQs only. Use qtype='MCQ'.",
        )

    try:
        subject = await get_or_create_subject_triple(
            db,
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
    normalized_topic = (req.topic or "").strip()
    if not normalized_topic:
        raise HTTPException(status_code=422, detail="Error: Valid topic required")

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
