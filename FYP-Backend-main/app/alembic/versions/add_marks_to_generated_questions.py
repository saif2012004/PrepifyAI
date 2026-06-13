"""add marks column to generated_questions for score_marks conversion

Revision ID: add_marks_gq
Revises: add_is_active_users
Create Date: 2025-03-14

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision: str = "add_marks_gq"
down_revision: Union[str, None] = "add_is_active_users"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if "generated_questions" not in inspector.get_table_names():
        return
    cols = {c["name"] for c in inspector.get_columns("generated_questions")}
    if "marks" not in cols:
        op.add_column(
            "generated_questions",
            sa.Column("marks", sa.Integer(), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if "generated_questions" not in inspector.get_table_names():
        return
    cols = {c["name"] for c in inspector.get_columns("generated_questions")}
    if "marks" in cols:
        op.drop_column("generated_questions", "marks")
