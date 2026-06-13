"""
Smoke test: real DB + disk for POST /past-papers/library/upload code path.
Run from FYP-Backend-main:  .venv\\Scripts\\python.exe scripts/smoke_past_paper_library_upload.py
"""
from __future__ import annotations

import asyncio
import sys
from io import BytesIO
from pathlib import Path

_backend = Path(__file__).resolve().parent.parent
if str(_backend) not in sys.path:
    sys.path.insert(0, str(_backend))


async def main() -> int:
    from fastapi import UploadFile

    from app.core.config import settings
    from app.database import AsyncSessionLocal
    from app.services.past_paper_upload import PastPaperUploadService
    from sqlalchemy import delete, select

    from app.models.past_paper import PastPaper

    # Tiny but valid %PDF header (same checks as admin upload)
    minimal_pdf = (
        b"%PDF-1.4\n"
        b"%\xe2\xe3\xcf\xd3\n"
        b"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
        b"2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\n"
        b"xref\n0 3\n0000000000 65535 f \n"
        b"trailer<</Size 3/Root 1 0 R>>\n"
        b"startxref\n9\n%%EOF\n"
    )
    if len(minimal_pdf) < 8:
        print("FAIL: built-in PDF too small")
        return 1

    upload = UploadFile(filename="smoke_library_past_paper.pdf", file=BytesIO(minimal_pdf))

    print("upload_dir_abs:", settings.upload_dir_abs())
    paper_id: int | None = None
    try:
        async with AsyncSessionLocal() as db:
            result = await PastPaperUploadService.register_past_paper_pdf_only(
                db,
                upload,
                class_level="10",
                board="FBISE",
                subject_name="Biology",
                year=2099,
                publish_for_students=True,
            )
            paper_id = int(result["paper_id"])
    except Exception as e:
        print("FAIL: register_past_paper_pdf_only raised:", repr(e))
        return 1

    dest = settings.upload_dir_abs() / "past_papers" / f"{paper_id}.pdf"
    ok = dest.is_file()
    size = dest.stat().st_size if ok else 0
    print("paper_id:", paper_id)
    print("pdf_relative_path on disk:", dest)
    print("file_exists:", ok, "bytes:", size)
    if not ok or size < 8:
        print("FAIL: PDF not written to expected path")
        return 1

    # Verify DB row has path + published
    async with AsyncSessionLocal() as db:
        r = await db.execute(select(PastPaper).where(PastPaper.paper_id == paper_id))
        row = r.scalar_one_or_none()
        if not row:
            print("FAIL: PastPaper row missing")
            return 1
        rel = (row.pdf_relative_path or "").strip()
        pub = bool(row.is_published)
        print("db pdf_relative_path:", rel)
        print("db is_published:", pub)
        if not rel:
            print("FAIL: pdf_relative_path empty in DB")
            return 1
        if not pub:
            print("FAIL: is_published not True")
            return 1

    # Cleanup smoke row + file
    async with AsyncSessionLocal() as db:
        await db.execute(delete(PastPaper).where(PastPaper.paper_id == paper_id))
        await db.commit()
    try:
        dest.unlink(missing_ok=True)
    except OSError:
        pass

    print("OK: library upload path wrote PDF and DB; smoke row removed.")
    return 0


if __name__ == "__main__":
    # Windows + psycopg async: ProactorEventLoop is incompatible; use selector loop.
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    raise SystemExit(asyncio.run(main()))
