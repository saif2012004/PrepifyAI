
from pydantic import BaseModel, ConfigDict
from typing import Optional, List, Dict
from datetime import datetime

from app.schemas.generated_question import QuestionAnswerSubmission

class PerformanceBase(BaseModel):
    user_answer: Optional[str] = None
    is_correct: Optional[bool] = None
    time_taken: Optional[int] = None
    score_percentage: Optional[float] = None

class PerformanceCreate(PerformanceBase):
    user_id: int
    subject_id: int
    question_id: Optional[int] = None
    chapter_name: Optional[str] = None
    topic_name: Optional[str] = None

class PerformanceResponse(PerformanceBase):
    performance_id: int
    user_id: int
    subject_id: int
    question_id: Optional[int] = None
    chapter_name: Optional[str] = None
    topic_name: Optional[str] = None
    attempted_on: datetime
    recommendation: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class PerformanceAnalytics(BaseModel):
    total_attempts: int
    correct_answers: int
    accuracy_percentage: float
    average_time: Optional[float] = None
    strong_topics: List[str]
    weak_topics: List[str]
    subject_wise_performance: Dict[str, float]
    recent_trend: str  # improving, declining, stable


class DailyPerformanceRow(BaseModel):
    """Aggregated attempts for one calendar day (UTC date of attempted_on)."""

    date: str
    attempts: int
    correct: int
    accuracy_percentage: float


class RecentPerformanceDaysResponse(BaseModel):
    days: List[DailyPerformanceRow]


class PracticeTimeSubjectRow(BaseModel):
    """Aggregated ``StudentPerformance.time_taken`` (seconds summed → minutes) per subject."""

    subject_id: int
    subject_name: str
    minutes: float


class PracticeTimeBySubjectResponse(BaseModel):
    subjects: List[PracticeTimeSubjectRow]


class TestSession(BaseModel):
    subject_id: int
    questions: List[QuestionAnswerSubmission]
    total_time: Optional[int] = None

class TestResult(BaseModel):
    session_id: str
    total_questions: int
    correct_answers: int
    score_percentage: float
    time_taken: int
    performance_analysis: PerformanceAnalytics
