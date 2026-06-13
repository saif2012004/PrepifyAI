
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Boolean, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .base import Base

class StudentPerformance(Base):
    __tablename__ = "student_performance"

    performance_id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    subject_id = Column(Integer, ForeignKey("subjects.subject_id"), nullable=False)
    question_id = Column(Integer, ForeignKey("generated_questions.question_id"), nullable=True)
    chapter_name = Column(String(200), nullable=True)
    topic_name = Column(String(200), nullable=True)
    user_answer = Column(Text, nullable=True)
    is_correct = Column(Boolean, nullable=True)
    time_taken = Column(Integer, nullable=True)
    score_percentage = Column(Float, nullable=True)
    attempted_on = Column(DateTime(timezone=True), server_default=func.now())
    recommendation = Column(Text, nullable=True)

    # Relationships
    user = relationship("User", back_populates="performance_records")
    subject = relationship("Subject", back_populates="performance_records")
    question = relationship("GeneratedQuestion", back_populates="performance_records")
