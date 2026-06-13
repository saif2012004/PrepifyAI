import json
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.past_paper_question import PastPaperQuestion
from app.services.past_paper import _cleanup_predictions_for_question
from app.schemas.past_paper_question import PastPaperQuestionUpdate
from app.core.embedding_storage import embedding_to_storage_format
import logging

logger = logging.getLogger(__name__)


# --- Get all ---
async def get_all_past_paper_questions(db: AsyncSession):
    """Get all past paper questions"""
    stmt = select(PastPaperQuestion)
    result = await db.execute(stmt)
    return result.scalars().all()


# --- Get by ID ---
async def get_past_paper_question_by_id(db: AsyncSession, question_id: int):
    """Get question by ID"""
    stmt = select(PastPaperQuestion).where(PastPaperQuestion.question_id == question_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


# --- Update ---
async def update_past_paper_question(
    db: AsyncSession, 
    question_id: int, 
    updates: PastPaperQuestionUpdate
):
    """Update a question"""
    stmt = select(PastPaperQuestion).where(PastPaperQuestion.question_id == question_id)
    result = await db.execute(stmt)
    question = result.scalar_one_or_none()
    
    if not question:
        return None

    data = updates.model_dump(exclude_unset=True)
    if "question_text" in data:
        question.question_text = str(data["question_text"]).strip()
    if "question_type" in data:
        question.question_type = str(data["question_type"]).strip()[:20]
    if "embedding" in data:
        emb = data["embedding"]
        question.embedding = embedding_to_storage_format(emb) if emb is not None else None
    if "topic" in data:
        t = str(data["topic"]).strip()
        question.topic = t[:255] if t else None
    if "marks" in data:
        question.marks = float(data["marks"])
    
    await db.commit()
    await db.refresh(question)
    return question


# --- Delete ---
async def delete_past_paper_question(db: AsyncSession, question_id: int):
    """Delete a question"""
    stmt = select(PastPaperQuestion).where(PastPaperQuestion.question_id == question_id)
    result = await db.execute(stmt)
    question = result.scalar_one_or_none()
    
    if not question:
        return None

    await _cleanup_predictions_for_question(db, question_id)
    await db.delete(question)
    await db.commit()
    return question