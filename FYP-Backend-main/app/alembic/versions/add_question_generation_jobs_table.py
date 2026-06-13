"""question_generation_jobs table for async Groq generation

Revision ID: qgen_jobs_001
Revises: subjects_uq_triple
Create Date: 2026-04-16
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision: str = "qgen_jobs_001"
down_revision: Union[str, None] = "subjects_uq_triple"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = set(inspector.get_table_names())
    if "question_generation_jobs" in tables:
        return
    if "subjects" not in tables:
        return
    op.create_table(
        "question_generation_jobs",
        sa.Column("job_id", sa.String(length=36), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("request_json", sa.JSON(), nullable=False),
        sa.Column("subject_id", sa.Integer(), nullable=False),
        sa.Column("result_json", sa.JSON(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["subject_id"], ["subjects.subject_id"]),
        sa.PrimaryKeyConstraint("job_id"),
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if "question_generation_jobs" in inspector.get_table_names():
        op.drop_table("question_generation_jobs")
