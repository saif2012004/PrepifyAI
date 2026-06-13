"""Add is_active column to users table

Revision ID: add_is_active_users
Revises: 2ccbb0b881ab
Create Date: 2025-12-10 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = 'add_is_active_users'
down_revision: Union[str, None] = '2ccbb0b881ab'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if "users" not in inspector.get_table_names():
        return
    cols = {c["name"] for c in inspector.get_columns("users")}
    if "is_active" not in cols:
        op.add_column("users", sa.Column("is_active", sa.Integer(), nullable=False, server_default="1"))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if "users" not in inspector.get_table_names():
        return
    cols = {c["name"] for c in inspector.get_columns("users")}
    if "is_active" in cols:
        op.drop_column("users", "is_active")
