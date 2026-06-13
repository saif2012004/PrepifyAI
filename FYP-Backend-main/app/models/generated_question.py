
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Float, Table
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .base import Base

# Association table for many-to-many relationship between questions and chunks
question_chunks = Table(
    'question_chunks',
    Base.metadata,
    Column('question_id', Integer, ForeignKey('generated_questions.question_id')),
    Column('chunk_id', String, ForeignKey('textbook_chunks.chunk_id'))
)

class GeneratedQuestion(Base):
    __tablename__ = "generated_questions"

    question_id = Column(Integer, primary_key=True, index=True)
    subject_id = Column(Integer, ForeignKey("subjects.subject_id"), nullable=False)
    question_text = Column(Text, nullable=False)
    question_type = Column(String(20), nullable=False)  # MCQ, Short, Long
    difficulty_level = Column(String(20), nullable=False)  # Easy, Medium, Hard
    options = Column(Text, nullable=True)  # JSON for MCQ options
    correct_answer = Column(Text, nullable=False)
    explanation = Column(Text, nullable=True)
    marks = Column(Integer, nullable=True)  # max marks for this question (e.g. 4, 5, 10)
    # User-facing practice label (e.g. generate-questions "topic"); used when chunk links are missing.
    generation_topic = Column(String(200), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    is_approved = Column(String(20), default="approved")

    # Relationships
    subject = relationship("Subject", back_populates="generated_questions")
    source_chunks = relationship("TextbookChunk", back_populates="generated_questions", secondary=question_chunks)
    performance_records = relationship("StudentPerformance", back_populates="question")
    feedback_records = relationship("Feedback", back_populates="question")