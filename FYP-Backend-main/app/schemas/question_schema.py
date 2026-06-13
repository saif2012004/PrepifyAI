"""
Canonical question-generation types: MCQ / short / long, difficulty, and API models.

Imported by routes, services, and repositories. Do not import application services from here.
"""

from __future__ import annotations

from enum import Enum
from typing import List

from pydantic import BaseModel, Field


class QuestionDifficulty(str, Enum):
    """Stored and requested difficulty (lowercase)."""

    easy = "easy"
    medium = "medium"
    hard = "hard"


class QuestionFormat(str, Enum):
    """Normalized question kind for generation."""

    mcq = "mcq"
    short = "short"
    long = "long"


def normalize_difficulty(value: str | None) -> QuestionDifficulty:
    raw = (value or "medium").strip().lower()
    if raw == QuestionDifficulty.easy.value:
        return QuestionDifficulty.easy
    if raw == QuestionDifficulty.hard.value:
        return QuestionDifficulty.hard
    return QuestionDifficulty.medium


def normalize_qtype_to_format(qtype: str | None) -> QuestionFormat:
    """Map free-form qtype strings to :class:`QuestionFormat`."""
    q = (qtype or "short").strip().lower()
    if q in ("mcq", "mcqs", "multiple choice", "multiple choice questions"):
        return QuestionFormat.mcq
    if q in ("long", "long question", "long questions"):
        return QuestionFormat.long
    return QuestionFormat.short


def format_to_db_question_type(fmt: QuestionFormat) -> str:
    """ORM ``question_type`` column values."""
    if fmt == QuestionFormat.mcq:
        return "MCQ"
    if fmt == QuestionFormat.long:
        return "Long"
    return "Short"


def format_to_db_difficulty_level(diff: QuestionDifficulty) -> str:
    """ORM ``difficulty_level`` column values."""
    return diff.value.capitalize()


class QuestionRequest(BaseModel):
    """User inputs for question generation."""

    board: str = Field(..., description="e.g. FBISE, Punjab, ECAT, MDCAT")
    class_level: str = Field(..., description="e.g. 9, 10, 11, 12, FSc, EntryTest")
    subject: str = Field(..., description="e.g. Biology, Chemistry, Physics, Mathematics")
    topic: str = Field(..., description="e.g. Photosynthesis, Chemical Bonding")
    difficulty: str = Field("medium", description="easy, medium, hard")
    qtype: str = Field("short", description="MCQ, short, or long")
    exam_type: str = Field(
        "board",
        description="board | mdcat | ecat (controls exam style in LLM prompt)",
    )
    num_questions: int = Field(5, ge=1, le=50, description="Number of questions to generate (1–50)")

    model_config = {
        "json_schema_extra": {
            "example": {
                "board": "FBISE",
                "class_level": "9",
                "subject": "Biology",
                "topic": "Photosynthesis",
                "difficulty": "medium",
                "qtype": "short",
                "exam_type": "board",
                "num_questions": 5,
            }
        }
    }


class GeneratedQuestionItem(BaseModel):
    question_id: int
    question_number: int
    question: str
    marks: int
    answer: str
    explanation: str | None = None
    stem: str | None = None
    options: dict[str, str] | None = None


class RetrievalSourceItem(BaseModel):
    chunk_index: int
    preview: str
    topic: str | None = None
    source_tag: str | None = None


class GeneratedQuestionsResponse(BaseModel):
    questions: List[GeneratedQuestionItem]
    retrieval_sources: List[RetrievalSourceItem] = []
    feature_disabled_notice: str | None = None
    # True when served from Redis (no duplicate DB write for this request).
    cache_hit: bool = False
    # Set when primary LLM path exceeded HARD_CAP and fallback items were returned instead.
    generation_fallback_notice: str | None = None
    # Graceful degradation when textbook context is thin or fewer questions were produced than requested.
    warning: str | None = None
    requested: int | None = None
    generated: int | None = None
    context_fallback_level: str | None = None


class TopicQuestionSetResponse(BaseModel):
    topic: str
    subject: str
    board: str
    class_level: str
    mcqs: List[GeneratedQuestionItem]
    short_questions: List[GeneratedQuestionItem]
    long_questions: List[GeneratedQuestionItem]
    retrieval_sources: List[RetrievalSourceItem] = []
    feature_disabled_notice: str | None = None


class JobQueuedResponse(BaseModel):
    job_id: str
    status: str = "pending"
    message: str = "Generation started. Poll GET /questions/generation-jobs/{job_id} until status is completed."
    poll_url: str
    feature_disabled_notice: str | None = None


class GenerationJobStatusResponse(BaseModel):
    job_id: str
    status: str
    error_message: str | None = None
    result: GeneratedQuestionsResponse | None = None
    feature_disabled_notice: str | None = None
