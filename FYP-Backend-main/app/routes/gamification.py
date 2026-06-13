from typing import List

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.database import get_db
from app.models.user import User
from app.models.user_gamification import UserGamification
from app.schemas.gamification import AchievementInfo, GamificationProfile, LeaderboardEntry
from app.services.gamification_service import ACHIEVEMENTS, GamificationService

router = APIRouter()


@router.get("/me", response_model=GamificationProfile)
async def get_my_gamification(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = GamificationService(db)
    data = await svc.get_profile(current_user.user_id)
    return GamificationProfile(**data)


@router.get("/achievements", response_model=List[AchievementInfo])
async def list_achievements(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = GamificationService(db)
    profile = await svc.get_profile(current_user.user_id)
    unlocked = set(profile.get("badges") or [])
    out: List[AchievementInfo] = []
    for aid, meta in ACHIEVEMENTS.items():
        out.append(
            AchievementInfo(
                id=aid,
                title=meta["title"],
                description=meta["description"],
                unlocked=aid in unlocked,
            )
        )
    return sorted(out, key=lambda x: x.id)


@router.get("/leaderboard", response_model=List[LeaderboardEntry])
async def leaderboard(
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Top learners by XP. Authenticated users only (simple privacy gate).
    """
    stmt = (
        select(UserGamification, User.name)
        .join(User, User.user_id == UserGamification.user_id)
        .where(User.role == "student")
        .order_by(UserGamification.total_xp.desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    rows = result.all()
    if not rows:
        return []

    from app.services.gamification_service import level_from_xp

    entries: List[LeaderboardEntry] = []
    for rank, (g, name) in enumerate(rows, start=1):
        lvl = g.current_level or level_from_xp(g.total_xp or 0)
        entries.append(
            LeaderboardEntry(
                rank=rank,
                user_id=g.user_id,
                name=(name or "Student")[:80],
                total_xp=int(g.total_xp or 0),
                level=int(lvl),
            )
        )
    return entries
