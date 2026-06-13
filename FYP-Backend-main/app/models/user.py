
from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .base import Base
class User(Base):
    __tablename__ = "users"

    user_id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(120), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False, default="student")
    class_level = Column(String(10), nullable=True)  # 9, 10, 11, 12
    is_active = Column(Integer, nullable=False, default=1)  # 1 for active, 0 for inactive
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    performance_records = relationship("StudentPerformance", back_populates="user")
    feedback_records = relationship("Feedback", back_populates="user")
    app_feedback_records = relationship("AppFeedback", back_populates="user")
    gamification = relationship(
        "UserGamification",
        back_populates="user",
        uselist=False,
    )
