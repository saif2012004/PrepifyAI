"""
Set textbook_chunks.text_content from chapter/topic when body is empty (one-time data repair).

Usage:
  python scripts/backfill_textbook_chunk_empty_body.py
  python scripts/backfill_textbook_chunk_empty_body.py --subject-id 17
  python scripts/backfill_textbook_chunk_empty_body.py --dry-run
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

# Ensure app package is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.textbook_chunk import TextbookChunk


def _synthetic_body(chapter_name: str, topic_name: str) -> str:
    ch = (chapter_name or "").strip()
    tp = (topic_name or "").strip()
    return (
        f"Chapter: {ch}. Topic: {tp}. "
        "(Imported from chapter/topic labels; replace with full paragraph text from the book PDF when available.)"
    )


async def run(*, subject_id: int | None, dry_run: bool) -> int:
    async with AsyncSessionLocal() as db:
        stmt = select(TextbookChunk)
        if subject_id is not None:
            stmt = stmt.where(TextbookChunk.subject_id == int(subject_id))
        res = await db.execute(stmt)
        rows = list(res.scalars().all())
        touched = 0
        for row in rows:
            raw = (row.text_content or "").strip()
            if raw:
                continue
            ch = (row.chapter_name or "").strip()
            tp = (row.topic_name or "").strip()
            if not ch and not tp:
                continue
            new_text = _synthetic_body(row.chapter_name or "", row.topic_name or "")
            if len(new_text) < 20:
                continue
            touched += 1
            if dry_run:
                print(f"would update chunk_id={row.chunk_id} subject_id={row.subject_id}")
            else:
                row.text_content = new_text
                row.token_count = len(new_text.split())
        if not dry_run and touched:
            await db.commit()
        print(f"{'Would update' if dry_run else 'Updated'} {touched} row(s).")
    return 0


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--subject-id", type=int, default=None)
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()
    raise SystemExit(asyncio.run(run(subject_id=args.subject_id, dry_run=args.dry_run)))


if __name__ == "__main__":
    main()
