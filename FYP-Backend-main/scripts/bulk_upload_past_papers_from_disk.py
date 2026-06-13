"""
Upload every PDF under past_papers/class*/{board}/{subject}/{year}.pdf
using the same pipeline as admin POST /api/v1/past-papers/upload
(PastPaperUploadService.process_past_paper_pdf).

Prerequisites:
  - PostgreSQL running (e.g. docker compose), DATABASE_URL in app/.env
  - Optional: depends on Tesseract / embedding stack used by RobustPastPaperProcessor

Usage (from FYP-Backend-main, with venv activated):
  python scripts/bulk_upload_past_papers_from_disk.py
  python scripts/bulk_upload_past_papers_from_disk.py --dry-run
  python scripts/bulk_upload_past_papers_from_disk.py --limit 1
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "app"))

from sqlalchemy import select  # noqa: E402

from app.database import AsyncSessionLocal  # noqa: E402
from app.models.past_paper import PastPaper  # noqa: E402
from app.schemas.past_paper_upload import PastPaperUploadRequest  # noqa: E402
from app.services.past_paper_json_loader import (  # noqa: E402
    SUBJECT_FOLDER_MAP,
    _get_or_create_subject,
    _norm_board,
)
from app.services.past_paper_upload import PastPaperUploadService  # noqa: E402

logger = logging.getLogger("bulk_upload_past_papers")


def _meta_from_pdf(pdf: Path, papers_root: Path) -> dict | None:
    try:
        rel = pdf.relative_to(papers_root)
    except ValueError:
        return None
    parts = rel.parts
    if len(parts) != 4:
        logger.warning("Skip (expected class/board/subject/file): %s", pdf)
        return None
    class_part, board_part, subj_part, fname = parts
    m = re.match(r"class\s*(\d+)", class_part, re.IGNORECASE)
    if not m:
        return None
    class_level = m.group(1)
    board = _norm_board(board_part)
    sub_key = subj_part.lower().replace(" ", "")
    subject_name = SUBJECT_FOLDER_MAP.get(
        sub_key, subj_part.replace("_", " ").strip().title()
    )
    stem = Path(fname).stem
    if not stem.isdigit():
        return None
    year = int(stem)
    return {
        "class_level": class_level,
        "board": board,
        "subject_name": subject_name,
        "year": year,
    }


async def _already_uploaded(
    db, subject_id: int, year: int, board: str
) -> bool:
    r = await db.execute(
        select(PastPaper).where(
            PastPaper.subject_id == subject_id,
            PastPaper.year == year,
            PastPaper.board == board,
        )
    )
    return r.scalar_one_or_none() is not None


async def run(
    *,
    dry_run: bool,
    limit: int | None,
    papers_root: Path,
) -> int:
    pdfs = sorted(papers_root.rglob("*.pdf"))
    if not pdfs:
        logger.error("No PDFs under %s", papers_root)
        return 1

    processed = 0
    skipped = 0
    errors = 0

    for pdf in pdfs:
        meta = _meta_from_pdf(pdf, papers_root)
        if not meta:
            errors += 1
            continue

        if limit is not None and processed >= limit:
            break

        async with AsyncSessionLocal() as db:
            sub = await _get_or_create_subject(
                db,
                meta["board"],
                meta["class_level"],
                meta["subject_name"],
            )
            await db.commit()

        async with AsyncSessionLocal() as db:
            if await _already_uploaded(
                db, sub.subject_id, meta["year"], meta["board"]
            ):
                logger.info(
                    "Skip existing: %s | %s %s %s",
                    pdf.name,
                    meta["subject_name"],
                    meta["year"],
                    meta["board"],
                )
                skipped += 1
                continue

        logger.info(
            "Upload: %s | class=%s board=%s subject=%s year=%s",
            pdf,
            meta["class_level"],
            meta["board"],
            meta["subject_name"],
            meta["year"],
        )

        if dry_run:
            processed += 1
            continue

        req = PastPaperUploadRequest(
            class_level=meta["class_level"],
            board=meta["board"],
            subject_name=meta["subject_name"],
            year=meta["year"],
        )
        try:
            async with AsyncSessionLocal() as db:
                await PastPaperUploadService.process_past_paper_pdf(
                    db, str(pdf.resolve()), req
                )
            processed += 1
            logger.info("OK: %s", pdf.name)
        except Exception as e:
            logger.exception("Failed %s: %s", pdf, e)
            errors += 1

    logger.info(
        "Done. processed=%s skipped_existing=%s errors=%s dry_run=%s",
        processed,
        skipped,
        errors,
        dry_run,
    )
    return 0 if errors == 0 else 2


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(levelname)s %(message)s",
    )
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--dry-run",
        action="store_true",
        help="List actions only; do not call PDF processor",
    )
    ap.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Maximum number of new uploads (after skip check)",
    )
    ap.add_argument(
        "--papers-dir",
        type=Path,
        default=ROOT / "past_papers",
        help="Root folder containing class*/board/subject/*.pdf",
    )
    args = ap.parse_args()
    if not args.papers_dir.is_dir():
        logger.error("Not a directory: %s", args.papers_dir)
        sys.exit(1)

    rc = asyncio.run(
        run(
            dry_run=args.dry_run,
            limit=args.limit,
            papers_root=args.papers_dir.resolve(),
        )
    )
    sys.exit(rc)


if __name__ == "__main__":
    main()
