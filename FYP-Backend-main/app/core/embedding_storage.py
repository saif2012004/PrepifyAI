"""
Embedding storage configuration and compatibility layer.
Supports both pgvector (native vector type) and JSON storage.
"""

import logging
import os
from typing import Type, Union
from sqlalchemy import Column, JSON, String
from sqlalchemy.types import TypeDecorator

logger = logging.getLogger(__name__)

# Check if we're using pgvector or JSON storage
USE_PGVECTOR = os.getenv("USE_PGVECTOR", "true").lower() == "true"

if USE_PGVECTOR:
    try:
        from pgvector.sqlalchemy import Vector
        EMBEDDING_DIMENSION = 384
        EmbeddingType = Vector(EMBEDDING_DIMENSION)
    except ImportError:
        logger.warning("pgvector not available, falling back to JSON storage")
        EmbeddingType = JSON
        USE_PGVECTOR = False
else:
    EmbeddingType = JSON
    USE_PGVECTOR = False


def get_embedding_column(nullable: bool = False):
    """
    Get the appropriate embedding column based on configuration.
    
    Args:
        nullable: Whether the column allows NULL values
        
    Returns:
        SQLAlchemy Column configured for embedding storage
    """
    if USE_PGVECTOR:
        from pgvector.sqlalchemy import Vector
        return Column(Vector(384), nullable=nullable)
    else:
        return Column(JSON(), nullable=nullable)


def embedding_to_storage_format(embedding: list) -> Union[list, dict]:
    """
    Convert embedding list to storage format.
    
    Args:
        embedding: List of floats (e.g., [0.1, 0.2, ...])
        
    Returns:
        - If pgvector: list as-is
        - If JSON: {"values": list}
    """
    if USE_PGVECTOR:
        return embedding
    else:
        # JSON storage wraps embedding in dict
        return {"values": embedding} if isinstance(embedding, list) else embedding


def embedding_from_storage_format(stored_embedding) -> list:
    """
    Convert from storage format back to list.
    
    Args:
        stored_embedding: Value from database
        
    Returns:
        List of floats
    """
    if USE_PGVECTOR:
        # pgvector returns list directly
        return stored_embedding if isinstance(stored_embedding, list) else []
    else:
        # JSON returns dict, extract values
        if isinstance(stored_embedding, dict) and "values" in stored_embedding:
            return stored_embedding["values"]
        elif isinstance(stored_embedding, list):
            return stored_embedding
        else:
            return []


# Configuration info
STORAGE_CONFIG = {
    "type": "pgvector" if USE_PGVECTOR else "json",
    "dimension": 384 if USE_PGVECTOR else None,
    "embeddings_model": "all-MiniLM-L6-v2",
    "nullable": False,
    "description": (
        "pgvector storage for 384-dimensional embeddings from all-MiniLM-L6-v2 model"
        if USE_PGVECTOR
        else "JSON storage for 384-dimensional embeddings from all-MiniLM-L6-v2 model"
    )
}
