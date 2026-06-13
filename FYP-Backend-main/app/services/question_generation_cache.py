"""
Redis cache for POST /questions/generate-questions/ identical payloads.

Cache key derives from board, class_level, subject, topic, difficulty, qtype, exam_type, num_questions
(stable SHA-256 prefix). Uses async-friendly ``asyncio.to_thread`` so sync Redis does not block the event loop.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
from typing import Optional

from app.core.config import settings
from app.core import redis_cache
from app.schemas.question_schema import GeneratedQuestionsResponse, QuestionRequest

logger = logging.getLogger(__name__)


def build_question_generation_cache_key(req: QuestionRequest) -> str:
    """Deterministic short key from request fields (syllabus-aligned inputs)."""
    parts = [
        (req.board or "").strip().lower(),
        (req.class_level or "").strip().lower(),
        (req.subject or "").strip().lower(),
        (req.topic or "").strip().lower(),
        (req.difficulty or "medium").strip().lower(),
        (req.qtype or "short").strip().lower(),
        (req.exam_type or "board").strip().lower(),
        str(max(1, min(int(req.num_questions or 1), 50))),
    ]
    raw = "|".join(parts)
    h = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]
    # v2 key prefix: invalidates stale partial/low-quality cached payloads.
    return f"qg:v2:{h}"


def _cache_enabled() -> bool:
    if not bool(getattr(settings, "QUESTION_GENERATION_CACHE_ENABLED", True)):
        return False
    url = (getattr(settings, "REDIS_URL", None) or "").strip()
    return bool(url)


def _is_cacheable_response(resp: GeneratedQuestionsResponse) -> bool:
    questions = list(resp.questions or [])
    if not questions:
        return False
    requested = int(resp.requested or 0) if getattr(resp, "requested", None) is not None else 0
    generated = int(resp.generated or len(questions))
    if requested > 0 and generated < requested:
        return False
    if str(getattr(resp, "warning", "") or "").strip():
        return False
    return True


async def cache_get_response(req: QuestionRequest) -> Optional[GeneratedQuestionsResponse]:
    if not _cache_enabled():
        return None

    key = build_question_generation_cache_key(req)

    def _load() -> Optional[GeneratedQuestionsResponse]:
        data = redis_cache.cache_get_json(key)
        if not isinstance(data, dict):
            return None
        try:
            m = GeneratedQuestionsResponse.model_validate(data)
            if not _is_cacheable_response(m):
                return None
            return m.model_copy(update={"cache_hit": True})
        except Exception as e:
            logger.debug("question gen cache parse miss %s: %s", key, e)
            return None

    try:
        return await asyncio.to_thread(_load)
    except Exception as e:
        logger.debug("question gen cache get failed: %s", e)
        return None


async def cache_set_response(req: QuestionRequest, response: GeneratedQuestionsResponse) -> None:
    if not _cache_enabled():
        return
    if not _is_cacheable_response(response):
        return
    key = build_question_generation_cache_key(req)
    ttl = int(getattr(settings, "QUESTION_GENERATION_REDIS_TTL_SEC", 600) or 600)
    to_store = response.model_copy(update={"cache_hit": False})
    payload = to_store.model_dump(mode="json")

    def _save() -> None:
        redis_cache.cache_set_json(key, payload, ttl_seconds=max(60, ttl))

    try:
        await asyncio.to_thread(_save)
    except Exception as e:
        logger.debug("question gen cache set failed: %s", e)
