from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from .base import Base


class AppFeedback(Base):
    """General product feedback (bugs, suggestions) not tied to a single question."""

    __tablename__ = "app_feedback"

    app_feedback_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False, index=True)
    category = Column(String(40), nullable=True)
    body = Column(Text, nullable=False)
    rating = Column(Integer, nullable=True)
    submitted_on = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="app_feedback_records")
