"""Backward-compatible re-exports for question generation API schemas.

Prefer importing from :mod:`app.schemas.question_schema` in new code.
"""

from app.schemas.question_schema import (
    GeneratedQuestionItem,
    GeneratedQuestionsResponse,
    GenerationJobStatusResponse,
    JobQueuedResponse,
    QuestionRequest,
    RetrievalSourceItem,
    TopicQuestionSetResponse,
)

__all__ = [
    "GeneratedQuestionItem",
    "GeneratedQuestionsResponse",
    "GenerationJobStatusResponse",
    "JobQueuedResponse",
    "QuestionRequest",
    "RetrievalSourceItem",
    "TopicQuestionSetResponse",
]
