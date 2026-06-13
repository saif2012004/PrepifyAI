"""add is_published to past_papers (draft until admin publishes)

Revision ID: past_paper_pub_01
Revises: dfa28802add4
Create Date: 2026-04-11

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision: str = "past_paper_pub_01"
down_revision: Union[str, None] = "dfa28802add4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if "past_papers" not in inspector.get_table_names():
        return
    cols = {c["name"] for c in inspector.get_columns("past_papers")}
    if "is_published" in cols:
        return
    op.add_column("past_papers", sa.Column("is_published", sa.Boolean(), nullable=True))
    op.execute(sa.text("UPDATE past_papers SET is_published = true WHERE is_published IS NULL"))
    op.alter_column(
        "past_papers",
        "is_published",
        nullable=False,
        server_default=sa.text("false"),
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if "past_papers" not in inspector.get_table_names():
        return
    cols = {c["name"] for c in inspector.get_columns("past_papers")}
    if "is_published" in cols:
        op.drop_column("past_papers", "is_published")
