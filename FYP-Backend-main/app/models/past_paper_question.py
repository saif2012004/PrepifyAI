
from sqlalchemy import Column, Integer, String, Text, ForeignKey, Float
from sqlalchemy.orm import relationship
from ..core.embedding_storage import get_embedding_column
from .base import Base

class PastPaperQuestion(Base):
    __tablename__ = "past_papers_questions"

    question_id = Column(Integer, primary_key=True, index=True)
    paper_id = Column(Integer, ForeignKey("past_papers.paper_id"), nullable=False)
    source_chunk_id = Column(String, ForeignKey("textbook_chunks.chunk_id"), nullable=True)
    question_text = Column(Text, nullable=False)
    question_type = Column(String(20), nullable=False)
    embedding = get_embedding_column(nullable=False)  # pgvector or JSON storage (384 dimensions)
    topic = Column(String(255), nullable=True)
    marks = Column(Float, nullable=True)

    # Relationships
    paper = relationship("PastPaper", back_populates="questions")
    source_chunk = relationship("TextbookChunk", back_populates="past_paper_questions")