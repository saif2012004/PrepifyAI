"""
Centralized subject lookups by (board, class_level, subject_name).

Avoids sqlalchemy ``scalar_one_or_none()`` / ``scalar_one()`` crashes when duplicate
catalog rows exist for the same triple.
"""

from __future__ import annotations

import logging
from typing import List, Optional, Sequence, Tuple

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.subject import Subject

logger = logging.getLogger(__name__)


class DuplicateSubjectEntriesError(Exception):
    """More than one ``subjects`` row for the same board + class + subject name."""

    def __init__(
        self,
        *,
        board: str,
        class_level: str,
        subject_name: str,
        subject_ids: Sequence[int],
    ) -> None:
        self.board = board
        self.class_level = class_level
        self.subject_name = subject_name
        self.subject_ids = list(subject_ids)
        msg = (
            f"Duplicate subject entries detected for board={board!r}, class={class_level!r}, "
            f"subject={subject_name!r} (subject_ids={self.subject_ids}). "
            "Run scripts/deduplicate_subjects.py then apply the unique migration."
        )
        super().__init__(msg)


def normalize_subject_triple(
    board: str,
    class_level: str,
    subject_name: str,
) -> Tuple[str, str, str]:
    """Strip whitespace; keep board/subject casing as stored in typical catalog inserts."""
    b = (board or "").strip()
    c = (class_level or "").strip()
    n = (subject_name or "").strip()
    return b, c, n


async def count_subjects_by_triple(
    db: AsyncSession,
    *,
    board: str,
    class_level: str,
    subject_name: str,
) -> int:
    """How many catalog rows share this (board, class_level, subject_name) triple."""
    b, c, n = normalize_subject_triple(board, class_level, subject_name)
    stmt = (
        select(func.count())
        .select_from(Subject)
        .where(
            Subject.board == b,
            Subject.class_level == c,
            Subject.subject_name == n,
        )
    )
    return int((await db.execute(stmt)).scalar_one() or 0)


async def select_one_subject_by_triple(
    db: AsyncSession,
    *,
    board: str,
    class_level: str,
    subject_name: str,
) -> Optional[Subject]:
    """
    Deterministic single row: lowest ``subject_id`` for the triple (SQL ``ORDER BY`` + ``LIMIT 1``).
    """
    b, c, n = normalize_subject_triple(board, class_level, subject_name)
    stmt = (
        select(Subject)
        .where(
            Subject.board == b,
            Subject.class_level == c,
            Subject.subject_name == n,
        )
        .order_by(Subject.subject_id.asc())
        .limit(1)
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def list_subject_ids_by_triple(
    db: AsyncSession,
    *,
    board: str,
    class_level: str,
    subject_name: str,
) -> List[int]:
    """All subject_ids for the triple, sorted ascending (for admin / duplicate diagnostics)."""
    b, c, n = normalize_subject_triple(board, class_level, subject_name)
    stmt = (
        select(Subject.subject_id)
        .where(
            Subject.board == b,
            Subject.class_level == c,
            Subject.subject_name == n,
        )
        .order_by(Subject.subject_id.asc())
    )
    return [int(r[0]) for r in (await db.execute(stmt)).all()]


async def fetch_subjects_by_triple(
    db: AsyncSession,
    *,
    board: str,
    class_level: str,
    subject_name: str,
) -> List[Subject]:
    """
    Return all rows matching the triple, ordered by ``subject_id`` ascending.
    Logs inputs and count at INFO.
    """
    b, c, n = normalize_subject_triple(board, class_level, subject_name)
    stmt = (
        select(Subject)
        .where(
            Subject.board == b,
            Subject.class_level == c,
            Subject.subject_name == n,
        )
        .order_by(Subject.subject_id.asc())
    )
    result = await db.execute(stmt)
    rows = list(result.scalars().all())
    logger.info(
        "subject_query triple: board=%r class_level=%r subject_name=%r -> %d row(s)",
        b,
        c,
        n,
        len(rows),
    )
    return rows


async def resolve_subject_triple(
    db: AsyncSession,
    *,
    board: str,
    class_level: str,
    subject_name: str,
    strict_duplicates: Optional[bool] = None,
) -> Optional[Subject]:
    """
    Return exactly one subject for the triple, or ``None`` if missing.

    Uses a single deterministic row: **lowest** ``subject_id`` (``ORDER BY subject_id LIMIT 1``).

    If multiple rows exist:
    - ``SUBJECT_DUPLICATE_STRICT=true`` (or ``strict_duplicates=True``): raise
      :class:`DuplicateSubjectEntriesError`.
    - Otherwise: log ERROR and return the row with the **lowest** ``subject_id``.
    """
    b, c, n = normalize_subject_triple(board, class_level, subject_name)
    strict = (
        strict_duplicates
        if strict_duplicates is not None
        else bool(getattr(settings, "SUBJECT_DUPLICATE_STRICT", False))
    )
    total = await count_subjects_by_triple(db, board=board, class_level=class_level, subject_name=subject_name)
    if total == 0:
        return None

    ids: List[int] | None = None
    if total > 1:
        ids = await list_subject_ids_by_triple(db, board=board, class_level=class_level, subject_name=subject_name)
        if strict:
            logger.error(
                "strict duplicate subject: board=%r class=%r subject=%r ids=%s",
                b,
                c,
                n,
                ids,
            )
            raise DuplicateSubjectEntriesError(
                board=b,
                class_level=c,
                subject_name=n,
                subject_ids=ids,
            )

    chosen = await select_one_subject_by_triple(db, board=board, class_level=class_level, subject_name=subject_name)
    if total > 1 and chosen is not None and ids is not None:
        logger.error(
            "Duplicate subject entries for board=%r, class=%r, subject=%r — using subject_id=%s (lowest of %s). "
            "Run scripts/deduplicate_subjects.py to merge rows.",
            b,
            c,
            n,
            chosen.subject_id,
            ids,
        )
    return chosen


async def get_or_create_subject_triple(
    db: AsyncSession,
    *,
    board: str,
    class_level: str,
    subject_name: str,
    book_version: str = "2024",
    strict_duplicates: Optional[bool] = None,
) -> Subject:
    """
    Resolve by triple; if missing, insert. Duplicate triples reuse the lowest ``subject_id``
    (same rules as :func:`resolve_subject_triple`).

    Pass ``strict_duplicates=False`` for generation paths to always pick the lowest id and never raise
    :class:`DuplicateSubjectEntriesError` (production-friendly).
    """
    existing = await resolve_subject_triple(
        db,
        board=board,
        class_level=class_level,
        subject_name=subject_name,
        strict_duplicates=strict_duplicates,
    )
    if existing is not None:
        return existing
    b, c, n = normalize_subject_triple(board, class_level, subject_name)
    row = Subject(
        board=b,
        class_level=c,
        subject_name=n,
        book_version=(book_version or "2024").strip(),
    )
    db.add(row)
    await db.flush()
    logger.info(
        "Created subject subject_id=%s board=%r class=%r name=%r",
        row.subject_id,
        b,
        c,
        n,
    )
    return row
