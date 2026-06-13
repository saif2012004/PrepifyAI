"""Small in-memory TTL cache (thread-safe). Optional use for retrieval or API memoization."""

from __future__ import annotations

import threading
import time
from typing import Any, Generic, Hashable, TypeVar

K = TypeVar("K", bound=Hashable)
V = TypeVar("V")


class SimpleTTLCache(Generic[K, V]):
    """Fixed-capacity dict with per-entry time-to-live seconds."""

    def __init__(self, *, max_entries: int = 256, ttl_seconds: float = 300.0) -> None:
        self._max = max(1, int(max_entries))
        self._ttl = float(ttl_seconds)
        self._data: dict[K, tuple[float, V]] = {}
        self._lock = threading.Lock()

    def get(self, key: K) -> V | None:
        now = time.monotonic()
        with self._lock:
            item = self._data.get(key)
            if item is None:
                return None
            exp, val = item
            if exp <= now:
                del self._data[key]
                return None
            return val

    def set(self, key: K, value: V) -> None:
        now = time.monotonic()
        with self._lock:
            if len(self._data) >= self._max and key not in self._data:
                # drop oldest by insertion order (Py3.7+ dict order)
                first = next(iter(self._data))
                del self._data[first]
            self._data[key] = (now + self._ttl, value)

    def delete(self, key: K) -> None:
        with self._lock:
            self._data.pop(key, None)

    def clear(self) -> None:
        with self._lock:
            self._data.clear()
