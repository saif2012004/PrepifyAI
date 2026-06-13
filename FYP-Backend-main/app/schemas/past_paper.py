from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from datetime import datetime

from app.schemas.past_paper_question import PastPaperQuestionResponse

# Schema for updating an existing past paper
class PastPaperUpdate(BaseModel):
    year: Optional[int] = None
    board: Optional[str] = None
    is_published: Optional[bool] = None

class PastPaperBrief(BaseModel):
    """Minimal fields for client UI (e.g. PDF button) without loading all questions."""

    paper_id: int
    has_pdf: bool = False
    is_published: bool = False

    model_config = ConfigDict(from_attributes=True)


class PastPaperSummary(BaseModel):
    """List view without nested questions (fast admin/student lists)."""

    paper_id: int
    subject_id: int
    year: int
    board: str
    is_published: bool = False
    has_pdf: bool = False

    model_config = ConfigDict(from_attributes=True)


# Schema for returning past paper data, including related questions
class PastPaperResponse(BaseModel):
    paper_id: int
    subject_id: int
    year: int
    board: str
    is_published: bool = False
    has_pdf: bool = False
    questions: Optional[List[PastPaperQuestionResponse]] = None

    model_config = ConfigDict(from_attributes=True)
