"""Admin: bulk ingest textbook chunks for RAG / predictions (not student PDF library)."""

from __future__ import annotations

import json
import logging
from typing import List, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.embedding_storage import embedding_to_storage_format
from app.core.security import require_admin_user
from app.database import get_db
from app.models.subject import Subject
from app.models.textbook_chunk import TextbookChunk
from app.models.user import User
from app.utils.text_embeddings import encode_texts_batch

logger = logging.getLogger(__name__)

router = APIRouter()


class TextbookChunkIn(BaseModel):
    chunk_id: Optional[str] = Field(None, max_length=120)
    chapter_name: str = Field(..., max_length=200)
    topic_name: str = Field(..., max_length=200)
    text_content: str = Field(..., min_length=20)
    page_start: Optional[int] = None
    page_end: Optional[int] = None


class BulkTextbookChunksRequest(BaseModel):
    subject_id: int
    chunks: List[TextbookChunkIn] = Field(..., min_length=1, max_length=500)
    compute_embeddings: bool = True


@router.post("/bulk")
async def bulk_ingest_chunks(
    body: BulkTextbookChunksRequest,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin_user),
):
    """
    Upsert textbook chunks for RAG / predictions. Embeddings use MiniLM (384-d) when enabled.
    """
    sub = await db.execute(select(Subject).where(Subject.subject_id == body.subject_id))
    if sub.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Subject not found")

    texts = [c.text_content for c in body.chunks]
    vectors: List[List[float]] = []
    if body.compute_embeddings:
        vectors = encode_texts_batch(texts)

    added = 0
    updated = 0
    for i, c in enumerate(body.chunks):
        cid = (c.chunk_id or "").strip() or f"adm-{body.subject_id}-{uuid4().hex[:12]}"
        existing = await db.execute(select(TextbookChunk).where(TextbookChunk.chunk_id == cid))
        row = existing.scalar_one_or_none()

        emb_json: Optional[str] = None
        if body.compute_embeddings and i < len(vectors):
            raw = embedding_to_storage_format(vectors[i])
            emb_json = json.dumps(raw) if raw is not None else None

        token_count = len(c.text_content.split())

        if row:
            row.chapter_name = c.chapter_name[:200]
            row.topic_name = c.topic_name[:200]
            row.text_content = c.text_content
            row.page_start = c.page_start
            row.page_end = c.page_end
            row.token_count = token_count
            if emb_json is not None:
                row.embedding = emb_json
            updated += 1
        else:
            row = TextbookChunk(
                chunk_id=cid[:120],
                subject_id=body.subject_id,
                chapter_name=c.chapter_name[:200],
                topic_name=c.topic_name[:200],
                text_content=c.text_content,
                page_start=c.page_start,
                page_end=c.page_end,
                token_count=token_count,
                embedding=emb_json,
            )
            db.add(row)
            added += 1

    await db.commit()
    logger.info("Textbook bulk ingest subject=%s added=%s updated=%s", body.subject_id, added, updated)
    return {"added": added, "updated": updated, "total": added + updated}
