"""Blocking Groq + RAG pipeline and DB persistence (used by sync route and async job worker)."""

from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.subject import Subject
from app.repositories.question_repository import QuestionRepository
from app.schemas.question_schema import GeneratedQuestionsResponse, QuestionRequest
from app.core.config import settings
from app.services.generator import (
    NO_TEXTBOOK_CONTENT_DETAIL,
    dedupe_raw_question_rows,
    generate_questions,
)
from app.services.question_generation_feature import is_question_generation_enabled
from app.utils.logger import get_logger
from app.utils.retriever import retrieve_context_and_sources

logger = get_logger(__name__)


def _estimate_max_questions_from_context(ctx_len: int, n_chunks: int, qtype: str) -> int:
    qtl = (qtype or "").lower()
    if "mcq" in qtl or "multiple choice" in qtl:
        per_q = 400
    elif "long" in qtl:
        per_q = 700
    else:
        per_q = 280
    from_chars = max(1, ctx_len // max(120, per_q)) if ctx_len else 1
    from_chunks = max(1, n_chunks * 3)
    return max(1, min(50, min(from_chars, from_chunks)))


def _supplemental_context(topic: str, subject: str) -> str:
    # Keep this intentionally short so generator can switch to conceptual fallback mode
    # when textbook grounding is too thin.
    return f"Topic: {(topic or '').strip()}. Subject: {(subject or '').strip()}."


def sync_generate_question_batch(
    topic: str,
    subject: str,
    exam: str,
    difficulty: str,
    qtype: str,
    num_questions: int,
    rag_k: int,
    *,
    context: str | None = None,
    source_dicts: list[dict[str, Any]] | None = None,
    allow_global_rag_fallback: bool = True,
    subject_id: int | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    """CPU/GPU + blocking Groq I/O. Run via asyncio.to_thread or thread pool.

    Large ``num_questions`` values are split into multiple LLM calls (batch size from ``MCQ_LLM_BATCH_SIZE``)
    to reduce token pressure and timeouts while still returning one combined list.

    Returns ``(source_dicts, raw_questions, meta)`` where ``meta`` includes graceful-degradation fields.
    """
    empty_meta = {
        "requested": max(1, min(int(num_questions or 1), 50)),
        "generated": 0,
        "warning": None,
        "context_fallback_level": "disabled",
    }
    if not is_question_generation_enabled():
        return [], [], empty_meta
    missing_ctx = (
        context is None
        or source_dicts is None
        or (not (context or "").strip() and not (source_dicts or []))
    )
    fallback_level = "default"
    if missing_ctx:
        if not allow_global_rag_fallback:
            raise ValueError(NO_TEXTBOOK_CONTENT_DETAIL)
        context, source_dicts = retrieve_context_and_sources(topic, k=rag_k)
    elif allow_global_rag_fallback and (
        len((context or "").strip()) < 500 or len(source_dicts or []) < 2
    ):
        ctx2, src2 = retrieve_context_and_sources(topic, k=max(int(rag_k), 8))
        if len((ctx2 or "").strip()) > len((context or "").strip()):
            context, source_dicts = ctx2, src2
            fallback_level = "expanded_rag"

    if not (context or "").strip():
        context = f"Topic: {(topic or '').strip()}. Subject: {(subject or '').strip()}."
        source_dicts = source_dicts or [
            {
                "chunk_index": -1,
                "preview": context[:280],
                "topic": (topic or "").strip() or None,
                "source_tag": "synthetic_topic_fallback",
            }
        ]
        fallback_level = "topic_stub"
        logger.warning(
            "question_gen.pipeline topic_stub subject_id=%s topic=%r — minimal context; conceptual path may apply",
            subject_id,
            (topic or "")[:120],
        )
    source_chunk_ids = [
        str(s.get("chunk_index"))
        for s in source_dicts
        if isinstance(s, dict) and s.get("chunk_index") is not None
    ]
    n_requested = max(1, min(int(num_questions or 1), 50))
    n_chunks = len(source_dicts) if isinstance(source_dicts, list) else 0
    ctx_len = len(context or "")
    max_possible_hint = _estimate_max_questions_from_context(ctx_len, n_chunks, qtype)
    n_total = n_requested
    if max_possible_hint < n_requested:
        logger.warning(
            "question_gen.low_context_hint subject_id=%s requested=%s hint_max=%s ctx_len=%s chunks=%s",
            subject_id,
            n_requested,
            max_possible_hint,
            ctx_len,
            n_chunks,
        )
    batch_cap = max(1, min(int(getattr(settings, "MCQ_LLM_BATCH_SIZE", 10) or 10), 25))

    logger.info(
        "sync_generate_question_batch: subject_id=%s topic=%r subject=%r qtype=%r n_requested=%s n_target=%s "
        "hint_max=%s rag_k=%s chunks=%s ctx_chars=%s available_context_size=%s fallback_level=%s global_fallback=%s",
        subject_id,
        (topic or "")[:120],
        (subject or "")[:80],
        (qtype or "")[:20],
        n_requested,
        n_total,
        max_possible_hint,
        rag_k,
        n_chunks,
        ctx_len,
        ctx_len,
        fallback_level,
        allow_global_rag_fallback,
    )

    all_raw: list[dict[str, Any]] = []
    remaining = n_total
    no_progress_rounds = 0
    max_rounds = max(4, n_total * 3)
    rounds = 0
    while remaining > 0 and rounds < max_rounds:
        rounds += 1
        chunk_n = min(batch_cap, remaining)
        part = generate_questions(
            topic=topic,
            subject=subject,
            exam=exam,
            difficulty=difficulty,
            qtype=qtype,
            num_questions=chunk_n,
            context=context,
            source_chunk_ids=source_chunk_ids,
            subject_id=subject_id,
        )
        before = len(all_raw)
        all_raw.extend(part)
        all_raw = dedupe_raw_question_rows(all_raw)
        gained = len(all_raw) - before
        remaining = max(0, n_total - len(all_raw))
        if gained <= 0:
            no_progress_rounds += 1
            if no_progress_rounds >= 2:
                break
        else:
            no_progress_rounds = 0

    # Backfill pass: if we still don't have the requested count, run supplemental
    # conceptual rounds to honor student-requested question count as much as possible.
    if remaining > 0:
        logger.warning(
            "question_gen.backfill_start subject_id=%s requested=%s have=%s remaining=%s",
            subject_id,
            n_requested,
            len(all_raw),
            remaining,
        )
        backfill_no_progress = 0
        backfill_rounds = 0
        max_backfill_rounds = max(4, remaining * 3)
        while remaining > 0 and backfill_rounds < max_backfill_rounds:
            backfill_rounds += 1
            chunk_n = min(batch_cap, remaining)
            before = len(all_raw)
            part = generate_questions(
                topic=topic,
                subject=subject,
                exam=exam,
                difficulty=difficulty,
                qtype=qtype,
                num_questions=chunk_n,
                context=_supplemental_context(topic, subject),
                source_chunk_ids=["supplemental_context"],
                subject_id=subject_id,
            )
            all_raw.extend(part)
            all_raw = dedupe_raw_question_rows(all_raw)
            gained = len(all_raw) - before
            remaining = max(0, n_total - len(all_raw))
            if gained <= 0:
                backfill_no_progress += 1
                if backfill_no_progress >= 3:
                    break
            else:
                backfill_no_progress = 0
        if len(all_raw) > n_total:
            all_raw = all_raw[:n_total]
        if fallback_level == "default":
            fallback_level = "conceptual_backfill"

    if len(all_raw) > n_total:
        all_raw = all_raw[:n_total]

    for i, r in enumerate(all_raw, 1):
        r["question_number"] = i

    warning: str | None = None
    if not all_raw:
        warning = (
            "No questions could be generated from the available context; "
            "try a different topic, lower num_questions, or add textbook chunks."
        )
    elif len(all_raw) < n_requested:
        warning = "Only partial content available; fewer questions than requested were produced."
    meta = {
        "requested": n_requested,
        "generated": len(all_raw),
        "warning": warning,
        "context_fallback_level": fallback_level,
    }
    return source_dicts, all_raw, meta


async def persist_generated_questions(
    db: AsyncSession,
    subject: Subject,
    req: QuestionRequest,
    source_dicts: list[dict[str, Any]],
    raw_questions: list[dict[str, Any]],
    *,
    commit_db: bool = True,
    generation_meta: dict[str, Any] | None = None,
) -> GeneratedQuestionsResponse:
    """Insert GeneratedQuestion rows and return API response shape."""
    repo = QuestionRepository(db)
    extras: dict[str, Any] = {}
    if generation_meta:
        extras["requested"] = generation_meta.get("requested")
        extras["generated"] = generation_meta.get("generated")
        extras["warning"] = generation_meta.get("warning")
        extras["context_fallback_level"] = generation_meta.get("context_fallback_level")
    return await repo.persist_generated_batch(
        subject,
        req,
        source_dicts,
        raw_questions,
        commit_db=commit_db,
        response_extras=extras or None,
    )
