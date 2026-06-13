from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from app.database import get_db
from app.core.security import get_current_user, require_admin, user_has_admin_role
from app.models.user import User
from app.models.past_paper import PastPaper
from app.models.past_paper_question import PastPaperQuestion
from app.schemas.past_paper_question import (
    PastPaperQuestionAdminItem,
    PastPaperQuestionUpdate,
    PastPaperQuestionResponse,
)
from app.services.past_paper_question import (
    get_past_paper_question_by_id,
    update_past_paper_question,
    delete_past_paper_question,
)

router = APIRouter()


@router.get("/", response_model=List[PastPaperQuestionAdminItem])
async def get_questions_for_paper(
    paper_id: int = Query(..., description="Past paper ID"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List questions for one past paper (auth required). Draft papers are admin-only until published."""
    pr = await db.execute(select(PastPaper).where(PastPaper.paper_id == paper_id))
    paper = pr.scalar_one_or_none()
    if not paper:
        raise HTTPException(status_code=404, detail="Past paper not found")
    if not user_has_admin_role(current_user) and not paper.is_published:
        raise HTTPException(
            status_code=403,
            detail="This past paper is not published for students yet.",
        )
    stmt = (
        select(PastPaperQuestion)
        .where(PastPaperQuestion.paper_id == paper_id)
        .order_by(PastPaperQuestion.question_id)
    )
    result = await db.execute(stmt)
    return result.scalars().all()


# --- Read by ID ---
@router.get("/{question_id}", response_model=PastPaperQuestionResponse)
async def get_question(
    question_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a specific past paper question (draft papers: admin only)."""
    question = await get_past_paper_question_by_id(db, question_id)
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    pr = await db.execute(select(PastPaper).where(PastPaper.paper_id == question.paper_id))
    paper = pr.scalar_one_or_none()
    if not paper:
        raise HTTPException(status_code=404, detail="Question not found")
    if not user_has_admin_role(current_user) and not paper.is_published:
        raise HTTPException(status_code=404, detail="Question not found")
    return question


# --- Update ---
@router.put("/{question_id}", response_model=PastPaperQuestionResponse)
async def update_question(
    question_id: int,
    updates: PastPaperQuestionUpdate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """Update a past paper question (admin only)."""
    question = await update_past_paper_question(db, question_id, updates)
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    return question


# --- Delete ---
@router.delete("/{question_id}")
async def delete_question(
    question_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """Delete a past paper question (admin only)."""
    question = await delete_past_paper_question(db, question_id)
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    return {"message": "Question deleted successfully"}