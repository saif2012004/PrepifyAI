# routes/past_paper.py — admin + read for past papers under /past-papers/manage

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import IntegrityError
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional

from sqlalchemy import select

from app.core.config import settings
from app.database import get_db
from app.core.security import get_current_user, require_admin, user_has_admin_role
from app.models.user import User
from app.models.past_paper import PastPaper
from app.schemas.past_paper import PastPaperBrief, PastPaperResponse, PastPaperSummary, PastPaperUpdate
from app.services.past_paper import PastPaperService

router = APIRouter()


@router.get("/", response_model=List[PastPaperSummary])
async def get_all_past_papers(
    subject_id: Optional[int] = Query(None),
    year: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List past papers (optional filters). Requires login. Lightly loaded (no question bodies).

    Students see only published papers; admins see drafts too.

    Example: GET /past-papers/manage?subject_id=1&year=2024
    """
    published_only = not user_has_admin_role(current_user)
    papers = await PastPaperService.get_all_past_papers(
        db, subject_id, year, load_questions=False, published_only=published_only
    )
    # Build explicitly so ``has_pdf`` matches DB (Pydantic from_attributes + ``@property`` can miss on some versions).
    return [
        PastPaperSummary(
            paper_id=p.paper_id,
            subject_id=p.subject_id,
            year=p.year,
            board=p.board,
            is_published=bool(p.is_published),
            has_pdf=bool((getattr(p, "pdf_relative_path", None) or "").strip()),
        )
        for p in papers
    ]


@router.get("/{paper_id}/brief", response_model=PastPaperBrief)
async def get_past_paper_brief(
    paper_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lightweight: ``has_pdf`` / published flags only (no question bodies)."""
    pr = await db.execute(select(PastPaper).where(PastPaper.paper_id == paper_id))
    row = pr.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Past paper not found")
    if not user_has_admin_role(current_user) and not row.is_published:
        raise HTTPException(status_code=404, detail="Past paper not found")
    return PastPaperBrief(
        paper_id=row.paper_id,
        has_pdf=bool((getattr(row, "pdf_relative_path", None) or "").strip()),
        is_published=bool(row.is_published),
    )


@router.get("/{paper_id}/statistics")
async def get_paper_statistics(
    paper_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Statistics for one paper (defined before /{paper_id} so paths don't clash)."""
    pr = await db.execute(select(PastPaper).where(PastPaper.paper_id == paper_id))
    row = pr.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Past paper not found")
    if not user_has_admin_role(current_user) and not row.is_published:
        raise HTTPException(status_code=404, detail="Past paper not found")
    try:
        return await PastPaperService.get_paper_statistics(db, paper_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _past_paper_pdf_abs_path(relative: str) -> Path:
    return settings.upload_dir_abs() / relative.replace("\\", "/")


@router.get("/{paper_id}/pdf")
async def download_past_paper_pdf(
    paper_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Download the original past-paper PDF (auth required).
    Students may only download published papers. Embeddings are never included in PDFs.
    """
    pr = await db.execute(select(PastPaper).where(PastPaper.paper_id == paper_id))
    row = pr.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Past paper not found")
    if not user_has_admin_role(current_user) and not row.is_published:
        raise HTTPException(status_code=404, detail="Past paper not found")
    rel = (row.pdf_relative_path or "").strip()
    if not rel:
        raise HTTPException(
            status_code=404,
            detail="No PDF on file for this paper (uploaded before PDF storage or copy failed).",
        )
    path = _past_paper_pdf_abs_path(rel)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="PDF file missing on server")
    fname = f"past-paper-{paper_id}.pdf"
    return FileResponse(path=str(path), media_type="application/pdf", filename=fname)


@router.get("/{paper_id}", response_model=PastPaperResponse)
async def get_past_paper(
    paper_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get one past paper by ID."""
    paper = await PastPaperService.get_past_paper_by_id(db, paper_id)
    if not paper:
        raise HTTPException(status_code=404, detail="Past paper not found")
    if not user_has_admin_role(current_user) and not paper.is_published:
        raise HTTPException(status_code=404, detail="Past paper not found")
    out = PastPaperResponse.model_validate(paper, from_attributes=True)
    return out.model_copy(
        update={"has_pdf": bool((getattr(paper, "pdf_relative_path", None) or "").strip())}
    )


@router.put("/{paper_id}", response_model=PastPaperResponse)
async def update_past_paper(
    paper_id: int,
    updates: PastPaperUpdate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """Update year/board/published (admin only)."""
    paper = await PastPaperService.update_past_paper(db, paper_id, updates)
    if not paper:
        raise HTTPException(status_code=404, detail="Past paper not found")
    return paper


async def _delete_past_paper_admin(db: AsyncSession, paper_id: int) -> dict:
    """Shared implementation for DELETE and POST remove (some clients block HTTP DELETE)."""
    try:
        success = await PastPaperService.delete_past_paper(db, paper_id)
    except IntegrityError as e:
        await db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Could not delete this past paper because other data still references it. "
            "Try again after a moment, or check server logs.",
        ) from e
    if not success:
        raise HTTPException(status_code=404, detail="Past paper not found")
    return {"message": "Past paper deleted successfully"}


@router.delete("/{paper_id}")
async def delete_past_paper(
    paper_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """Delete a past paper and its questions (admin only)."""
    return await _delete_past_paper_admin(db, paper_id)


@router.post("/{paper_id}/delete")
async def delete_past_paper_post(
    paper_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """Same as ``DELETE /{paper_id}`` — use when DELETE is blocked by a proxy or client stack."""
    return await _delete_past_paper_admin(db, paper_id)


@router.get("/{subject_id}/topic-distribution")
async def get_topic_distribution(
    subject_id: int,
    year: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    try:
        return await PastPaperService.get_topic_distribution(db, subject_id, year)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{subject_id}/marks-by-topic")
async def get_marks_by_topic(
    subject_id: int,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    try:
        return await PastPaperService.get_marks_by_topic(db, subject_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
