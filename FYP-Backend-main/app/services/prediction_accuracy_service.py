"""
Compare historical past-paper forecasts (all papers strictly before exam year)
against topics inferred from the target exam paper — precision / recall / F1 and
persist rows on ``predictions`` for admin dashboards.
"""

from __future__ import annotations

import difflib
import logging
from typing import Any, Dict, List, Optional, Set, Tuple

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.past_paper import PastPaper
from app.models.past_paper_question import PastPaperQuestion
from app.models.prediction import Prediction
from app.models.textbook_chunk import TextbookChunk
from app.services.prediction_service import TopicPredictionService, TopicSelectionService

logger = logging.getLogger(__name__)


def _norm_topic(t: str) -> str:
    return " ".join((t or "").lower().split())


def _topics_match(a: str, b: str, threshold: float = 0.82) -> bool:
    na, nb = _norm_topic(a), _norm_topic(b)
    if not na or not nb:
        return False
    if na == nb:
        return True
    return difflib.SequenceMatcher(None, na, nb).ratio() >= threshold


def _forecast_actual_sets(
    forecast_topics: List[Dict[str, Any]],
    actual_topics: List[Dict[str, Any]],
    top_n_forecast: int,
    top_n_actual: int,
) -> Tuple[Set[str], Set[str]]:
    fset = {t["topic_name"] for t in forecast_topics[:top_n_forecast]}
    aset = {t["topic_name"] for t in actual_topics[:top_n_actual]}
    return fset, aset


def _intersection_fuzzy(forecast: Set[str], actual: Set[str]) -> Set[str]:
    hit: Set[str] = set()
    for ft in forecast:
        for at in actual:
            if _topics_match(ft, at):
                hit.add(ft)
                break
    return hit


def _precision_recall_f1(forecast: Set[str], actual: Set[str], inter: Set[str]) -> Tuple[float, float, float]:
    if not forecast and not actual:
        return 1.0, 1.0, 1.0
    p = len(inter) / len(forecast) if forecast else 0.0
    r = len(inter) / len(actual) if actual else 0.0
    if p + r == 0:
        f1 = 0.0
    else:
        f1 = 2.0 * p * r / (p + r)
    return p, r, f1


async def _topic_candidates(db: AsyncSession, subject_id: int) -> List[str]:
    stmt = (
        select(TextbookChunk.topic_name)
        .where(
            TextbookChunk.subject_id == subject_id,
            TextbookChunk.topic_name.isnot(None),
        )
        .distinct()
        .limit(200)
    )
    r = await db.execute(stmt)
    out = [row[0] for row in r.fetchall() if row and row[0]]
    if not out:
        stmt2 = (
            select(TextbookChunk.topic_name)
            .where(TextbookChunk.topic_name.isnot(None))
            .distinct()
            .limit(300)
        )
        r2 = await db.execute(stmt2)
        out = [row[0] for row in r2.fetchall() if row and row[0]]
    return out


async def _questions_for_papers(db: AsyncSession, paper_ids: List[int]) -> List[str]:
    if not paper_ids:
        return []
    stmt = select(PastPaperQuestion.question_text).where(
        PastPaperQuestion.paper_id.in_(paper_ids),
        PastPaperQuestion.question_text.isnot(None),
    )
    r = await db.execute(stmt)
    return [row[0] for row in r.fetchall() if row[0] and len(row[0].strip()) > 8]


async def evaluate_paper_vs_historical_forecast(
    db: AsyncSession,
    service: TopicPredictionService,
    *,
    paper_id: int,
    class_level: str,
    top_n_forecast: int = 20,
    top_n_actual: int = 20,
) -> Dict[str, Any]:
    stmt_p = select(PastPaper).where(PastPaper.paper_id == paper_id)
    r = await db.execute(stmt_p)
    target = r.scalar_one_or_none()
    if not target:
        raise ValueError("Past paper not found")

    subject_id = target.subject_id
    exam_year = target.year

    stmt_hist_ids = select(PastPaper.paper_id).where(
        PastPaper.subject_id == subject_id,
        PastPaper.year < exam_year,
    )
    rids = await db.execute(stmt_hist_ids)
    hist_ids = [row[0] for row in rids.fetchall()]
    if not hist_ids:
        raise ValueError(
            "No older past papers for this subject; add papers from years before "
            f"{exam_year} to run leave-one-year-out evaluation."
        )

    topic_candidates = await _topic_candidates(db, subject_id)
    use_distilbert = class_level in service.models and service.is_ready()

    hist_questions = await _questions_for_papers(db, hist_ids)
    if not hist_questions:
        raise ValueError("No question text in historical papers for this subject.")

    actual_questions = await _questions_for_papers(db, [paper_id])
    if not actual_questions:
        raise ValueError("No question text on the target past paper.")

    hist_preds = service.batch_predict_topics(
        hist_questions,
        class_level,
        top_k=5,
        confidence_threshold=0.1,
        topic_candidates=(topic_candidates if not use_distilbert else None),
    )
    actual_preds = service.batch_predict_topics(
        actual_questions,
        class_level,
        top_k=5,
        confidence_threshold=0.1,
        topic_candidates=(topic_candidates if not use_distilbert else None),
    )

    forecast_agg = TopicSelectionService.aggregate_predictions(hist_preds, method="confidence_weighted")
    actual_agg = TopicSelectionService.aggregate_predictions(actual_preds, method="confidence_weighted")

    fset, aset = _forecast_actual_sets(forecast_agg, actual_agg, top_n_forecast, top_n_actual)
    inter = _intersection_fuzzy(fset, aset)
    precision, recall, f1 = _precision_recall_f1(fset, aset, inter)

    meta = {
        "method": "leave_historical_out",
        "target_paper_id": paper_id,
        "exam_year": exam_year,
        "subject_id": subject_id,
        "historical_paper_count": len(hist_ids),
        "historical_question_count": len(hist_questions),
        "actual_question_count": len(actual_questions),
        "top_n_forecast": top_n_forecast,
        "top_n_actual": top_n_actual,
        "forecast_topic_sample": list(fset),
        "actual_topic_sample": list(aset),
        "matched_forecast_topics": list(inter),
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
        "predictability_score": round(f1, 4),
    }

    await db.execute(
        delete(Prediction).where(
            Prediction.subject_id == subject_id,
            Prediction.exam_year == exam_year,
        )
    )

    max_score = max((t["score"] for t in forecast_agg[:top_n_forecast]), default=1.0) or 1.0
    for t in forecast_agg[:top_n_forecast]:
        name = t["topic_name"]
        prob = min(1.0, max(0.0, float(t["score"]) / max_score))
        appeared = any(_topics_match(name, a) for a in aset)
        row = Prediction(
            subject_id=subject_id,
            topic_name=name[:200],
            predicted_probability=prob,
            exam_year=exam_year,
            actual_appeared=appeared,
            predictability_score=f1,
            bertopic_metadata=meta,
        )
        db.add(row)

    await db.commit()

    logger.info(
        "Predictability evaluated subject=%s year=%s f1=%.3f papers_hist=%s",
        subject_id,
        exam_year,
        f1,
        len(hist_ids),
    )

    return meta


async def list_accuracy_runs(
    db: AsyncSession,
    *,
    subject_id: Optional[int] = None,
    limit: int = 20,
) -> List[Dict[str, Any]]:
    stmt = select(Prediction).order_by(Prediction.created_at.desc())
    if subject_id is not None:
        stmt = stmt.where(Prediction.subject_id == subject_id)
    stmt = stmt.limit(limit * 15)
    r = await db.execute(stmt)
    rows = r.scalars().all()

    seen: set[Tuple[int, int]] = set()
    out: List[Dict[str, Any]] = []
    for row in rows:
        key = (row.subject_id, row.exam_year)
        if key in seen:
            continue
        seen.add(key)
        meta = row.bertopic_metadata or {}
        out.append(
            {
                "subject_id": row.subject_id,
                "exam_year": row.exam_year,
                "predictability_score": row.predictability_score,
                "created_at": row.created_at.isoformat() if row.created_at else None,
                "precision": meta.get("precision"),
                "recall": meta.get("recall"),
                "f1": meta.get("f1"),
                "historical_paper_count": meta.get("historical_paper_count"),
                "target_paper_id": meta.get("target_paper_id"),
            }
        )
        if len(out) >= limit:
            break
    return out
