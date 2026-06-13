"""
Shared admin PDF handling — same validation and streaming save as student library books.
"""

from __future__ import annotations

import shutil
from pathlib import Path

from fastapi import HTTPException, UploadFile, status

from app.core.config import settings


def upload_dir_root() -> Path:
    return settings.upload_dir_abs()


def validate_pdf_upload(file: UploadFile) -> int:
    """
    Enforce max size, non-empty, and %PDF magic header.
    Leaves file.file seek position at 0 for copyfileobj.
    """
    safe_name = (file.filename or "").strip()
    if safe_name and not safe_name.lower().endswith(".pdf"):
        raise HTTPException(status_code=422, detail="File must be a PDF.")

    file.file.seek(0, 2)
    size = file.file.tell()
    file.file.seek(0)
    if size > settings.MAX_FILE_SIZE:
        max_mb = settings.MAX_FILE_SIZE // (1024 * 1024)
        raise HTTPException(
            status_code=422,
            detail=f"File too large. Maximum size is {max_mb} MB.",
        )
    if size < 8:
        raise HTTPException(status_code=422, detail="File is empty or too small.")

    head = file.file.read(5)
    file.file.seek(0)
    if head != b"%PDF-":
        raise HTTPException(status_code=422, detail="Not a valid PDF (missing %PDF header).")
    return int(size)


def copy_upload_into_subdir(file: UploadFile, subdir: str, filename: str) -> str:
    """
    Stream upload into UPLOAD_DIR/subdir/filename.
    Returns relative path with forward slashes (e.g. library/abc.pdf).
    """
    dest_dir = upload_dir_root() / subdir
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / filename
    with open(dest, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    return f"{subdir}/{filename}".replace("\\", "/")
