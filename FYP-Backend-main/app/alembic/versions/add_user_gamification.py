"""add user_gamification table for XP, streaks, badges

Revision ID: add_user_gamification
Revises: add_perf_indexes
Create Date: 2026-03-29

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision: str = "add_user_gamification"
down_revision: Union[str, None] = "add_perf_indexes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = set(inspector.get_table_names())
    if "user_gamification" in tables:
        return
    if "users" not in tables:
        return
    op.create_table(
        "user_gamification",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.user_id"), primary_key=True),
        sa.Column("total_xp", sa.Integer(), server_default="0", nullable=False),
        sa.Column("current_level", sa.Integer(), server_default="1", nullable=False),
        sa.Column("current_streak", sa.Integer(), server_default="0", nullable=False),
        sa.Column("longest_streak", sa.Integer(), server_default="0", nullable=False),
        sa.Column("last_activity_date", sa.Date(), nullable=True),
        sa.Column("badges", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if "user_gamification" in inspector.get_table_names():
        op.drop_table("user_gamification")
