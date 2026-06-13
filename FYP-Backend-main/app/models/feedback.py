
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .base import Base

class Feedback(Base):
    __tablename__ = "feedback"

    feedback_id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    question_id = Column(Integer, ForeignKey("generated_questions.question_id"), nullable=False)
    feedback_type = Column(String(30), nullable=False)  # quality, difficulty, clarity, error
    feedback_text = Column(Text, nullable=True)
    rating = Column(Integer, nullable=True)  # 1-5 scale
    is_resolved = Column(Boolean, default=False)
    submitted_on = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    user = relationship("User", back_populates="feedback_records")
    question = relationship("GeneratedQuestion", back_populates="feedback_records")
