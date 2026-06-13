from pathlib import Path
from typing import Optional

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from .base import Base


class SubjectBookPdf(Base):
    """
    Full textbook/reference PDFs uploaded by admins for students to download and open.
    Distinct from past-paper ingestion and from TextbookChunk RAG rows.
    """

    __tablename__ = "subject_book_pdfs"

    book_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    subject_id = Column(Integer, ForeignKey("subjects.subject_id"), nullable=False, index=True)
    title = Column(String(300), nullable=False)
    original_filename = Column(String(500), nullable=False)
    storage_relpath = Column(String(600), nullable=False)
    file_size_bytes = Column(Integer, nullable=True)
    added_on = Column(DateTime(timezone=True), server_default=func.now())

    subject = relationship("Subject", back_populates="library_pdfs")

    def absolute_path(self, upload_dir: Optional[str] = None) -> Path:
        """Resolve file on disk. ``upload_dir`` is ignored; use ``settings.upload_dir_abs()``."""
        from app.core.config import settings

        root = settings.upload_dir_abs()
        return (root / self.storage_relpath).resolve()
