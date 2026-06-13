"""
Merge duplicate ``subjects`` rows that share the same (board, class_level, subject_name).

Keeps the lowest ``subject_id`` and reassigns all FKs from duplicate IDs to the keeper,
then deletes the extra subject rows.

Usage (from ``FYP-Backend-main`` with ``app/.env`` loaded)::

    cd FYP-Backend-main
    set PYTHONPATH=app
    python scripts/deduplicate_subjects.py

Dry-run (no writes)::

    python scripts/deduplicate_subjects.py --dry-run
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
from typing import Any, List, Sequence, Tuple

# Windows: same event loop policy as app.database
if os.name == "nt":
    selector_policy = getattr(asyncio, "WindowsSelectorEventLoopPolicy", None)
    if selector_policy is not None:
        asyncio.set_event_loop_policy(selector_policy())

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("dedupe_subjects")

# Child tables referencing subjects.subject_id (merge order does not need FK ordering for PG updates).
FK_TABLES = (
    "textbook_chunks",
    "generated_questions",
    "past_papers",
    "student_performance",
    "predictions",
    "subject_book_pdfs",
)


async def _find_duplicate_groups(session: AsyncSession) -> List[Tuple[str, str, str, List[int]]]:
    q = text(
        """
        SELECT board, class_level, subject_name, array_agg(subject_id ORDER BY subject_id) AS ids
        FROM subjects
        GROUP BY board, class_level, subject_name
        HAVING COUNT(*) > 1
        """
    )
    r = await session.execute(q)
    out: List[Tuple[str, str, str, List[int]]] = []
    for row in r.fetchall():
        board, class_level, subject_name, ids = row[0], row[1], row[2], list(row[3])
        out.append((board, class_level, subject_name, ids))
    return out


async def _merge_group(
    session: AsyncSession,
    board: str,
    class_level: str,
    subject_name: str,
    ids: Sequence[int],
    *,
    dry_run: bool,
) -> None:
    keeper = min(ids)
    dupes = [i for i in ids if i != keeper]
    logger.info(
        "Group board=%r class=%r name=%r keeper=%s merge=%s",
        board,
        class_level,
        subject_name,
        keeper,
        dupes,
    )
    if dry_run:
        return
    for dup_id in dupes:
        for table in FK_TABLES:
            await session.execute(
                text(f"UPDATE {table} SET subject_id = :k WHERE subject_id = :d"),
                {"k": keeper, "d": dup_id},
            )
        await session.execute(text("DELETE FROM subjects WHERE subject_id = :d"), {"d": dup_id})
    await session.flush()


async def main_async(dry_run: bool) -> None:
    from app.database import AsyncSessionLocal

    async with AsyncSessionLocal() as session:
        groups = await _find_duplicate_groups(session)
        if not groups:
            logger.info("No duplicate (board, class_level, subject_name) groups found.")
            return
        logger.info("Found %d duplicate group(s).", len(groups))
        for board, class_level, subject_name, ids in groups:
            await _merge_group(
                session,
                board,
                class_level,
                subject_name,
                ids,
                dry_run=dry_run,
            )
        if dry_run:
            await session.rollback()
            logger.info("Dry-run: rolled back.")
        else:
            await session.commit()
            logger.info("Committed merges.")


def main() -> None:
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    if root not in sys.path:
        sys.path.insert(0, root)
    p = argparse.ArgumentParser()
    p.add_argument("--dry-run", action="store_true", help="Log actions only; do not commit.")
    args = p.parse_args()
    asyncio.run(main_async(dry_run=args.dry_run))


if __name__ == "__main__":
    main()
