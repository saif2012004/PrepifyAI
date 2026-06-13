"""
Performance & analytics for logged-in students.
"""

from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.user import User
from app.models.student_performance import StudentPerformance
from app.schemas.student_performance import (
    PerformanceAnalytics,
    RecentPerformanceDaysResponse,
    PracticeTimeBySubjectResponse,
    PracticeTimeSubjectRow,
)
from app.services.performance_service import PerformanceService
from app.core.security import get_current_user
from app.utils.performance_topic_label import label_for_performance_topic


router = APIRouter()


@router.get("/summary", response_model=PerformanceAnalytics)
async def get_performance_summary(
    subject_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Overall performance summary for the logged-in user.
    Optionally filter by subject_id.
    """
    service = PerformanceService(db)
    return await service.get_user_analytics(
        user_id=current_user.user_id,
        subject_id=subject_id,
    )


@router.get("/recent-days", response_model=RecentPerformanceDaysResponse)
async def get_performance_recent_days(
    days: int = Query(7, ge=1, le=90),
    subject_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Daily attempt counts and accuracy for the logged-in student (UTC calendar days).
    """
    service = PerformanceService(db)
    rows = await service.get_recent_daily_performance(
        user_id=current_user.user_id,
        days=days,
        subject_id=subject_id,
    )
    return RecentPerformanceDaysResponse(days=rows)


@router.get("/practice-time-by-subject", response_model=PracticeTimeBySubjectResponse)
async def get_practice_time_by_subject(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Minutes spent per subject from summed ``time_taken`` on performance rows (question practice only).
    """
    service = PerformanceService(db)
    rows = await service.get_practice_time_minutes_by_subject(current_user.user_id)
    return PracticeTimeBySubjectResponse(
        subjects=[PracticeTimeSubjectRow(**r) for r in rows]
    )


@router.get("/by-topic")
async def get_performance_by_topic(
    subject_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Topic-wise performance for a subject for the logged-in user.
    """
    result = await db.execute(
        select(StudentPerformance).where(
            StudentPerformance.user_id == current_user.user_id,
            StudentPerformance.subject_id == subject_id,
        )
    )
    performances: List[StudentPerformance] = result.scalars().all()

    topics: Dict[str, Dict[str, Any]] = {}
    for p in performances:
        t = label_for_performance_topic(p.topic_name, p.chapter_name)
        if t not in topics:
            topics[t] = {
                "topic_name": t,
                "attempts": 0,
                "correct": 0,
                "total_score": 0.0,
                "total_time": 0,
            }
        topics[t]["attempts"] += 1
        if p.is_correct:
            topics[t]["correct"] += 1
        if p.score_percentage is not None:
            topics[t]["total_score"] += float(p.score_percentage)
        if p.time_taken:
            topics[t]["total_time"] += p.time_taken

    out = []
    for t, agg in topics.items():
        attempts = agg["attempts"]
        correct = agg["correct"]
        avg_score = (agg["total_score"] / attempts) if attempts else 0.0
        avg_time = (agg["total_time"] / attempts) if attempts else 0
        accuracy = (correct / attempts) * 100 if attempts else 0.0
        out.append(
            {
                "topic_name": t,
                "attempts": attempts,
                "correct": correct,
                "accuracy": round(accuracy, 1),
                "avg_score": round(avg_score, 1),
                "avg_time": avg_time,
            }
        )

    return {"topics": out}

