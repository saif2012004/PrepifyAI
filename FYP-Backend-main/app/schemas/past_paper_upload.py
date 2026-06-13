from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List


class PastPaperUploadRequest(BaseModel):
    """Schema for past paper upload request"""

    class_level: str = Field(..., description="Class level (9, 10, 11, 12)")
    board: str = Field(..., description="Board name (FBISE, Punjab, Sindh, etc.)")
    subject_name: str = Field(..., description="Subject name (Biology, Physics, Chemistry, etc.)")
    year: int = Field(..., description="Year of the past paper")
    publish_for_students: bool = Field(
        True,
        description="If true (default), paper is visible to students immediately. Set false for a draft until Manage catalog → Publish.",
    )


class QuestionResponse(BaseModel):
    """Extracted question summary (no embeddings in API responses)."""

    question_text: str
    question_type: str  # mcq, short, long
    marks: float

    model_config = ConfigDict(from_attributes=True)


class PastPaperUploadResponse(BaseModel):
    """Schema for successful past paper upload response"""
    paper_id: int
    subject_id: int
    class_level: str
    board: str
    subject_name: str
    year: int
    is_published: bool = False
    total_questions: int
    mcqs: int
    short_questions: int
    long_questions: int
    questions: List[QuestionResponse]

    model_config = ConfigDict(from_attributes=True)


class ValidationError(BaseModel):
    """Schema for validation errors"""
    error: str
    details: Optional[dict] = None


class BulkPastPaperUploadResponse(BaseModel):
    """Summary response for bulk past paper PDF upload."""
    uploaded_count: int
    failed_count: int
    results: List[dict]
