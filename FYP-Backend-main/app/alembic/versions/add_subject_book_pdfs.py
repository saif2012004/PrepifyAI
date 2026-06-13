"""subject_book_pdfs — admin-uploaded PDFs for student library

Revision ID: add_subject_book_pdfs
Revises: add_user_gamification
Create Date: 2026-04-03

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision: str = "add_subject_book_pdfs"
down_revision: Union[str, None] = "add_user_gamification"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = set(inspector.get_table_names())
    if "subject_book_pdfs" in tables:
        return
    if "subjects" not in tables:
        return
    op.create_table(
        "subject_book_pdfs",
        sa.Column("book_id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("subject_id", sa.Integer(), sa.ForeignKey("subjects.subject_id"), nullable=False),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("original_filename", sa.String(length=500), nullable=False),
        sa.Column("storage_relpath", sa.String(length=600), nullable=False),
        sa.Column("file_size_bytes", sa.Integer(), nullable=True),
        sa.Column("added_on", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_subject_book_pdfs_subject_id", "subject_book_pdfs", ["subject_id"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if "subject_book_pdfs" in inspector.get_table_names():
        op.drop_table("subject_book_pdfs")
