
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Boolean, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .base import Base

class Prediction(Base):
    __tablename__ = "predictions"

    prediction_id = Column(Integer, primary_key=True, index=True)
    subject_id = Column(Integer, ForeignKey("subjects.subject_id"), nullable=False)
    topic_name = Column(String(200), nullable=False)
    predicted_probability = Column(Float, nullable=False)
    exam_year = Column(Integer, nullable=False)
    actual_appeared = Column(Boolean, nullable=True)
    predictability_score = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    bertopic_metadata = Column(JSON, nullable=True)

    # Relationships
    subject = relationship("Subject", back_populates="predictions")
