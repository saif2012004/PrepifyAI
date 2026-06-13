"""
Gamification: XP, levels, daily streaks, achievements.
Awarded when students submit answers (see PerformanceService).
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.student_performance import StudentPerformance
from app.models.user_gamification import UserGamification

# Achievement definitions (id -> metadata)
ACHIEVEMENTS: Dict[str, Dict[str, str]] = {
    "first_step": {
        "title": "First step",
        "description": "Complete your first practice attempt.",
    },
    "on_fire": {
        "title": "On fire",
        "description": "Maintain a 3-day practice streak.",
    },
    "week_warrior": {
        "title": "Week warrior",
        "description": "Maintain a 7-day practice streak.",
    },
    "scholar": {
        "title": "Scholar",
        "description": "Earn 500 total XP.",
    },
    "master": {
        "title": "Master learner",
        "description": "Earn 2,000 total XP.",
    },
    "perfectionist": {
        "title": "Perfectionist",
        "description": "Score 95% or higher on a question.",
    },
}


def level_from_xp(total_xp: int) -> int:
    return max(1, 1 + int(total_xp) // 250)


def compute_xp_for_attempt(
    *,
    question_type: str,
    is_correct: bool,
    score_percentage: float,
    time_taken: Optional[int],
) -> int:
    xp = 5
    qt = (question_type or "").strip().upper()
    if qt == "MCQ":
        xp += 20 if is_correct else 3
    else:
        xp += int(min(100.0, max(0.0, score_percentage)) * 0.25)
        if is_correct:
            xp += 10
    if score_percentage >= 95.0:
        xp += 15
    if time_taken is not None and 0 < time_taken <= 30 and is_correct:
        xp += 5
    return max(1, min(xp, 120))


def _update_streak(last: Optional[date], today: date, current: int) -> Tuple[int, int]:
    if last is None:
        return 1, 1
    if last == today:
        return current, current
    if last == today - timedelta(days=1):
        return current + 1, current + 1
    return 1, 1


class GamificationService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _get_or_create(self, user_id: int) -> UserGamification:
        r = await self.db.execute(
            select(UserGamification).where(UserGamification.user_id == user_id)
        )
        row = r.scalar_one_or_none()
        if row:
            return row
        row = UserGamification(
            user_id=user_id,
            total_xp=0,
            current_level=1,
            current_streak=0,
            longest_streak=0,
            last_activity_date=None,
            badges=[],
        )
        self.db.add(row)
        await self.db.flush()
        return row

    async def _total_attempts(self, user_id: int) -> int:
        q = await self.db.execute(
            select(func.count()).select_from(StudentPerformance).where(
                StudentPerformance.user_id == user_id
            )
        )
        return int(q.scalar() or 0)

    def _unlock_badges(
        self,
        existing: List[str],
        *,
        total_xp: int,
        streak: int,
        attempts: int,
        score_percentage: float,
    ) -> List[str]:
        unlocked: List[str] = []
        have = set(existing or [])

        def add(bid: str) -> None:
            if bid not in have:
                have.add(bid)
                unlocked.append(bid)

        if attempts >= 1:
            add("first_step")
        if streak >= 3:
            add("on_fire")
        if streak >= 7:
            add("week_warrior")
        if total_xp >= 500:
            add("scholar")
        if total_xp >= 2000:
            add("master")
        if score_percentage >= 95.0:
            add("perfectionist")

        return unlocked

    async def apply_answer_reward(
        self,
        user_id: int,
        *,
        question_type: str,
        is_correct: bool,
        score_percentage: float,
        time_taken: Optional[int] = None,
    ) -> Dict[str, Any]:
        today = date.today()
        xp_gain = compute_xp_for_attempt(
            question_type=question_type,
            is_correct=is_correct,
            score_percentage=score_percentage,
            time_taken=time_taken,
        )

        g = await self._get_or_create(user_id)
        new_streak, _ = _update_streak(g.last_activity_date, today, g.current_streak or 0)
        g.last_activity_date = today
        g.current_streak = new_streak
        g.longest_streak = max(g.longest_streak or 0, g.current_streak)

        g.total_xp = int(g.total_xp or 0) + xp_gain
        g.current_level = level_from_xp(g.total_xp)

        attempts = await self._total_attempts(user_id)
        existing_badges = list(g.badges or [])
        new_badges = self._unlock_badges(
            existing_badges,
            total_xp=g.total_xp,
            streak=g.current_streak,
            attempts=attempts,
            score_percentage=score_percentage,
        )
        if new_badges:
            g.badges = existing_badges + new_badges

        await self.db.commit()
        await self.db.refresh(g)

        return {
            "xp_earned": xp_gain,
            "total_xp": g.total_xp,
            "level": g.current_level,
            "current_streak": g.current_streak,
            "longest_streak": g.longest_streak,
            "new_badges": new_badges,
        }

    async def get_profile(self, user_id: int) -> Dict[str, Any]:
        g = await self._get_or_create(user_id)
        await self.db.commit()
        badges = list(g.badges or [])
        next_threshold = (g.current_level) * 250
        return {
            "user_id": user_id,
            "total_xp": g.total_xp,
            "level": g.current_level,
            "current_streak": g.current_streak,
            "longest_streak": g.longest_streak,
            "last_activity_date": g.last_activity_date.isoformat()
            if g.last_activity_date
            else None,
            "badges": badges,
            "xp_to_next_level": max(0, next_threshold - g.total_xp),
        }
