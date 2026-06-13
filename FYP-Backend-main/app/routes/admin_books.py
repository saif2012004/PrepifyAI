"""Admin: student library PDFs (full books) — separate from past-paper ingestion."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import List, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import require_admin_user
from app.database import get_db
from app.models.subject import Subject
from app.models.subject_book_pdf import SubjectBookPdf
from app.models.user import User
from app.services.past_paper_upload import PastPaperUploadService
from app.utils.admin_pdf_upload import copy_upload_into_subdir, validate_pdf_upload
from app.utils.ensure_subject_book_pdfs import ensure_subject_book_pdfs_table

logger = logging.getLogger(__name__)

router = APIRouter()


class AdminLibraryBookListItem(BaseModel):
    book_id: int
    subject_id: int
    class_level: str
    board: str
    subject_name: str
    title: str
    original_filename: str
    file_size_bytes: Optional[int] = None
    added_on: Optional[str] = None


class AdminLibraryBookUpdate(BaseModel):
    """Update display title and/or which catalog subject owns this PDF."""

    title: str = Field(..., min_length=1, max_length=300)
    subject_id: int = Field(..., ge=1)


@router.get("/library", response_model=List[AdminLibraryBookListItem])
async def admin_list_library_pdfs(
    subject_id: Optional[int] = Query(None, description="Filter by subject; omit to list every library PDF"),
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin_user),
):
    """List student-library PDFs with subject metadata (cleanup misassigned uploads)."""
    await ensure_subject_book_pdfs_table(db)
    stmt = (
        select(SubjectBookPdf, Subject)
        .join(Subject, Subject.subject_id == SubjectBookPdf.subject_id)
        .order_by(SubjectBookPdf.added_on.desc())
    )
    if subject_id is not None:
        stmt = stmt.where(SubjectBookPdf.subject_id == subject_id)
    result = await db.execute(stmt)
    rows = result.all()
    out: List[AdminLibraryBookListItem] = []
    for book, subj in rows:
        added = book.added_on.isoformat() if book.added_on else None
        out.append(
            AdminLibraryBookListItem(
                book_id=book.book_id,
                subject_id=book.subject_id,
                class_level=subj.class_level,
                board=subj.board,
                subject_name=subj.subject_name,
                title=book.title,
                original_filename=book.original_filename,
                file_size_bytes=book.file_size_bytes,
                added_on=added,
            )
        )
    return out


@router.post("/library/upload", status_code=status.HTTP_201_CREATED)
async def upload_subject_library_pdf(
    file: UploadFile = File(..., description="Textbook or reference PDF for students"),
    class_level: str = Form(..., description="Class level (9, 10, 11, 12)"),
    board: str = Form(..., description="Board (e.g. FBISE)"),
    subject_name: str = Form(..., description="Subject name matching catalog"),
    title: Optional[str] = Form(None, description="Display title (defaults to file name)"),
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin_user),
):
    """
    Store a PDF on disk and register it for the subject.
    Students list/download via GET /books/library and GET /books/library/{id}/file.
    """
    safe_name = (file.filename or "").strip()
    size = validate_pdf_upload(file)
    stored_name = f"{uuid4().hex}.pdf"
    relpath = copy_upload_into_subdir(file, "library", stored_name)
    subject_id = await PastPaperUploadService.ensure_subject_for_upload(
        db,
        class_level.strip(),
        board.strip(),
        subject_name.strip(),
    )

    await ensure_subject_book_pdfs_table(db)

    orig_fn = safe_name or "book.pdf"
    display_title = (title or "").strip() or Path(orig_fn).name
    display_title = display_title[:300]

    row = SubjectBookPdf(
        subject_id=subject_id,
        title=display_title,
        original_filename=orig_fn[:500],
        storage_relpath=relpath,
        file_size_bytes=size,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return {
        "book_id": row.book_id,
        "subject_id": subject_id,
        "title": row.title,
        "original_filename": row.original_filename,
    }


@router.patch("/library/{book_id}")
async def admin_update_library_pdf(
    book_id: int,
    body: AdminLibraryBookUpdate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin_user),
):
    """Update title and/or reassign the PDF to another catalog subject (metadata only)."""
    await ensure_subject_book_pdfs_table(db)
    sub_result = await db.execute(select(Subject).where(Subject.subject_id == body.subject_id))
    if sub_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Subject not found")
    result = await db.execute(select(SubjectBookPdf).where(SubjectBookPdf.book_id == book_id))
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Book not found")
    row.title = body.title.strip()[:300]
    row.subject_id = body.subject_id
    await db.commit()
    await db.refresh(row)
    return {
        "book_id": row.book_id,
        "subject_id": row.subject_id,
        "title": row.title,
        "original_filename": row.original_filename,
    }


async def _admin_delete_library_pdf_impl(book_id: int, db: AsyncSession) -> dict:
    """Shared implementation for DELETE and POST remove (some clients block HTTP DELETE)."""
    await ensure_subject_book_pdfs_table(db)
    result = await db.execute(select(SubjectBookPdf).where(SubjectBookPdf.book_id == book_id))
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Book not found")
    path = row.absolute_path(settings.UPLOAD_DIR)
    try:
        if path.is_file():
            path.unlink()
    except OSError as e:
        logger.warning("Could not delete PDF file %s: %s", path, e)
    try:
        await db.execute(delete(SubjectBookPdf).where(SubjectBookPdf.book_id == book_id))
        await db.commit()
    except Exception as e:
        await db.rollback()
        logger.exception("Failed to delete library book row: %s", e)
        raise HTTPException(status_code=500, detail="Could not delete book record") from e
    return {"message": "Book removed", "book_id": book_id}


@router.delete("/library/{book_id}")
async def admin_delete_library_pdf(
    book_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin_user),
):
    """Remove a library PDF from the catalog and delete the file on disk when present."""
    return await _admin_delete_library_pdf_impl(book_id, db)


@router.post("/library/{book_id}/delete")
async def admin_delete_library_pdf_post(
    book_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin_user),
):
    """Same as ``DELETE /library/{book_id}`` — use when DELETE is blocked."""
    return await _admin_delete_library_pdf_impl(book_id, db)
