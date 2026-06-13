from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from datetime import datetime

class PastPaperQuestionUpdate(BaseModel):
    question_text: Optional[str] = None
    question_type: Optional[str] = None
    embedding: Optional[List[float]] = None
    topic: Optional[str] = None
    marks: Optional[float] = None

# Response schema (no embeddings — vectors are server-only; never expose to clients.)
class PastPaperQuestionResponse(BaseModel):
    question_id: int
    question_text: str
    question_type: str
    topic: Optional[str] = None
    marks: Optional[float] = None

    model_config = ConfigDict(from_attributes=True)


class PastPaperQuestionAdminItem(BaseModel):
    """Paper question without embedding (safe for list/edit UIs)."""

    question_id: int
    paper_id: int
    question_text: str
    question_type: str
    topic: Optional[str] = None
    marks: Optional[float] = None

    model_config = ConfigDict(from_attributes=True)