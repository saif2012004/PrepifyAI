"""merge_heads

Revision ID: dfa28802add4
Revises: add_app_feedback, prediction_model_tracking, convert_json_to_pgvector
Create Date: 2026-04-03 21:56:10.031918

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'dfa28802add4'
down_revision: Union[str, None] = ('add_app_feedback', 'prediction_model_tracking', 'convert_json_to_pgvector')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
