"""Resolve or create catalog subjects for question generation (thin async facade)."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.subject import Subject
from app.utils.subject_query import (
    DuplicateSubjectEntriesError,
    get_or_create_subject_triple,
    select_one_subject_by_triple,
)


class SubjectResolver:
    """
    Board + class + subject name → :class:`Subject` row for FK on generated questions.

    Resolution is always **deterministic**: at most one row is used — the lowest ``subject_id``
    for the triple (see :func:`app.utils.subject_query.resolve_subject_triple`).
    """

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def get_or_create_for_generation(
        self,
        *,
        board: str,
        class_level: str,
        subject_name: str,
        book_version: str = "2024",
    ) -> Subject:
        # Never fail generation with duplicate-catalog errors: always use lowest subject_id.
        return await get_or_create_subject_triple(
            self._db,
            board=board,
            class_level=class_level,
            subject_name=subject_name,
            book_version=book_version,
            strict_duplicates=False,
        )

    async def resolve_unique_subject_id(
        self,
        *,
        board: str,
        class_level: str,
        subject_name: str,
        book_version: str = "2024",
    ) -> int:
        """Return the canonical ``subject_id`` for this triple (after get-or-create)."""
        row = await self.get_or_create_for_generation(
            board=board,
            class_level=class_level,
            subject_name=subject_name,
            book_version=book_version,
        )
        return int(row.subject_id)

    async def peek_existing_subject_id(
        self,
        *,
        board: str,
        class_level: str,
        subject_name: str,
    ) -> int | None:
        """Lowest ``subject_id`` if already present; does **not** insert (read-only)."""
        row = await select_one_subject_by_triple(
            self._db,
            board=board,
            class_level=class_level,
            subject_name=subject_name,
        )
        return int(row.subject_id) if row is not None else None


__all__ = ["SubjectResolver", "DuplicateSubjectEntriesError"]
