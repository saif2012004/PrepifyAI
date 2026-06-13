"""
Syllabus-scoped retrieval for question generation.

Global robust pipeline for topic lookup:
1) ILIKE substring on topic_name, chapter_name, and text_content
2) keyword + fuzzy scores over a subject chunk pool
3) longest non-empty chunks for that subject if nothing else matched

Never returns a false negative when usable ``textbook_chunks`` rows exist for the subject.
"""

from __future__ import annotations

import re
from difflib import SequenceMatcher
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.textbook_chunk import TextbookChunk
from app.utils.logger import get_logger

logger = get_logger(__name__)

# Returned in syllabus meta for API 404 detail when strict mode has no context.
HTTP_DETAIL_NO_CHUNKS_FOR_SUBJECT = (
    "No textbook chunks in the database for this subject. "
    "Ingest the syllabus or PDF (admin, bulk upload, or your textbook loading script) "
    "so textbook_chunks has rows for this subject, then try again."
)
HTTP_DETAIL_NO_USABLE_SYLLABUS_MATCH = (
    "No usable syllabus text for this topic. "
    "Add chapter/topic labels or fill textbook_chunks.text_content, try a different topic, "
    "or set QUESTION_GENERATION_STRICT_SYLLABUS=false only if you accept non-syllabus RAG."
)
HTTP_DETAIL_NO_RELEVANT_TEXTBOOK_TOPIC = "No relevant textbook content found for this topic"


def _chunk_row_usable(ch: TextbookChunk) -> bool:
    """Chunk can contribute context: non-empty body and/or chapter+topic when metadata fallback is on."""
    if (ch.text_content or "").strip():
        return True
    if not bool(getattr(settings, "SYLLABUS_USE_METADATA_WHEN_TEXT_EMPTY", True)):
        return False
    return bool((ch.chapter_name or "").strip() or (ch.topic_name or "").strip())


def _effective_chunk_body(ch: TextbookChunk) -> str:
    """Prefer ``text_content``; otherwise synthesize a short line from chapter/topic if allowed."""
    body = (ch.text_content or "").strip()
    if body:
        return body
    if not bool(getattr(settings, "SYLLABUS_USE_METADATA_WHEN_TEXT_EMPTY", True)):
        return ""
    chn = (ch.chapter_name or "").strip()
    tpn = (ch.topic_name or "").strip()
    if not chn and not tpn:
        return ""
    return (
        f"Chapter: {chn}. Topic: {tpn}. "
        "(Full paragraph text is missing in the database for this chunk; "
        "re-upload or use admin bulk ingest to attach body text for stronger questions.)"
    )


def _normalize_text(value: str | None) -> str:
    text = (value or "").lower()
    text = re.sub(r"[^\w\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _topic_keywords(topic: str) -> list[str]:
    raw = _normalize_text(topic)
    out: list[str] = []
    seen: set[str] = set()
    for w in raw.split():
        if len(w) < 3:
            continue
        if w in seen:
            continue
        seen.add(w)
        out.append(w)
    return out


def _expand_keywords(keywords: list[str]) -> list[str]:
    """Add simple singular/plural variants so 'enzymes' still matches text saying 'enzyme'."""
    seen: set[str] = set()
    out: list[str] = []
    for w in keywords:
        wl = w.lower()
        if wl not in seen:
            seen.add(wl)
            out.append(wl)
        if len(wl) > 4 and wl.endswith("s"):
            s = wl[:-1]
            if s not in seen and len(s) >= 3:
                seen.add(s)
                out.append(s)
    return out


def _score_chunk(topic_norm: str, keywords: list[str], chunk: TextbookChunk) -> float:
    topic_n = _normalize_text(chunk.topic_name)
    chapter_n = _normalize_text(chunk.chapter_name)
    text_n = _normalize_text(chunk.text_content)
    blob = f"{topic_n} {chapter_n} {text_n}".strip()
    if not blob:
        return 0.0

    keyword_hits = sum(1 for kw in keywords if kw in blob)
    overlap = (keyword_hits / max(1, len(keywords))) if keywords else 0.0
    ratio_topic = SequenceMatcher(None, topic_norm, topic_n).ratio() if topic_n else 0.0
    ratio_chapter = SequenceMatcher(None, topic_norm, chapter_n).ratio() if chapter_n else 0.0
    ratio_blob = SequenceMatcher(None, topic_norm, blob[:800]).ratio()

    score = (overlap * 0.55) + (max(ratio_topic, ratio_chapter) * 0.30) + (ratio_blob * 0.15)
    if topic_norm and topic_norm in blob:
        score += 0.25
    return score


async def build_syllabus_context_for_generation(
    db: AsyncSession,
    subject_id: int,
    topic: str,
    k: int,
) -> tuple[str, list[dict[str, Any]], dict[str, Any]]:
    """
    Return (context text, retrieval_sources) for the Groq pipeline.

    Uses the multi-stage pipeline and returns best available chunks for the same subject.
    If no strong match exists, returns best partial/weak match instead of raising 404-style errors.
    """
    t = (topic or "").strip()
    k = max(1, min(int(k), 50))
    if not t:
        t = "general"

    topic_norm = _normalize_text(t)
    keywords = _expand_keywords(_topic_keywords(topic_norm))
    logger.info(
        "syllabus retrieval input: subject_id=%s raw_topic=%r normalized_topic=%r keywords=%s",
        subject_id,
        t[:120],
        topic_norm[:120],
        keywords[:20],
    )

    stage_counts: dict[str, int] = {}

    # Stage 1: substring match on topic, chapter, or body text.
    contains_rows: list[TextbookChunk] = []
    if topic_norm:
        pat = f"%{topic_norm}%"
        stmt_contains = (
            select(TextbookChunk)
            .where(TextbookChunk.subject_id == int(subject_id))
            .where(
                or_(
                    TextbookChunk.topic_name.ilike(pat),
                    TextbookChunk.chapter_name.ilike(pat),
                    TextbookChunk.text_content.ilike(pat),
                )
            )
            .limit(max(k * 4, 32))
        )
        contains_rows = list((await db.execute(stmt_contains)).scalars().all())
    stage_counts["contains"] = len(contains_rows)

    # Stage 2+: keyword + fuzzy over subject pool + longest-chunk fallback.
    stmt_pool = (
        select(TextbookChunk)
        .where(TextbookChunk.subject_id == int(subject_id))
        .limit(1200)
    )
    pool: list[TextbookChunk] = list((await db.execute(stmt_pool)).scalars().all())
    stage_counts["subject_pool"] = len(pool)

    combined: dict[str, TextbookChunk] = {}
    for row in contains_rows:
        combined[str(row.chunk_id)] = row

    scored: list[tuple[float, TextbookChunk]] = []
    if pool:
        for ch in pool:
            s = _score_chunk(topic_norm, keywords, ch)
            if s > 0:
                scored.append((s, ch))
        scored.sort(key=lambda x: x[0], reverse=True)
    stage_counts["keyword_fuzzy_candidates"] = len(scored)

    for score, row in scored[: max(k * 4, 20)]:
        if score <= 0:
            continue
        combined[str(row.chunk_id)] = row

    rows = [r for r in combined.values() if _chunk_row_usable(r)]
    if len(rows) > k:
        # Keep best-ranked by score when available, otherwise keep insertion order.
        rank_map = {str(ch.chunk_id): idx for idx, (_, ch) in enumerate(scored)}
        rows.sort(key=lambda ch: rank_map.get(str(ch.chunk_id), 10**9))
        rows = rows[:k]

    pool_usable = [c for c in pool if _chunk_row_usable(c)]
    stage_counts["pool_with_body_text"] = sum(1 for c in pool if (c.text_content or "").strip())
    stage_counts["pool_metadata_only_usable"] = max(0, len(pool_usable) - stage_counts["pool_with_body_text"])
    stage_counts["final_subject_fallback"] = 0
    if not rows and pool_usable:
        # No title/keyword hits but subject has usable chunks: prefer longest effective body.
        pool_sorted = sorted(pool_usable, key=lambda c: len(_effective_chunk_body(c)), reverse=True)
        rows = pool_sorted[:k]
        stage_counts["final_subject_fallback"] = len(rows)

    logger.info(
        "syllabus retrieval stages: subject_id=%s topic=%r counts=%s",
        subject_id,
        topic_norm[:120],
        stage_counts,
    )

    min_chars = max(1, int(getattr(settings, "SYLLABUS_MIN_COMBINED_CHARS", 50) or 50))
    meta_enabled = bool(getattr(settings, "SYLLABUS_USE_METADATA_WHEN_TEXT_EMPTY", True))

    def _combined_body_text(chunks: list[TextbookChunk]) -> str:
        return " ".join(
            (c.text_content or "").strip()
            for c in chunks
            if (c.text_content or "").strip()
        )

    def _combined_metadata_text(chunks: list[TextbookChunk]) -> str:
        return " ".join(
            f"{(c.chapter_name or '').strip()} {(c.topic_name or '').strip()}".strip()
            for c in chunks
            if (c.chapter_name or "").strip() or (c.topic_name or "").strip()
        )

    base_meta = {
        "subject_chunk_rows": len(pool),
        "rows_used": len(rows),
        "context_part_count": 0,
        "combined_text_length": 0,
        "insufficient_content": False,
    }

    if not rows:
        nonempty_meta = sum(
            1
            for c in pool
            if (c.chapter_name or "").strip() or (c.topic_name or "").strip() or (c.text_content or "").strip()
        )
        if len(pool) == 0:
            logger.warning(
                "No textbook_chunks rows for subject_id=%s topic=%r — ingest PDFs or load chunks for this subject.",
                subject_id,
                topic_norm[:120],
            )
        else:
            logger.warning(
                "No usable text extracted from textbook_chunks subject_id=%s topic=%r "
                "(stored_chunks_for_subject=%s rows_with_any_metadata_or_body=%s). "
                "Add chapter_name/topic_name or text_content, or set "
                "SYLLABUS_USE_METADATA_WHEN_TEXT_EMPTY=true (default).",
                subject_id,
                topic_norm[:120],
                len(pool),
                nonempty_meta,
            )
        return "", [], base_meta

    body_only = _combined_body_text(rows).strip()
    meta_line = _combined_metadata_text(rows).strip()
    combined_text = body_only
    if not combined_text and meta_enabled:
        combined_text = meta_line
    elif len(combined_text) < min_chars and meta_enabled and meta_line:
        combined_text = f"{combined_text} {meta_line}".strip() if combined_text else meta_line

    if len(combined_text) < min_chars:
        logger.warning(
            "Insufficient content for generation subject_id=%s topic=%r combined_len=%s min=%s",
            subject_id,
            topic_norm[:120],
            len(combined_text),
            min_chars,
        )
        base_meta["combined_text_length"] = len(combined_text)
        base_meta["insufficient_content"] = True
        return "", [], base_meta

    parts: list[str] = []
    sources: list[dict[str, Any]] = []
    metadata_only_used = 0
    for i, ch in enumerate(rows):
        text = _effective_chunk_body(ch)
        if not text.strip():
            continue
        if not (ch.text_content or "").strip():
            metadata_only_used += 1
        parts.append(text)
        preview = text[:280] + ("…" if len(text) > 280 else "")
        sources.append(
            {
                "chunk_index": i,
                "preview": preview,
                "topic": ch.topic_name,
                "source_tag": ch.chapter_name,
            }
        )

    if metadata_only_used:
        logger.warning(
            "syllabus context used metadata fallback for %s/%s chunks (empty text_content); "
            "re-ingest textbook bodies for subject_id=%s when possible.",
            metadata_only_used,
            len(rows),
            subject_id,
        )

    if not parts:
        logger.warning(
            "No usable text extracted from textbook_chunks subject_id=%s topic=%r after gate (unexpected).",
            subject_id,
            topic_norm[:120],
        )
        base_meta["combined_text_length"] = len(combined_text)
        return "", [], base_meta

    ctx = "\n\n".join(parts)
    base_meta["context_part_count"] = len(parts)
    base_meta["combined_text_length"] = len(ctx)
    logger.info(
        "syllabus context ready: subject_id=%s topic=%r rows_used=%s combined_text_len=%s",
        subject_id,
        topic_norm[:120],
        len(rows),
        base_meta["combined_text_length"],
    )
    return ctx, sources, base_meta
