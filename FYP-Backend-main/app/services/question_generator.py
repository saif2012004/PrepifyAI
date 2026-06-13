"""
Orchestration entry points for AI question generation (MCQ, short, long; easy/medium/hard).

Delegates persistence to :class:`app.repositories.question_repository.QuestionRepository`
and blocking LLM work to :mod:`app.services.question_generation_pipeline`.
"""

from __future__ import annotations

from app.schemas.question_schema import GeneratedQuestionsResponse, QuestionRequest
from app.services.question_generation_feature import DISABLED_MESSAGE, is_question_generation_enabled


class QuestionGenerator:
    """Facade for feature flags, exam labels, and disabled payloads."""

    @staticmethod
    def is_enabled() -> bool:
        return is_question_generation_enabled()

    @staticmethod
    def disabled_response() -> GeneratedQuestionsResponse:
        return GeneratedQuestionsResponse(
            questions=[],
            retrieval_sources=[],
            feature_disabled_notice=DISABLED_MESSAGE,
            cache_hit=False,
            generation_fallback_notice=None,
        )

    @staticmethod
    def disabled_notice() -> str:
        """Same string as ``feature_disabled_notice`` on :meth:`disabled_response`."""
        return DISABLED_MESSAGE

    @staticmethod
    def exam_prompt_label(req: QuestionRequest) -> str:
        """String passed to the LLM as the exam/board context."""
        et = (req.exam_type or "board").strip().lower()
        if et == "mdcat":
            return f"MDCAT Entry Test | Board: {req.board} | Class: {req.class_level}"
        if et == "ecat":
            return f"ECAT Engineering Entry Test | Board: {req.board} | Class: {req.class_level}"
        return f"{req.board} Class {req.class_level}"


__all__ = ["QuestionGenerator"]
