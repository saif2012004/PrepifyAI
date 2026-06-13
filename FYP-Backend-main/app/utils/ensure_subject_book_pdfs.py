"""Create subject_book_pdfs if missing (same schema as alembic add_subject_book_pdfs).

Avoids 500s when the API runs against a DB that never ran `alembic upgrade head`.
"""

from __future__ import annotations

import logging

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

_log = logging.getLogger(__name__)

_ensured: bool = False


async def ensure_subject_book_pdfs_table(db: AsyncSession) -> None:
    global _ensured
    if _ensured:
        return
    await db.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS subject_book_pdfs (
                book_id SERIAL PRIMARY KEY,
                subject_id INTEGER NOT NULL REFERENCES subjects(subject_id),
                title VARCHAR(300) NOT NULL,
                original_filename VARCHAR(500) NOT NULL,
                storage_relpath VARCHAR(600) NOT NULL,
                file_size_bytes INTEGER,
                added_on TIMESTAMPTZ DEFAULT now()
            )
            """
        )
    )
    await db.execute(
        text(
            "CREATE INDEX IF NOT EXISTS ix_subject_book_pdfs_subject_id "
            "ON subject_book_pdfs (subject_id)"
        )
    )
    await db.commit()
    _ensured = True
    _log.debug("subject_book_pdfs table ready")
