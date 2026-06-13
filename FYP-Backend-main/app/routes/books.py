"""Student-facing book library: PDF catalog + optional textbook chunks (RAG)."""

import os

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import get_current_user
from app.database import get_db
from app.models.subject_book_pdf import SubjectBookPdf
from app.models.textbook_chunk import TextbookChunk
from app.models.user import User
from app.utils.ensure_subject_book_pdfs import ensure_subject_book_pdfs_table

router = APIRouter()


@router.get("/chunks")
async def get_textbook_chunks(
    subject_id: int = Query(..., description="Subject ID"),
    chapter_name: str | None = Query(None, description="Optional chapter filter"),
    topic_name: str | None = Query(None, description="Optional topic filter"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """
    Read textbook chunks for a subject (RAG / predictions).
    Accessible to any authenticated user (student or admin).
    """
    stmt = select(TextbookChunk).where(TextbookChunk.subject_id == subject_id)

    if chapter_name:
        stmt = stmt.where(TextbookChunk.chapter_name == chapter_name)
    if topic_name:
        stmt = stmt.where(TextbookChunk.topic_name == topic_name)

    stmt = stmt.offset(skip).limit(limit)
    result = await db.execute(stmt)
    rows = result.scalars().all()

    return [
        {
            "chunk_id": r.chunk_id,
            "subject_id": r.subject_id,
            "chapter_name": r.chapter_name,
            "topic_name": r.topic_name,
            "text_content": r.text_content,
            "page_start": r.page_start,
            "page_end": r.page_end,
            "token_count": r.token_count,
            "added_on": r.added_on,
        }
        for r in rows
    ]


@router.get("/library")
async def list_subject_library_pdfs(
    subject_id: int = Query(..., description="Subject ID from catalog"),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """List PDF books uploaded by admins for this subject (student or admin)."""
    await ensure_subject_book_pdfs_table(db)
    stmt = (
        select(SubjectBookPdf)
        .where(SubjectBookPdf.subject_id == subject_id)
        .order_by(SubjectBookPdf.added_on.desc())
    )
    result = await db.execute(stmt)
    rows = result.scalars().all()
    return [
        {
            "book_id": r.book_id,
            "subject_id": r.subject_id,
            "title": r.title,
            "original_filename": r.original_filename,
            "file_size_bytes": r.file_size_bytes,
            "added_on": r.added_on,
        }
        for r in rows
    ]


@router.get("/library/{book_id}/file")
async def download_subject_library_pdf(
    book_id: int,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """Download or open inline the PDF (send Authorization: Bearer)."""
    await ensure_subject_book_pdfs_table(db)
    result = await db.execute(select(SubjectBookPdf).where(SubjectBookPdf.book_id == book_id))
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Book not found")

    path = row.absolute_path(settings.UPLOAD_DIR)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="File missing on server")

    media_filename = os.path.basename(row.original_filename) or f"book-{book_id}.pdf"
    return FileResponse(
        path=str(path),
        media_type="application/pdf",
        filename=media_filename,
    )
