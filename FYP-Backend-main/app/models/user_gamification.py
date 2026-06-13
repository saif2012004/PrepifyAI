from sqlalchemy import Column, Integer, Date, ForeignKey, JSON
from sqlalchemy.orm import relationship

from .base import Base


class UserGamification(Base):
    """Per-user XP, level, streaks, and unlocked achievement ids (JSON list)."""

    __tablename__ = "user_gamification"

    user_id = Column(Integer, ForeignKey("users.user_id"), primary_key=True)
    total_xp = Column(Integer, nullable=False, server_default="0")
    current_level = Column(Integer, nullable=False, server_default="1")
    current_streak = Column(Integer, nullable=False, server_default="0")
    longest_streak = Column(Integer, nullable=False, server_default="0")
    last_activity_date = Column(Date, nullable=True)
    badges = Column(JSON, nullable=True)

    user = relationship("User", back_populates="gamification")
