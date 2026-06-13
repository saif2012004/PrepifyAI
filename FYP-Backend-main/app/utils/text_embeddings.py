"""Batch text embeddings (MiniLM); shared by ingestion paths."""

from __future__ import annotations

import logging
from typing import List

logger = logging.getLogger(__name__)


def encode_texts_batch(texts: List[str]) -> List[List[float]]:
    if not texts:
        return []
    try:
        from sentence_transformers import SentenceTransformer

        model = SentenceTransformer("all-MiniLM-L6-v2")
        emb = model.encode(texts, convert_to_numpy=True, show_progress_bar=False)
        return [emb[i].tolist() for i in range(len(texts))]
    except Exception as e:
        logger.warning("Embedding model unavailable, using zero vectors: %s", e)
        dim = 384
        return [[0.0] * dim for _ in texts]
