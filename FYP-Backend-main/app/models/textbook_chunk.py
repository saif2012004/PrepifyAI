
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
# from pgvector.sqlalchemy import Vector
from .base import Base

class TextbookChunk(Base):
    __tablename__ = "textbook_chunks"

    chunk_id = Column(String, primary_key=True, index=True)
    subject_id = Column(Integer, ForeignKey("subjects.subject_id"), nullable=False)
    chapter_name = Column(String(200), nullable=False)
    topic_name = Column(String(200), nullable=False)
    text_content = Column(Text, nullable=False)
    page_start = Column(Integer, nullable=True)
    page_end = Column(Integer, nullable=True)
    token_count = Column(Integer, nullable=True)
    embedding = Column(Text, nullable=True)
    added_on = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    subject = relationship("Subject", back_populates="textbook_chunks")
    generated_questions = relationship("GeneratedQuestion", back_populates="source_chunks", secondary="question_chunks")
    past_paper_questions = relationship("PastPaperQuestion", back_populates="source_chunk")
