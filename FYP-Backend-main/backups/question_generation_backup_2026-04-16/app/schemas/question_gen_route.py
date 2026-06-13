"""Pydantic models for POST /questions/generate-questions (shared with async job worker)."""

from typing import List

from pydantic import BaseModel, Field


class QuestionRequest(BaseModel):
    """User inputs for question generation (class, board, exam type, question type, difficulty, topic, subject, number)."""

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


class TopicQuestionSetResponse(BaseModel):
    topic: str
    subject: str
    board: str
    class_level: str
    mcqs: List[GeneratedQuestionItem]
    short_questions: List[GeneratedQuestionItem]
    long_questions: List[GeneratedQuestionItem]
    retrieval_sources: List[RetrievalSourceItem] = []


class JobQueuedResponse(BaseModel):
    job_id: str
    status: str = "pending"
    message: str = "Generation started. Poll GET /questions/generation-jobs/{job_id} until status is completed."
    poll_url: str


class GenerationJobStatusResponse(BaseModel):
    job_id: str
    status: str
    error_message: str | None = None
    result: GeneratedQuestionsResponse | None = None
