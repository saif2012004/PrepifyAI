"""
Delete student-library PDF rows (subject_book_pdfs) by book_id and remove files from disk.

Run from repo folder FYP-Backend-main:

  py -3 scripts/delete_subject_library_pdfs.py 2 3 4 5

Requires app/.env with DATABASE_URL (same as uvicorn).
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy import delete, select

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("delete_library_pdfs")


async def run(book_ids: list[int], *, dry_run: bool) -> None:
    from app.core.config import settings
    from app.database import AsyncSessionLocal
    from app.models.subject_book_pdf import SubjectBookPdf

    async with AsyncSessionLocal() as db:
        for bid in book_ids:
            result = await db.execute(select(SubjectBookPdf).where(SubjectBookPdf.book_id == bid))
            row = result.scalar_one_or_none()
            if row is None:
                log.warning("book_id=%s not found — skip", bid)
                continue

            path = row.absolute_path(settings.UPLOAD_DIR)
            log.info(
                "book_id=%s title=%r subject_id=%s file=%s",
                bid,
                row.title,
                row.subject_id,
                path,
            )

            if dry_run:
                log.info("  (dry-run: no changes)")
                continue

            try:
                if path.is_file():
                    path.unlink()
                    log.info("  removed file on disk")
            except OSError as e:
                log.warning("  could not delete file: %s", e)

            await db.execute(delete(SubjectBookPdf).where(SubjectBookPdf.book_id == bid))
            await db.commit()
            log.info("  removed database row")


def main() -> None:
    p = argparse.ArgumentParser(description="Delete subject_book_pdfs rows and PDF files by book_id")
    p.add_argument("book_ids", type=int, nargs="+", help="book_id values (e.g. 2 3 4 5)")
    p.add_argument("--dry-run", action="store_true", help="Print what would be deleted only")
    args = p.parse_args()

    asyncio.run(run(args.book_ids, dry_run=args.dry_run))


if __name__ == "__main__":
    main()
