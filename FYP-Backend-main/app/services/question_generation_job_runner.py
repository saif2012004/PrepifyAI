"""Background worker for async question generation jobs."""

from __future__ import annotations

import asyncio
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.database import AsyncSessionLocal
from app.models.question_generation_job import QuestionGenerationJob
from app.models.subject import Subject
from app.schemas.question_schema import GeneratedQuestionsResponse, QuestionRequest
from app.services.question_generation_feature import DISABLED_MESSAGE, is_question_generation_enabled
from app.services.question_generation_pipeline import (
    persist_generated_questions,
    sync_generate_question_batch,
)
from app.services.question_generator import QuestionGenerator
from app.services.syllabus_context_service import (
    HTTP_DETAIL_NO_CHUNKS_FOR_SUBJECT,
    HTTP_DETAIL_NO_RELEVANT_TEXTBOOK_TOPIC,
    HTTP_DETAIL_NO_USABLE_SYLLABUS_MATCH,
    build_syllabus_context_for_generation,
)

logger = logging.getLogger(__name__)


async def run_generation_job(job_id: str) -> None:
    async with AsyncSessionLocal() as db:
        job = await db.get(QuestionGenerationJob, job_id)
        if not job or job.status != "pending":
            return
        job.status = "running"
        await db.commit()

    async with AsyncSessionLocal() as db:
        job = await db.get(QuestionGenerationJob, job_id)
        if not job:
            return
        if not is_question_generation_enabled():
            job.status = "completed"
            job.result_json = GeneratedQuestionsResponse(
                questions=[],
                retrieval_sources=[],
                feature_disabled_notice=DISABLED_MESSAGE,
            ).model_dump(mode="json")
            job.error_message = None
            await db.commit()
            return
        req = QuestionRequest(**(job.request_json or {}))
        sub_r = await db.execute(select(Subject).where(Subject.subject_id == job.subject_id))
        subject = sub_r.scalar_one_or_none()
        if not subject:
            job.status = "failed"
            job.error_message = "Subject missing for this job."
            await db.commit()
            return

        normalized_topic = (req.topic or "").strip()
        exam = QuestionGenerator.exam_prompt_label(req)
        hard_cap = max(120, int(getattr(settings, "QUESTION_GENERATION_HARD_CAP_SEC", 180) or 180))

        rag_k = max(1, min(int(getattr(settings, "RAG_TOP_K", 5) or 5), 20))
        if bool(getattr(settings, "QUESTION_GENERATION_FAST_MODE", False)):
            fast_cap = max(1, min(int(getattr(settings, "RAG_TOP_K_FAST", 3) or 3), 20))
            rag_k = min(rag_k, fast_cap)

        strict_syllabus = bool(getattr(settings, "QUESTION_GENERATION_STRICT_SYLLABUS", False))
        pre_ctx: str | None = None
        pre_src: list | None = None
        if strict_syllabus:
            pre_ctx, pre_src, syllabus_meta = await build_syllabus_context_for_generation(
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
        chunk_n = len(pre_src) if isinstance(pre_src, list) else 0
        ctx_chars = len((pre_ctx or "").strip()) if strict_syllabus else 0
        combined_len = int(syllabus_meta.get("combined_text_length") or 0) if strict_syllabus else ctx_chars
        rows_used = int(syllabus_meta.get("rows_used") or 0) if strict_syllabus else 0
        logger.info(
            "question_gen.job.retrieval job_id=%s subject_id=%s topic=%r chunks_in_context=%s rows_used=%s "
            "combined_text_len=%s ctx_chars=%s strict_syllabus=%s qtype=%s",
            job_id,
            subject.subject_id,
            normalized_topic[:200],
            chunk_n,
            rows_used,
            combined_len,
            ctx_chars,
            strict_syllabus,
            (req.qtype or "").strip().lower(),
        )
        if strict_syllabus and not (pre_ctx or "").strip():
            job.status = "failed"
            n_pool = int(syllabus_meta.get("subject_chunk_rows") or 0)
            if syllabus_meta.get("insufficient_content"):
                job.error_message = HTTP_DETAIL_NO_RELEVANT_TEXTBOOK_TOPIC
            elif n_pool == 0:
                job.error_message = HTTP_DETAIL_NO_CHUNKS_FOR_SUBJECT
            else:
                job.error_message = HTTP_DETAIL_NO_USABLE_SYLLABUS_MATCH
            job.result_json = None
            await db.commit()
            return

        try:
            loop = asyncio.get_running_loop()
            try:
                source_dicts, raw_questions, gen_meta = await asyncio.wait_for(
                    loop.run_in_executor(
                        None,
                        lambda: sync_generate_question_batch(
                            normalized_topic,
                            req.subject,
                            exam,
                            req.difficulty,
                            req.qtype,
                            req.num_questions,
                            rag_k,
                            context=pre_ctx if strict_syllabus else None,
                            source_dicts=pre_src if strict_syllabus else None,
                            allow_global_rag_fallback=not strict_syllabus,
                            subject_id=int(subject.subject_id),
                        ),
                    ),
                    timeout=max(120, hard_cap),
                )
            except asyncio.TimeoutError:
                logger.warning("Question generation job %s timed out after %ss", job_id, hard_cap)
                job.status = "failed"
                job.error_message = (
                    f"Generation timed out after {hard_cap}s. "
                    "Increase QUESTION_GENERATION_HARD_CAP_SEC or split num_questions."
                )
                job.result_json = None
                await db.commit()
                return

            result = await persist_generated_questions(
                db,
                subject,
                req,
                source_dicts,
                raw_questions,
                commit_db=False,
                generation_meta=gen_meta,
            )
            job.status = "completed"
            job.result_json = result.model_dump()
            job.error_message = None
            await db.commit()
        except Exception as e:
            logger.exception("Question generation job %s failed", job_id)
            await db.rollback()
            async with AsyncSessionLocal() as db2:
                j2 = await db2.get(QuestionGenerationJob, job_id)
                if j2:
                    j2.status = "failed"
                    j2.error_message = str(e)[:4000]
                    await db2.commit()
