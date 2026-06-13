"""Blocking Groq + RAG pipeline and DB persistence (used by sync route and async job worker)."""

from __future__ import annotations

import json
import logging
from typing import Any, List

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.generated_question import GeneratedQuestion
from app.models.subject import Subject
from app.schemas.question_gen_route import (
    GeneratedQuestionItem,
    GeneratedQuestionsResponse,
    QuestionRequest,
    RetrievalSourceItem,
)
from app.services.generator import generate_questions
from app.utils.retriever import retrieve_context_and_sources

logger = logging.getLogger(__name__)


def sync_generate_question_batch(
    topic: str,
    subject: str,
    exam: str,
    difficulty: str,
    qtype: str,
    num_questions: int,
    rag_k: int,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """CPU/GPU + blocking Groq I/O. Run via asyncio.to_thread or thread pool."""
    context, source_dicts = retrieve_context_and_sources(topic, k=rag_k)
    source_chunk_ids = [
        str(s.get("chunk_index"))
        for s in source_dicts
        if isinstance(s, dict) and s.get("chunk_index") is not None
    ]
    raw_questions = generate_questions(
        topic=topic,
        subject=subject,
        exam=exam,
        difficulty=difficulty,
        qtype=qtype,
        num_questions=num_questions,
        context=context,
        source_chunk_ids=source_chunk_ids,
    )
    return source_dicts, raw_questions


async def persist_generated_questions(
    db: AsyncSession,
    subject: Subject,
    req: QuestionRequest,
    source_dicts: list[dict[str, Any]],
    raw_questions: list[dict[str, Any]],
    *,
    commit_db: bool = True,
) -> GeneratedQuestionsResponse:
    """Insert GeneratedQuestion rows and return API response shape."""
    if not raw_questions:
        raise ValueError("No questions produced.")

    retrieval_sources = [RetrievalSourceItem(**s) for s in source_dicts]

    qtype_norm = (req.qtype or "short").strip().lower()
    if qtype_norm in ("mcq", "mcqs", "multiple choice", "multiple choice questions"):
        question_type = "MCQ"
    elif qtype_norm in ("long", "long question", "long questions"):
        question_type = "Long"
    else:
        question_type = "Short"

    diff_norm = (req.difficulty or "medium").strip().lower()
    if diff_norm == "easy":
        difficulty_level = "Easy"
    elif diff_norm == "hard":
        difficulty_level = "Hard"
    else:
        difficulty_level = "Medium"

    approval_status = (
        "pending" if getattr(settings, "REQUIRE_GENERATED_QUESTION_APPROVAL", False) else "approved"
    )

    raw_topic = (req.topic or "").strip()
    if raw_topic.lower() in ("", "any", "general"):
        subj = (req.subject or "").strip()
        generation_topic = subj[:200] if subj else None
    else:
        generation_topic = raw_topic[:200] if raw_topic else None

    to_add: list[GeneratedQuestion] = []
    for q in raw_questions:
        try:
            marks_val = int(q.get("marks", 0) or 0)
        except (TypeError, ValueError):
            marks_val = 0
        if question_type == "MCQ" and marks_val < 1:
            marks_val = 1
        mcq_opts = q.get("mcq_options") if question_type == "MCQ" else None
        options_json = json.dumps(mcq_opts) if isinstance(mcq_opts, dict) and mcq_opts else None
        to_add.append(
            GeneratedQuestion(
                subject_id=subject.subject_id,
                question_text=q.get("question", ""),
                question_type=question_type,
                difficulty_level=difficulty_level,
                options=options_json,
                correct_answer=q.get("answer", ""),
                explanation=None,
                marks=marks_val if marks_val > 0 else None,
                is_approved=approval_status,
                generation_topic=generation_topic,
            )
        )
    db.add_all(to_add)
    await db.flush()

    items: list[GeneratedQuestionItem] = []
    for db_q, qraw in zip(to_add, raw_questions):
        mcq_opts = qraw.get("mcq_options") if question_type == "MCQ" else None
        mcq_stem = (qraw.get("mcq_stem") or "").strip() if question_type == "MCQ" else ""
        disp_marks = int(db_q.marks) if db_q.marks is not None else 0
        if question_type == "MCQ" and disp_marks < 1:
            disp_marks = 1
        items.append(
            GeneratedQuestionItem(
                question_id=db_q.question_id,
                question_number=int(qraw.get("question_number", len(items) + 1)),
                question=qraw.get("question", ""),
                marks=disp_marks,
                answer=qraw.get("answer", ""),
                explanation=(qraw.get("explanation") or None),
                stem=mcq_stem or None,
                options=mcq_opts if isinstance(mcq_opts, dict) else None,
            )
        )

    if commit_db:
        await db.commit()
    else:
        await db.flush()
    return GeneratedQuestionsResponse(questions=items, retrieval_sources=retrieval_sources)
