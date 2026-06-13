
from sqlalchemy import Boolean, Column, Integer, String, DateTime, ForeignKey, Text, false
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .base import Base

class PastPaper(Base):
    __tablename__ = "past_papers"

    paper_id = Column(Integer, primary_key=True, index=True)
    subject_id = Column(Integer, ForeignKey("subjects.subject_id"), nullable=False)
    year = Column(Integer, nullable=False)
    board = Column(String(50), nullable=False)
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now())
    # False until admin publishes — students only see published papers.
    is_published = Column(Boolean, nullable=False, server_default=false())
    # Relative to UPLOAD_DIR, e.g. past_papers/42.pdf — for student PDF viewing (no embeddings exposed).
    pdf_relative_path = Column(String(512), nullable=True)

    # Relationships
    subject = relationship("Subject", back_populates="past_papers")
    questions = relationship("PastPaperQuestion", back_populates="paper")

    @property
    def has_pdf(self) -> bool:
        p = self.pdf_relative_path
        return bool(p and str(p).strip())
