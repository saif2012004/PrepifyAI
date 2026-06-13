"""Student feedback on generated questions (quality, difficulty, etc.)."""

from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.feedback import Feedback as FeedbackModel
from app.models.app_feedback import AppFeedback
from app.models.generated_question import GeneratedQuestion
from app.schemas.feedback import (
    AppFeedbackCreate,
    AppFeedbackResponse,
    FeedbackCreate,
    FeedbackResponse,
)

router = APIRouter()

_ALLOWED_TYPES = frozenset({"quality", "difficulty", "clarity", "error"})
_APP_CATEGORIES = frozenset({"general", "bug", "suggestion", "content", "other"})


@router.post("/", response_model=FeedbackResponse, status_code=status.HTTP_201_CREATED)
async def submit_feedback(
    body: FeedbackCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ft = (body.feedback_type or "").strip().lower()
    if ft not in _ALLOWED_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f"feedback_type must be one of: {', '.join(sorted(_ALLOWED_TYPES))}",
        )
    if body.rating is not None and not (1 <= body.rating <= 5):
        raise HTTPException(status_code=422, detail="rating must be 1–5 when provided")

    q = await db.execute(
        select(GeneratedQuestion).where(GeneratedQuestion.question_id == body.question_id)
    )
    if q.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Question not found")

    row = FeedbackModel(
        user_id=current_user.user_id,
        question_id=body.question_id,
        feedback_type=ft,
        feedback_text=(body.feedback_text or "").strip() or None,
        rating=body.rating,
        is_resolved=False,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


@router.get("/me", response_model=List[FeedbackResponse])
async def my_feedback(
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Recent feedback rows submitted by the current user."""
    lim = limit
    stmt = (
        select(FeedbackModel)
        .where(FeedbackModel.user_id == current_user.user_id)
        .order_by(FeedbackModel.submitted_on.desc())
        .limit(lim)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.post("/app", response_model=AppFeedbackResponse, status_code=status.HTTP_201_CREATED)
async def submit_app_feedback(
    body: AppFeedbackCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """General feedback about the app (not tied to a question)."""
    text = (body.body or "").strip()
    if len(text) < 8:
        raise HTTPException(status_code=422, detail="Please write a bit more detail (at least 8 characters).")

    cat = None
    if body.category:
        c = body.category.strip().lower()
        if c not in _APP_CATEGORIES:
            raise HTTPException(
                status_code=422,
                detail=f"category must be one of: {', '.join(sorted(_APP_CATEGORIES))}",
            )
        cat = c

    row = AppFeedback(
        user_id=current_user.user_id,
        category=cat,
        body=text[:8000],
        rating=body.rating,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


@router.get("/app/me", response_model=List[AppFeedbackResponse])
async def my_app_feedback(
    limit: int = Query(20, ge=1, le=50),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(AppFeedback)
        .where(AppFeedback.user_id == current_user.user_id)
        .order_by(AppFeedback.submitted_on.desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())
