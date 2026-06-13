from sqlalchemy import Column, DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from .base import Base


class QuestionGenerationJob(Base):
    """Async question generation job (non-blocking API)."""

    __tablename__ = "question_generation_jobs"

    job_id = Column(String(36), primary_key=True)
    status = Column(String(20), nullable=False)  # pending, running, completed, failed
    request_json = Column(JSON, nullable=False)
    subject_id = Column(Integer, ForeignKey("subjects.subject_id"), nullable=False)
    result_json = Column(JSON, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    subject = relationship("Subject", foreign_keys=[subject_id])
