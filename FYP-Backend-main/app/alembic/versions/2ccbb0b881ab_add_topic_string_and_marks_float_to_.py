"""Add topic (string) and marks (float) to past_paper_questions

Revision ID: 2ccbb0b881ab
Revises: 20feed79a954
Create Date: 2025-10-30 15:00:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

# revision identifiers
revision = "2ccbb0b881ab"
down_revision = "20feed79a954"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = inspector.get_table_names()
    if "past_paper_questions" not in tables:
        return
    cols = {c["name"] for c in inspector.get_columns("past_paper_questions")}
    if "topic" not in cols:
        op.add_column(
            "past_paper_questions",
            sa.Column("topic", sa.String(), nullable=True),
        )
    if "marks" not in cols:
        op.add_column(
            "past_paper_questions",
            sa.Column("marks", sa.Float(), nullable=True),
        )


def downgrade():
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = inspector.get_table_names()
    if "past_paper_questions" not in tables:
        return
    cols = {c["name"] for c in inspector.get_columns("past_paper_questions")}
    if "marks" in cols:
        op.drop_column("past_paper_questions", "marks")
    if "topic" in cols:
        op.drop_column("past_paper_questions", "topic")