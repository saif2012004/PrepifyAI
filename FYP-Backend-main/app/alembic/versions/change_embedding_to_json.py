"""change embedding to json - fallback migration

Revision ID: change_embedding_to_json
Revises: 2ccbb0b881ab
Create Date: 2025-12-10 10:00:00.000000

This migration converts the embedding column from TEXT to JSON.
Use this if pgvector extension is not available on your PostgreSQL.

For full vector database benefits (semantic search), install pgvector:
- Ubuntu/Debian: sudo apt-get install postgresql-<version>-pgvector
- macOS: brew install pgvector
- See: https://github.com/pgvector/pgvector#installation

Configuration: Set USE_PGVECTOR environment variable to switch storage types.
- USE_PGVECTOR=true: Uses pgvector Vector(384) type (requires extension)
- USE_PGVECTOR=false: Uses JSON type (no extension needed)

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision = 'change_embedding_to_json'
down_revision = '2ccbb0b881ab'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if "past_papers_questions" not in inspector.get_table_names():
        return
    cols = {c["name"] for c in inspector.get_columns("past_papers_questions")}

    # Drop old embedding column if present
    if "embedding" in cols:
        op.drop_column("past_papers_questions", "embedding")
    
    # Add new JSON embedding column (stores 384-dimensional embeddings from all-MiniLM-L6-v2).
    # nullable=True so existing rows survive add_column; app code tolerates null until backfilled.
    op.add_column("past_papers_questions", sa.Column("embedding", sa.JSON(), nullable=True))
    
    print(" Migration: Changed embedding column from TEXT to JSON")
    print("  Note: Using JSON instead of pgvector")
    print("    For semantic search capabilities, install pgvector on PostgreSQL")


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if "past_papers_questions" not in inspector.get_table_names():
        return
    cols = {c["name"] for c in inspector.get_columns("past_papers_questions")}

    # Drop JSON/text column if present
    if "embedding" in cols:
        op.drop_column("past_papers_questions", "embedding")
    
    # Restore old text column (data will be lost)
    op.add_column("past_papers_questions", sa.Column("embedding", sa.Text(), nullable=True))
    
    print("  Migration rolled back: Changed embedding column from JSON to TEXT")
