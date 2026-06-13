# schemas/feedback.py
from pydantic import BaseModel, ConfigDict, Field
from typing import Optional
from datetime import datetime

# Shared fields for create/update
class FeedbackBase(BaseModel):
    feedback_type: str  # quality, difficulty, clarity, error
    feedback_text: Optional[str] = None
    rating: Optional[int] = None  # 1-5 scale

# Schema for creating new feedback
class FeedbackCreate(FeedbackBase):
    question_id: int  # Must provide the question ID

# Schema for updating feedback (e.g., by admin)
class FeedbackUpdate(BaseModel):
    is_resolved: Optional[bool] = None

# Schema for returning feedback in responses
class FeedbackResponse(FeedbackBase):
    feedback_id: int
    user_id: int
    question_id: int
    is_resolved: bool
    submitted_on: datetime

    model_config = ConfigDict(from_attributes=True)


class AppFeedbackCreate(BaseModel):
    body: str = Field(..., min_length=8, max_length=8000)
    category: Optional[str] = Field(None, max_length=40)
    rating: Optional[int] = Field(None, ge=1, le=5)


class AppFeedbackResponse(BaseModel):
    app_feedback_id: int
    user_id: int
    category: Optional[str] = None
    body: str
    rating: Optional[int] = None
    submitted_on: datetime

    model_config = ConfigDict(from_attributes=True)