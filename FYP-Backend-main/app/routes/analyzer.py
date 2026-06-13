"""Analytics / performance analyzer endpoints."""
from typing import Optional
from fastapi import APIRouter, Depends
from app.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.services.performance_service import PerformanceService
from app.schemas.student_performance import PerformanceAnalytics
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


@router.get("/analytics", response_model=PerformanceAnalytics)
async def get_my_analytics(
    subject_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get performance analytics for the current user (optionally filtered by subject)."""
    service = PerformanceService(db)
    return await service.get_user_analytics(current_user.user_id, subject_id)
