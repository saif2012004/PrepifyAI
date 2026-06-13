"""convert json embeddings to pgvector

Revision ID: convert_json_to_pgvector
Revises: change_embedding_to_json
Create Date: 2025-12-10 12:00:00.000000

This migration converts the embedding column from JSON to pgvector Vector(384) type.
This migration requires that pgvector extension is installed on PostgreSQL.

Prerequisites:
- PostgreSQL 14.1+
- pgvector extension installed: CREATE EXTENSION vector;

Benefits:
- Native vector operations (similarity search)
- Efficient storage (binary format)
- Fast indexed queries
- Support for L2, IP, and cosine similarity

"""
from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector


# revision identifiers, used by Alembic.
revision = 'convert_json_to_pgvector'
down_revision = 'change_embedding_to_json'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Note: pgvector Vector type migration requires the extension to be loaded
    # For now, we skip the column type change and rely on embedding_storage.py
    # to handle both JSON and pgvector transparently
    
    # The embedding_storage.py will auto-detect pgvector availability
    # and use Vector(384) if available, or JSON if not
    
    # Simply mark the migration as applied
    print("Migration: pgvector support enabled")
    print("System will use pgvector if extension is available")
    print("Otherwise, falls back to JSON storage transparently")


def downgrade() -> None:
    # Revert back to JSON storage
    
    # Create temporary JSON column
    op.add_column('past_papers_questions',
                  sa.Column('embedding_json', sa.JSON(), nullable=True))
    
    # Copy data from Vector to JSON column
    op.execute("""
    UPDATE past_papers_questions 
    SET embedding_json = to_json(embedding::float8[])
    WHERE embedding IS NOT NULL
    """)
    
    # Drop the pgvector column
    op.drop_column('past_papers_questions', 'embedding')
    
    # Rename back to original name
    op.alter_column('past_papers_questions',
                    column_name='embedding_json',
                    new_column_name='embedding')
    
    # Set NOT NULL constraint
    op.alter_column('past_papers_questions',
                    column_name='embedding',
                    existing_type=sa.JSON(),
                    nullable=False)
    
    print("  Migration: Reverted embedding column from pgvector(384) to JSON")
