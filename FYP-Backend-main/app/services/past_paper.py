# services/past_paper_service.py

import os
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete, select, text
from sqlalchemy.exc import ProgrammingError, OperationalError
from sqlalchemy.orm import noload, selectinload
from typing import List, Optional, Dict
from app.core.config import settings
from app.models import PastPaper, PastPaperQuestion
from app.schemas.past_paper import PastPaperUpdate
import logging

logger = logging.getLogger(__name__)


async def _cleanup_predictions_for_paper_questions(db: AsyncSession, paper_id: int) -> None:
    """
    ``predictions.question_id`` may reference ``past_papers_questions`` (add_prediction_tracking migration).
    Remove those rows before deleting questions so FK constraints cannot block the paper delete.
    """
    try:
        await db.execute(
            text(
                "DELETE FROM predictions WHERE question_id IN "
                "(SELECT question_id FROM past_papers_questions WHERE paper_id = :pid)"
            ),
            {"pid": paper_id},
        )
    except (ProgrammingError, OperationalError) as e:
        logger.debug("Predictions cleanup skipped for paper %s (schema/driver): %s", paper_id, e)
        await db.rollback()


async def _cleanup_predictions_for_question(db: AsyncSession, question_id: int) -> None:
    try:
        await db.execute(
            text("DELETE FROM predictions WHERE question_id = :qid"),
            {"qid": question_id},
        )
    except (ProgrammingError, OperationalError) as e:
        logger.debug("Predictions cleanup skipped for question %s (schema/driver): %s", question_id, e)
        await db.rollback()


class PastPaperService:
    """Service for managing past papers"""

    @staticmethod
    async def get_all_past_papers(
        db: AsyncSession,
        subject_id: Optional[int] = None,
        year: Optional[int] = None,
        load_questions: bool = True,
        published_only: bool = False,
    ) -> List[PastPaper]:
        stmt = select(PastPaper)
        if load_questions:
            stmt = stmt.options(selectinload(PastPaper.questions))
        else:
            stmt = stmt.options(noload(PastPaper.questions))
        if published_only:
            stmt = stmt.where(PastPaper.is_published.is_(True))
        if subject_id:
            stmt = stmt.where(PastPaper.subject_id == subject_id)
        if year:
            stmt = stmt.where(PastPaper.year == year)
        result = await db.execute(stmt)
        return result.scalars().unique().all()


    @staticmethod
    async def get_past_paper_by_id(db: AsyncSession, paper_id: int) -> Optional[PastPaper]:
        stmt = select(PastPaper).options(selectinload(PastPaper.questions)).where(
            PastPaper.paper_id == paper_id
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def update_past_paper(
        db: AsyncSession,
        paper_id: int,
        updates: PastPaperUpdate
    ) -> Optional[PastPaper]:
        stmt = select(PastPaper).where(PastPaper.paper_id == paper_id)
        result = await db.execute(stmt)
        paper = result.scalar_one_or_none()
        if not paper:
            return None
        if updates.year is not None:
            paper.year = updates.year
        if updates.board is not None and str(updates.board).strip():
            paper.board = str(updates.board).strip()[:50]
        if updates.is_published is not None:
            paper.is_published = bool(updates.is_published)
        await db.commit()
        await db.refresh(paper)
        return paper

    @staticmethod
    async def delete_past_paper(db: AsyncSession, paper_id: int) -> bool:
        stmt = select(PastPaper).where(PastPaper.paper_id == paper_id)
        result = await db.execute(stmt)
        paper = result.scalar_one_or_none()
        if not paper:
            return False
        rel = getattr(paper, "pdf_relative_path", None) or ""
        if rel and str(rel).strip():
            try:
                root = settings.upload_dir_abs()
                pdf_abs = root / str(rel).replace("\\", "/")
                if pdf_abs.is_file():
                    pdf_abs.unlink()
            except OSError as e:
                logger.warning("Could not delete past paper PDF file: %s", e)
        await _cleanup_predictions_for_paper_questions(db, paper_id)
        await db.execute(
            delete(PastPaperQuestion).where(PastPaperQuestion.paper_id == paper_id)
        )
        await db.execute(delete(PastPaper).where(PastPaper.paper_id == paper_id))
        await db.commit()
        logger.info("Past paper deleted: paper_id=%s", paper_id)
        return True

    @staticmethod
    async def get_paper_statistics(db: AsyncSession, paper_id: int) -> Dict:
        stmt = select(PastPaper).where(PastPaper.paper_id == paper_id)
        result = await db.execute(stmt)
        paper = result.scalar_one_or_none()
        if not paper:
            raise ValueError(f"Paper {paper_id} not found")
        stmt_qs = select(PastPaperQuestion).where(PastPaperQuestion.paper_id == paper_id)
        qs_result = await db.execute(stmt_qs)
        questions = qs_result.scalars().all()
        total_questions = len(questions)
        total_marks = sum(q.marks for q in questions if q.marks) or 0
        questions_by_type = {}
        topics = set()
        questions_with_topics = 0
        questions_without_topics = 0
        for q in questions:
            q_type = q.question_type or "Unknown"
            questions_by_type[q_type] = questions_by_type.get(q_type, 0) + 1
            if q.topic:
                topics.add(q.topic)
                questions_with_topics += 1
            else:
                questions_without_topics += 1
        avg_marks = (total_marks / total_questions) if total_questions > 0 else 0
        return {
            "paper_id": paper_id,
            "subject_id": paper.subject_id,
            "year": paper.year,
            "board": paper.board,
            "total_questions": total_questions,
            "total_marks": total_marks,
            "average_marks_per_question": round(avg_marks, 2),
            "questions_by_type": questions_by_type,
            "topics": list(topics),
            "total_topics": len(topics),
            "questions_with_topics": questions_with_topics,
            "questions_without_topics": questions_without_topics
        }

    @staticmethod
    async def get_topic_distribution(
        db: AsyncSession,
        subject_id: int,
        year: Optional[int] = None
    ) -> Dict:
        logger.info(f"Getting topic distribution for subject {subject_id}")
        stmt = select(PastPaper).where(
            PastPaper.subject_id == subject_id,
            PastPaper.is_published.is_(True),
        )
        if year:
            stmt = stmt.where(PastPaper.year == year)
        result = await db.execute(stmt)
        papers = result.scalars().all()
        paper_ids = [p.paper_id for p in papers]
        if not paper_ids:
            return {"subject_id": subject_id, "year": year, "total_topics": 0, "topics": []}
        stmt_qs = select(PastPaperQuestion).where(
            PastPaperQuestion.paper_id.in_(paper_ids),
            PastPaperQuestion.topic.isnot(None)
        )
        qs_result = await db.execute(stmt_qs)
        questions = qs_result.scalars().all()
        topic_data = {}
        for q in questions:
            if q.topic not in topic_data:
                topic_data[q.topic] = {"count": 0, "marks": 0}
            topic_data[q.topic]["count"] += 1
            if q.marks:
                topic_data[q.topic]["marks"] += q.marks
        total_questions = len(questions)
        topics = []
        for topic, data in topic_data.items():
            topics.append({
                "topic": topic,
                "count": data["count"],
                "percentage": round((data["count"] / total_questions * 100), 2),
                "total_marks": data["marks"],
                "avg_marks_per_question": round((data["marks"] / data["count"]), 2) if data["count"] > 0 else 0
            })
        topics = sorted(topics, key=lambda x: x["count"], reverse=True)
        return {
            "subject_id": subject_id,
            "year": year,
            "total_topics": len(topics),
            "total_questions_with_topics": total_questions,
            "topics": topics
        }

    @staticmethod
    async def get_marks_by_topic(db: AsyncSession, subject_id: int) -> Dict:
        logger.info(f"Getting marks by topic for subject {subject_id}")
        stmt = select(PastPaper).where(
            PastPaper.subject_id == subject_id,
            PastPaper.is_published.is_(True),
        )
        result = await db.execute(stmt)
        papers = result.scalars().all()
        paper_ids = [p.paper_id for p in papers]
        if not paper_ids:
            return {"subject_id": subject_id, "total_marks": 0, "by_topic": []}
        stmt_qs = select(PastPaperQuestion).where(
            PastPaperQuestion.paper_id.in_(paper_ids),
            PastPaperQuestion.topic.isnot(None),
            PastPaperQuestion.marks.isnot(None)
        )
        qs_result = await db.execute(stmt_qs)
        questions = qs_result.scalars().all()
        topic_marks = {}
        for q in questions:
            if q.topic not in topic_marks:
                topic_marks[q.topic] = {"marks": 0, "count": 0}
            topic_marks[q.topic]["marks"] += q.marks
            topic_marks[q.topic]["count"] += 1
        total_marks = sum(data["marks"] for data in topic_marks.values())
        by_topic = []
        for topic, data in topic_marks.items():
            by_topic.append({
                "topic": topic,
                "marks": data["marks"],
                "percentage": round((data["marks"] / total_marks * 100), 2) if total_marks else 0,
                "question_count": data["count"]
            })
        by_topic = sorted(by_topic, key=lambda x: x["marks"], reverse=True)
        return {
            "subject_id": subject_id,
            "total_marks": total_marks,
            "by_topic": by_topic
        }