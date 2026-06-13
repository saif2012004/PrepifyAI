"""Validation rules for question generation requests (topic, exam type, qtype, difficulty)."""

from __future__ import annotations

from app.schemas.question_schema import (
    QuestionDifficulty,
    QuestionFormat,
    QuestionRequest,
    normalize_difficulty,
    normalize_qtype_to_format,
)


class QuestionValidationError(Exception):
    """Raised when a :class:`QuestionRequest` is invalid for generation."""

    def __init__(self, message: str, *, status_code: int = 422) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


class QuestionGenerationValidator:
    """Validate generation inputs before Groq/RAG (or disabled stubs)."""

    @staticmethod
    def assert_board_class_subject_consistency(req: QuestionRequest) -> None:
        """Non-empty board, class, and subject; reasonable length to block garbage requests early."""
        b = (req.board or "").strip()
        c = (req.class_level or "").strip()
        s = (req.subject or "").strip()
        if not b:
            raise QuestionValidationError("board is required")
        if len(b) > 120:
            raise QuestionValidationError("board must be at most 120 characters")
        if not c:
            raise QuestionValidationError("class_level is required")
        if len(c) > 120:
            raise QuestionValidationError("class_level must be at most 120 characters")
        if not s:
            raise QuestionValidationError("subject is required")
        if len(s) > 200:
            raise QuestionValidationError("subject must be at most 200 characters")

    @staticmethod
    def assert_valid_topic(normalized_topic: str) -> None:
        if not normalized_topic:
            raise QuestionValidationError("Error: Valid topic required")

    @staticmethod
    def assert_topic_shape(normalized_topic: str) -> None:
        """Length and shape checks after strip (syllabus alignment)."""
        if len(normalized_topic) < 2:
            raise QuestionValidationError("topic must be at least 2 characters")
        if len(normalized_topic) > 500:
            raise QuestionValidationError("topic must be at most 500 characters")

    @staticmethod
    def assert_entry_test_mcq_only(req: QuestionRequest) -> None:
        exam_type_norm = (req.exam_type or "board").strip().lower()
        qfmt = normalize_qtype_to_format(req.qtype)
        if exam_type_norm in ("mdcat", "ecat") and qfmt != QuestionFormat.mcq:
            raise QuestionValidationError(
                f"{exam_type_norm.upper()} supports MCQs only. Use qtype='MCQ'.",
            )

    @staticmethod
    def assert_known_difficulty(req: QuestionRequest) -> QuestionDifficulty:
        """Ensure difficulty string maps to easy|medium|hard (defaults handled by normalize)."""
        raw = (req.difficulty or "").strip().lower()
        if raw and raw not in ("easy", "medium", "hard"):
            raise QuestionValidationError("difficulty must be one of: easy, medium, hard")
        return normalize_difficulty(req.difficulty)

    @classmethod
    def validate_sync_request(cls, req: QuestionRequest) -> None:
        """All checks for synchronous ``POST /generate-questions/`` before subject resolution."""
        cls.assert_board_class_subject_consistency(req)
        nt = (req.topic or "").strip()
        cls.assert_valid_topic(nt)
        cls.assert_topic_shape(nt)
        cls.assert_entry_test_mcq_only(req)
        cls.assert_known_difficulty(req)

    @classmethod
    def validate_enqueue_request(cls, req: QuestionRequest) -> None:
        """Checks for async job enqueue (topic + entry-test rules)."""
        cls.assert_board_class_subject_consistency(req)
        nt = (req.topic or "").strip()
        cls.assert_valid_topic(nt)
        cls.assert_topic_shape(nt)
        cls.assert_entry_test_mcq_only(req)
        cls.assert_known_difficulty(req)
