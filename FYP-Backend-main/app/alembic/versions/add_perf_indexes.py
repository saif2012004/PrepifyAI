"""add indexes for performance and generated questions

Revision ID: add_perf_indexes
Revises: add_marks_gq
Create Date: 2026-03-23

"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import inspect


revision: str = "add_perf_indexes"
down_revision: Union[str, None] = "add_marks_gq"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = set(inspector.get_table_names())
    # Accelerates analytics and adaptive queries
    if "student_performance" in tables:
        op.execute(
            "CREATE INDEX IF NOT EXISTS ix_student_performance_user_subject_attempted "
            "ON student_performance (user_id, subject_id, attempted_on);"
        )
    if "generated_questions" in tables:
        op.execute(
            "CREATE INDEX IF NOT EXISTS ix_generated_questions_subject_difficulty_created "
            "ON generated_questions (subject_id, difficulty_level, created_at);"
        )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_generated_questions_subject_difficulty_created;")
    op.execute("DROP INDEX IF EXISTS ix_student_performance_user_subject_attempted;")

