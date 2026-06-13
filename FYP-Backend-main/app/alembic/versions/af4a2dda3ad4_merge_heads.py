"""merge heads

Revision ID: af4a2dda3ad4
Revises: past_paper_pdf_path_01, qgen_jobs_001
Create Date: 2026-04-17 11:16:04.630206

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'af4a2dda3ad4'
down_revision: Union[str, None] = ('past_paper_pdf_path_01', 'qgen_jobs_001')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
