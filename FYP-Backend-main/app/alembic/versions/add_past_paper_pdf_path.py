"""add pdf_relative_path to past_papers for student PDF download

Revision ID: past_paper_pdf_path_01
Revises: past_paper_pub_01
Create Date: 2026-04-11

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision: str = "past_paper_pdf_path_01"
down_revision: Union[str, None] = "past_paper_pub_01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if "past_papers" not in inspector.get_table_names():
        return
    cols = {c["name"] for c in inspector.get_columns("past_papers")}
    if "pdf_relative_path" in cols:
        return
    op.add_column(
        "past_papers",
        sa.Column("pdf_relative_path", sa.String(length=512), nullable=True),
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if "past_papers" not in inspector.get_table_names():
        return
    cols = {c["name"] for c in inspector.get_columns("past_papers")}
    if "pdf_relative_path" in cols:
        op.drop_column("past_papers", "pdf_relative_path")
