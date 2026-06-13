"""Persistence for AI-generated practice questions (``generated_questions`` table)."""

from __future__ import annotations

import json
import logging
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.generated_question import GeneratedQuestion
from app.models.subject import Subject
from app.services.generator import repair_mcq_row_dict_before_persist
from app.schemas.question_schema import (
    GeneratedQuestionItem,
    GeneratedQuestionsResponse,
    QuestionRequest,
    RetrievalSourceItem,
    format_to_db_difficulty_level,
    format_to_db_question_type,
    normalize_difficulty,
    normalize_qtype_to_format,
)

logger = logging.getLogger(__name__)
def _normalize_persisted_explanation(value: Any) -> str | None:
    """Strip LLM explanation for DB + API; None if empty."""
    if value is None:
        return None
    s = str(value).strip()
    return s or None


class QuestionRepository:
    """Insert generated questions and build API response rows."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def persist_generated_batch(
        self,
        subject: Subject,
        req: QuestionRequest,
        source_dicts: list[dict[str, Any]],
        raw_questions: list[dict[str, Any]],
        *,
        commit_db: bool = True,
        response_extras: dict[str, Any] | None = None,
    ) -> GeneratedQuestionsResponse:
        extras = {k: v for k, v in (response_extras or {}).items() if v is not None}
        if not raw_questions:
            retrieval_sources: list[RetrievalSourceItem] = []
            for s in source_dicts or []:
                if isinstance(s, dict):
                    try:
                        retrieval_sources.append(RetrievalSourceItem(**s))
                    except Exception:
                        continue
            return GeneratedQuestionsResponse(
                questions=[],
                retrieval_sources=retrieval_sources,
                **extras,
            )

        retrieval_sources = [RetrievalSourceItem(**s) for s in source_dicts]

        fmt = normalize_qtype_to_format(req.qtype)
        question_type = format_to_db_question_type(fmt)
        diff = normalize_difficulty(req.difficulty)
        difficulty_level = format_to_db_difficulty_level(diff)

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
            if question_type == "MCQ":
                try:
                    repair_mcq_row_dict_before_persist(q)
                except ValueError as exc:
                    logger.warning("MCQ row repair skipped: %s", exc)
            try:
                marks_val = int(q.get("marks", 0) or 0)
            except (TypeError, ValueError):
                marks_val = 0
            if question_type == "MCQ" and marks_val < 1:
                marks_val = 1
            mcq_opts = q.get("mcq_options") if question_type == "MCQ" else None
            options_json = json.dumps(mcq_opts) if isinstance(mcq_opts, dict) and mcq_opts else None
            persisted_explanation = _normalize_persisted_explanation(q.get("explanation"))
            to_add.append(
                GeneratedQuestion(
                    subject_id=subject.subject_id,
                    question_text=q.get("question", ""),
                    question_type=question_type,
                    difficulty_level=difficulty_level,
                    options=options_json,
                    correct_answer=q.get("answer", ""),
                    explanation=persisted_explanation,
                    marks=marks_val if marks_val > 0 else None,
                    is_approved=approval_status,
                    generation_topic=generation_topic,
                )
            )
        self._db.add_all(to_add)
        await self._db.flush()

        items: list[GeneratedQuestionItem] = []
        for db_q, qraw in zip(to_add, raw_questions):
            mcq_opts = (qraw.get("mcq_options") or qraw.get("options")) if question_type == "MCQ" else None
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
                    explanation=_normalize_persisted_explanation(db_q.explanation),
                    stem=mcq_stem or None,
                    options=mcq_opts if isinstance(mcq_opts, dict) else None,
                )
            )

        if commit_db:
            await self._db.commit()
        else:
            await self._db.flush()
        return GeneratedQuestionsResponse(questions=items, retrieval_sources=retrieval_sources, **extras)
