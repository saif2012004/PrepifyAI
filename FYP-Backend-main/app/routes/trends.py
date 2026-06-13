"""
Past-paper trend analysis endpoints.
"""

from collections import defaultdict

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.past_paper_question import PastPaperQuestion
from app.models.past_paper import PastPaper
from app.models.subject import Subject


router = APIRouter()


@router.get("/past-paper/subject-trends")
async def subject_trends(db: AsyncSession = Depends(get_db)):
    """
    Return counts of past-paper questions grouped by subject.
    Useful for seeing which subjects have most historical coverage.
    """
    stmt = (
        select(
            Subject.subject_name.label("subject"),
            func.count(PastPaperQuestion.question_id).label("question_count"),
        )
        .join(PastPaper, PastPaper.paper_id == PastPaperQuestion.paper_id)
        .join(Subject, Subject.subject_id == PastPaper.subject_id)
        .where(PastPaper.is_published.is_(True))
        .group_by(Subject.subject_name)
        .order_by(func.count(PastPaperQuestion.question_id).desc())
    )
    result = await db.execute(stmt)
    rows = result.all()
    return {
        "items": [
            {"subject": r.subject, "question_count": int(r.question_count)}
            for r in rows
        ]
    }


@router.get("/past-paper/topic-trends")
async def topic_trends(subject_id: int | None = None, db: AsyncSession = Depends(get_db)):
    """
    Return topic frequency trends from past paper questions.
    Optionally filter by subject_id.
    """
    stmt = (
        select(
            PastPaperQuestion.topic.label("topic"),
            func.count(PastPaperQuestion.question_id).label("question_count"),
        )
        .select_from(PastPaperQuestion)
        .join(PastPaper, PastPaper.paper_id == PastPaperQuestion.paper_id)
    )
    if subject_id is not None:
        stmt = stmt.where(PastPaper.subject_id == subject_id)

    stmt = (
        stmt.where(PastPaper.is_published.is_(True))
        .where(PastPaperQuestion.topic.isnot(None))
        .group_by(PastPaperQuestion.topic)
        .order_by(func.count(PastPaperQuestion.question_id).desc())
    )

    result = await db.execute(stmt)
    rows = result.all()
    return {
        "items": [
            {"topic": r.topic, "question_count": int(r.question_count)}
            for r in rows
        ]
    }


def _slope_per_year(years: list[int], counts: list[float]) -> tuple[float | None, str]:
    """Linear trend of counts vs year; sklearn if available else simple delta."""
    pairs = sorted(zip(years, counts), key=lambda x: x[0])
    if len(pairs) < 2:
        return None, "insufficient_years"
    years_s = [p[0] for p in pairs]
    counts_s = [p[1] for p in pairs]
    try:
        from sklearn.linear_model import LinearRegression
        import numpy as np

        X = np.array(years_s, dtype=float).reshape(-1, 1)
        y = np.array(counts_s, dtype=float)
        reg = LinearRegression().fit(X, y)
        return float(reg.coef_[0]), "sklearn_linear"
    except Exception:
        span = float(years_s[-1] - years_s[0]) or 1.0
        return float(counts_s[-1] - counts_s[0]) / span, "endpoint_delta"


@router.get("/past-paper/topic-momentum")
async def topic_momentum(
    subject_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """
    Per-topic counts by exam year (requires ``past_papers_questions.topic`` populated).
    Adds a momentum score (questions/year slope) for dashboard charts.
    """
    stmt = (
        select(
            PastPaperQuestion.topic.label("topic"),
            PastPaper.year.label("year"),
            func.count(PastPaperQuestion.question_id).label("cnt"),
        )
        .select_from(PastPaperQuestion)
        .join(PastPaper, PastPaper.paper_id == PastPaperQuestion.paper_id)
        .where(PastPaperQuestion.topic.isnot(None))
        .where(PastPaper.is_published.is_(True))
    )
    if subject_id is not None:
        stmt = stmt.where(PastPaper.subject_id == subject_id)

    stmt = stmt.group_by(PastPaperQuestion.topic, PastPaper.year)
    result = await db.execute(stmt)
    rows = result.all()

    by_topic: dict[str, dict[int, int]] = defaultdict(dict)
    for r in rows:
        by_topic[r.topic][int(r.year)] = int(r.cnt)

    items = []
    for topic, year_map in sorted(by_topic.items(), key=lambda x: -sum(x[1].values())):
        years = sorted(year_map.keys())
        counts = [float(year_map[y]) for y in years]
        total = sum(counts)
        slope, method = _slope_per_year(years, counts)
        items.append(
            {
                "topic": topic,
                "total_questions": int(total),
                "years": years,
                "counts_by_year": {str(y): year_map[y] for y in years},
                "momentum_per_year": slope,
                "trend_method": method,
            }
        )

    return {"items": items, "note": "Momentum uses topic labels on past paper questions; enrich topics via prediction pipeline for fuller coverage."}

