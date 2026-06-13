
from pydantic import BaseModel, ConfigDict, field_validator, model_validator
from typing import Optional, List, Dict, Any
from datetime import datetime

from app.schemas.gamification import GamificationDelta

class QuestionBase(BaseModel):
    question_text: str
    question_type: str  # MCQ, Short, Long
    difficulty_level: str  # Easy, Medium, Hard
    correct_answer: str
    explanation: Optional[str] = None

class QuestionCreate(QuestionBase):
    subject_id: int
    options: Optional[Dict[str, Any]] = None
    source_chunk_ids: Optional[List[str]] = None

class QuestionUpdate(BaseModel):
    question_text: Optional[str] = None
    difficulty_level: Optional[str] = None
    explanation: Optional[str] = None
    is_approved: Optional[str] = None

class QuestionResponse(QuestionBase):
    question_id: int
    subject_id: int
    options: Optional[Dict[str, Any]] = None
    confidence_score: Optional[float] = None
    is_approved: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class QuestionGenerationRequest(BaseModel):
    subject_id: Optional[int] = None
    subject_name: Optional[str] = None  # Alternative to subject_id - can search by name
    board_name: Optional[str] = None  # Board name (e.g., "FBISE", "PUNJAB") - used with subject_name
    class_level: Optional[str] = None  # Class level (e.g., "9", "10", "11", "12", "class9", "class10") - Recommended for precise matching
    topic_name: str
    question_type: str = "MCQ"
    difficulty_level: str = "Medium"
    count: int = 5
    
    @field_validator('subject_name', 'board_name', 'class_level', 'topic_name', mode='before')
    @classmethod
    def normalize_strings(cls, v):
        """Normalize string inputs - convert empty strings to None (except subject_name which is required)"""
        if isinstance(v, str):
            v = v.strip()
            if v == "" or v.lower() == "string" or v.lower() == "null":
                return None
        return v
    
    @field_validator('difficulty_level', mode='before')
    @classmethod
    def normalize_difficulty_level(cls, v):
        """Normalize difficulty_level to handle case variations"""
        if isinstance(v, str):
            v = v.strip()
            difficulty_map = {
                "easy": "Easy",
                "medium": "Medium",
                "hard": "Hard"
            }
            if v.lower() in difficulty_map:
                return difficulty_map[v.lower()]
        return v
    
    @field_validator('question_type', mode='before')
    @classmethod
    def normalize_question_type(cls, v):
        """Normalize question_type to handle case variations"""
        if isinstance(v, str):
            v = v.strip()
            question_type_map = {
                "mcq": "MCQ",
                "short": "Short",
                "long": "Long"
            }
            if v.lower() in question_type_map:
                return question_type_map[v.lower()]
        return v
    
    @model_validator(mode='after')
    def validate_subject(self):
        """Validate that subject_name is provided"""
        if not self.subject_id and not self.subject_name:
            raise ValueError(
                "Either subject_id (integer) or subject_name (string) must be provided. "
                "Please provide a valid subject name (e.g., 'Biology', 'Chemistry', 'Physics', "
                "'Mathematics', 'Computer Science', 'ECAT ...', 'MDCAT ...')."
            )
        if self.subject_name and (self.subject_name.lower() == "string" or not self.subject_name.strip()):
            raise ValueError(
                "subject_name is required. Please provide a valid subject name "
                "(e.g., 'Biology', 'Chemistry', 'Physics', 'Mathematics', 'Computer Science', "
                "'ECAT ...', 'MDCAT ...') not 'string'."
            )
        return self

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "subject_name": "Biology",
                "board_name": "FBISE",
                "class_level": "9",
                "topic_name": "any",
                "question_type": "MCQ",
                "difficulty_level": "Medium",
                "count": 5,
            }
        }
    )

    @field_validator('subject_id', mode='before')
    @classmethod
    def parse_subject_id(cls, v):
        """Handle subject_id - convert string numbers to int, or None for non-numeric strings"""
        if v is None:
            return None
        if isinstance(v, str):
            # If it's a string that looks like a number, try to convert
            if v.strip().isdigit():
                return int(v)
            # If it's not a number, return None (subject_name will be used instead)
            return None
        if isinstance(v, int):
            return v
        return v

class QuestionAnswerSubmission(BaseModel):
    question_id: int
    user_answer: str
    time_taken: Optional[int] = None
    mode: str = "auto"  # auto | key | ai

class QuestionAnswerResponse(BaseModel):
    is_correct: bool
    score_percentage: float
    score_marks: Optional[float] = None  # marks awarded (e.g. 3.2 out of 4)
    max_marks: Optional[float] = None    # question total marks (e.g. 4)
    explanation: Optional[str] = None
    correct_answer: str
    gamification: Optional[GamificationDelta] = None


# ---- Exam-style (past paper) generation for preparation ----

class ExamQuestionItem(BaseModel):
    """Single question in an exam section (for display as practice paper)."""
    question_number: int
    question_text: str
    question_type: str  # MCQ, Short, Long
    marks: float
    options: Optional[Dict[str, Any]] = None  # For MCQ
    correct_answer: Optional[str] = None  # For marking; can be hidden in frontend until submit


class ExamSectionResponse(BaseModel):
    """One section of an exam (e.g. Section A MCQs)."""
    section_name: str
    instruction: str
    question_type: str
    marks_per_question: float
    questions: List[ExamQuestionItem]


class ExamGenerationResponse(BaseModel):
    """Full practice exam in past-paper style (e.g. 2022 board format)."""
    title: str
    board: str
    subject_name: str
    class_level: str
    topic_name: str
    total_marks: float
    sections: List[ExamSectionResponse]


class ExamGenerationRequest(BaseModel):
    """Request to generate a full practice exam (past-paper style)."""
    subject_name: str
    board_name: Optional[str] = None  # FBISE, ECAT, MDCAT, etc.
    class_level: Optional[str] = None  # 9, 10, 11, 12, EntryTest
    topic_name: str = "any"
    exam_type: str = "FBISE_Matric"  # FBISE_Matric | FBISE_FSc | MDCAT | ECAT

    @field_validator("subject_name", "board_name", "class_level", "topic_name", mode="before")
    @classmethod
    def normalize_strings(cls, v):
        if v is None:
            return v
        if isinstance(v, str):
            v = v.strip()
            if v.lower() in ("", "string", "null"):
                return None
        return v

    @field_validator("exam_type", mode="before")
    @classmethod
    def normalize_exam_type(cls, v):
        if v is None or (isinstance(v, str) and not v.strip()):
            return "FBISE_Matric"
        if isinstance(v, str):
            v = v.strip().lower()
            mapping = {"fbise_matric": "FBISE_Matric", "fbise_fsc": "FBISE_FSc", "mdcat": "MDCAT", "ecat": "ECAT"}
            for key, label in mapping.items():
                if key in v or v == key:
                    return label
            return v.strip().title()
        return v

    @model_validator(mode="after")
    def validate_subject(self):
        if not self.subject_name or not str(self.subject_name).strip():
            raise ValueError("subject_name is required for exam generation.")
        return self
