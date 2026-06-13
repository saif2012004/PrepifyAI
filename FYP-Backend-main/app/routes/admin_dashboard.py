"""Admin: aggregate stats for dashboard (replaces hardcoded UI numbers)."""

from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import require_admin_user
from app.database import get_db
from app.models.generated_question import GeneratedQuestion
from app.models.prediction import Prediction
from app.models.subject_book_pdf import SubjectBookPdf
from app.models.user import User

router = APIRouter()


@router.get("/summary")
async def admin_dashboard_summary(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin_user),
) -> Dict[str, Any]:
    pending_q = await db.scalar(
        select(func.count())
        .select_from(GeneratedQuestion)
        .where(GeneratedQuestion.is_approved == "pending")
    )
    approved_q = await db.scalar(
        select(func.count())
        .select_from(GeneratedQuestion)
        .where(GeneratedQuestion.is_approved == "approved")
    )
    total_gen = await db.scalar(select(func.count()).select_from(GeneratedQuestion))

    total_users = await db.scalar(select(func.count()).select_from(User))
    active_users = await db.scalar(
        select(func.count()).select_from(User).where(User.is_active == 1)
    )
    library_pdfs = await db.scalar(select(func.count()).select_from(SubjectBookPdf))

    avg_pred: Optional[float] = None
    raw_avg = await db.scalar(
        select(func.avg(Prediction.predictability_score)).where(
            Prediction.predictability_score.isnot(None)
        )
    )
    if raw_avg is not None:
        avg_pred = float(raw_avg)

    total_g = int(total_gen or 0)
    approved = int(approved_q or 0)
    approval_rate_pct: Optional[float] = None
    if total_g > 0:
        approval_rate_pct = round((approved / total_g) * 100.0, 1)

    return {
        "pending_ai_questions": int(pending_q or 0),
        "generated_questions_total": total_g,
        "generated_questions_approved": approved,
        "approval_rate_percent": approval_rate_pct,
        "total_users": int(total_users or 0),
        "active_users": int(active_users or 0),
        "library_pdf_count": int(library_pdfs or 0),
        "avg_predictability_score": avg_pred,
    }
