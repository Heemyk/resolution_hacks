"""Redis distributed locks for idempotent transcript → render pipelines."""

from __future__ import annotations

from contextlib import contextmanager
from typing import Generator

import redis
from redis.exceptions import LockError

from app.core.config import settings


def _client() -> redis.Redis:
    return redis.from_url(settings.redis_url, decode_responses=True)


@contextmanager
def redis_lock(name: str, ttl_sec: int = 60) -> Generator[None, None, None]:
    r = _client()
    lock = r.lock(f"lock:{name}", timeout=ttl_sec)
    acquired = False
    try:
        acquired = bool(lock.acquire(blocking=True, blocking_timeout=10))
        if not acquired:
            raise LockError("Could not acquire lock")
        yield
    finally:
        if acquired:
            try:
                lock.release()
            except Exception:
                pass
