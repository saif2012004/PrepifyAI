from typing import List, Optional

from pydantic import BaseModel, Field


class GamificationDelta(BaseModel):
    """Returned after a successful answer submission."""

    xp_earned: int
    total_xp: int
    level: int
    current_streak: int
    longest_streak: int
    new_badges: List[str] = Field(default_factory=list)


class GamificationProfile(BaseModel):
    user_id: int
    total_xp: int
    level: int
    current_streak: int
    longest_streak: int
    last_activity_date: Optional[str] = None
    badges: List[str] = Field(default_factory=list)
    xp_to_next_level: int


class AchievementInfo(BaseModel):
    id: str
    title: str
    description: str
    unlocked: bool


class LeaderboardEntry(BaseModel):
    rank: int
    user_id: int
    name: str
    total_xp: int
    level: int
