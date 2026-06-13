"""
Optional Redis JSON cache for low-churn read endpoints (subjects list, trend snapshots).

Set REDIS_URL in app/.env (e.g. redis://localhost:6379/0). If unset or connection fails, all operations no-op.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Optional

from app.core.config import settings

logger = logging.getLogger(__name__)


def _client():
    url = (getattr(settings, "REDIS_URL", None) or "").strip()
    if not url:
        return None
    try:
        import redis

        return redis.from_url(url, decode_responses=True)
    except Exception as e:
        logger.debug("Redis unavailable: %s", e)
        return None


def cache_get_json(key: str) -> Optional[Any]:
    r = _client()
    if r is None:
        return None
    try:
        raw = r.get(key)
        if raw is None:
            return None
        return json.loads(raw)
    except Exception as e:
        logger.debug("cache_get_json miss %s: %s", key, e)
        return None


def cache_set_json(key: str, value: Any, ttl_seconds: int = 120) -> None:
    r = _client()
    if r is None:
        return
    try:
        r.setex(key, ttl_seconds, json.dumps(value, default=str))
    except Exception as e:
        logger.debug("cache_set_json fail %s: %s", key, e)


def cache_invalidate_subjects_list() -> None:
    """Clear cached GET /subjects responses (all filter variants)."""
    r = _client()
    if r is None:
        return
    try:
        for pattern in ("subjects:v1:*", "subjects:v2:*"):
            for k in r.scan_iter(match=pattern):
                r.delete(k)
    except Exception as e:
        logger.debug("cache_invalidate_subjects_list: %s", e)
