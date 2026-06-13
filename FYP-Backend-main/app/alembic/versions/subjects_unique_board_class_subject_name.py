"""Unique constraint on subjects (board, class_level, subject_name)

Revision ID: subjects_uq_triple
Revises: dfa28802add4
Create Date: 2026-04-16

Run ``python scripts/deduplicate_subjects.py`` before upgrading if duplicates exist.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision: str = "subjects_uq_triple"
down_revision: Union[str, None] = "dfa28802add4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = inspect(conn)
    if "subjects" not in inspector.get_table_names():
        return
    dup = conn.execute(
        sa.text(
            """
            SELECT COUNT(*) FROM (
                SELECT 1 FROM subjects
                GROUP BY board, class_level, subject_name
                HAVING COUNT(*) > 1
            ) t
            """
        )
    ).scalar()
    if dup and int(dup) > 0:
        raise RuntimeError(
            "Duplicate subject rows still exist. Run: python scripts/deduplicate_subjects.py "
            "(from FYP-Backend-main with PYTHONPATH=app), then re-run alembic upgrade."
        )
    op.create_unique_constraint(
        "uq_subjects_board_class_subject_name",
        "subjects",
        ["board", "class_level", "subject_name"],
    )


def downgrade() -> None:
    conn = op.get_bind()
    inspector = inspect(conn)
    if "subjects" in inspector.get_table_names():
        op.drop_constraint("uq_subjects_board_class_subject_name", "subjects", type_="unique")
