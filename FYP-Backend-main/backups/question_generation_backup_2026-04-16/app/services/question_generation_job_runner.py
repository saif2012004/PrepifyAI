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
from app.schemas.question_gen_route import QuestionRequest
from app.services.question_generation_pipeline import (
    persist_generated_questions,
    sync_generate_question_batch,
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
        req = QuestionRequest(**(job.request_json or {}))
        sub_r = await db.execute(select(Subject).where(Subject.subject_id == job.subject_id))
        subject = sub_r.scalar_one_or_none()
        if not subject:
            job.status = "failed"
            job.error_message = "Subject missing for this job."
            await db.commit()
            return

        normalized_topic = (req.topic or "").strip()
        et = (req.exam_type or "board").strip().lower()
        if et == "mdcat":
            exam = f"MDCAT Entry Test | Board: {req.board} | Class: {req.class_level}"
        elif et == "ecat":
            exam = f"ECAT Engineering Entry Test | Board: {req.board} | Class: {req.class_level}"
        else:
            exam = f"{req.board} Class {req.class_level}"

        rag_k = max(1, min(int(getattr(settings, "RAG_TOP_K", 5) or 5), 20))
        if bool(getattr(settings, "QUESTION_GENERATION_FAST_MODE", False)):
            rag_k = 1

        try:
            loop = asyncio.get_running_loop()
            source_dicts, raw_questions = await loop.run_in_executor(
                None,
                lambda: sync_generate_question_batch(
                    normalized_topic,
                    req.subject,
                    exam,
                    req.difficulty,
                    req.qtype,
                    req.num_questions,
                    rag_k,
                ),
            )
            if not raw_questions:
                raise ValueError("INSUFFICIENT_CONTEXT_FOR_REQUESTED_QUESTION_COUNT")

            result = await persist_generated_questions(
                db, subject, req, source_dicts, raw_questions, commit_db=False
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
