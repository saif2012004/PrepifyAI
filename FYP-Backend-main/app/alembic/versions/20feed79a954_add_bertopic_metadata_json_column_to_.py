"""Add bertopic metadata JSON column to predictions

Revision ID: 20feed79a954
Revises: 
Create Date: 2025-10-30 14:46:05.055821

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = '20feed79a954'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    # SAFE CHECK: avoid crash if table doesn't exist
    tables = inspector.get_table_names()

    if "predictions" not in tables:
        # table not created yet → skip safely
        return

    cols = {c["name"] for c in inspector.get_columns("predictions")}

    if "bertopic_metadata" not in cols:
        op.add_column(
            "predictions",
            sa.Column("bertopic_metadata", sa.JSON(), nullable=True)
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    tables = inspector.get_table_names()

    if "predictions" not in tables:
        return

    cols = {c["name"] for c in inspector.get_columns("predictions")}

    if "bertopic_metadata" in cols:
        op.drop_column("predictions", "bertopic_metadata")