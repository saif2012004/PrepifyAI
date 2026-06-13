"""Admin: approve or reject AI-generated questions."""

from typing import List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import require_admin_user
from app.database import get_db
from app.models.generated_question import GeneratedQuestion
from app.models.user import User

router = APIRouter()


class QuestionApprovalItem(BaseModel):
    question_id: int
    subject_id: int
    question_type: str
    difficulty_level: str
    question_text: str
    is_approved: Optional[str] = None


@router.get("/pending", response_model=List[QuestionApprovalItem])
async def list_pending_questions(
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin_user),
):
    stmt = (
        select(GeneratedQuestion)
        .where(GeneratedQuestion.is_approved == "pending")
        .order_by(GeneratedQuestion.created_at.desc())
        .limit(limit)
    )
    r = await db.execute(stmt)
    rows = r.scalars().all()
    return [
        QuestionApprovalItem(
            question_id=q.question_id,
            subject_id=q.subject_id,
            question_type=q.question_type,
            difficulty_level=q.difficulty_level,
            question_text=(q.question_text or "")[:2000],
            is_approved=q.is_approved,
        )
        for q in rows
    ]


@router.patch("/{question_id}/approve")
async def approve_question(
    question_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin_user),
):
    res = await db.execute(select(GeneratedQuestion).where(GeneratedQuestion.question_id == question_id))
    q = res.scalar_one_or_none()
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")
    q.is_approved = "approved"
    await db.commit()
    return {"question_id": question_id, "is_approved": "approved"}


class RejectBody(BaseModel):
    reason: str = Field("", max_length=500)


@router.patch("/{question_id}/reject")
async def reject_question(
    question_id: int,
    body: RejectBody | None = Body(None),
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin_user),
):
    res = await db.execute(select(GeneratedQuestion).where(GeneratedQuestion.question_id == question_id))
    q = res.scalar_one_or_none()
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")
    q.is_approved = "rejected"
    await db.commit()
    return {
        "question_id": question_id,
        "is_approved": "rejected",
        "reason": body.reason if body else None,
    }
