"""app_feedback — general product feedback

Revision ID: add_app_feedback
Revises: add_subject_book_pdfs
Create Date: 2026-04-03

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision: str = "add_app_feedback"
down_revision: Union[str, None] = "add_subject_book_pdfs"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = set(inspector.get_table_names())
    if "app_feedback" in tables:
        return
    if "users" not in tables:
        return
    op.create_table(
        "app_feedback",
        sa.Column("app_feedback_id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.user_id"), nullable=False),
        sa.Column("category", sa.String(length=40), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("rating", sa.Integer(), nullable=True),
        sa.Column("submitted_on", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_app_feedback_user_id", "app_feedback", ["user_id"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if "app_feedback" in inspector.get_table_names():
        op.drop_table("app_feedback")
