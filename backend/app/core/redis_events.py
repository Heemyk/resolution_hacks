"""Redis pub/sub bridge: Celery (sync) publishes; FastAPI SSE (async) subscribes."""

from __future__ import annotations

import json
from typing import Any

import redis
import redis.asyncio as aioredis

from app.core.config import settings


def channel_name(session_id: str) -> str:
    return f"session:{session_id}"


def publish_session_json(session_id: str, payload: dict[str, Any]) -> None:
    r = redis.from_url(settings.redis_url, decode_responses=True)
    r.publish(channel_name(session_id), json.dumps(payload))


async def subscribe_session(session_id: str):
    r = aioredis.from_url(settings.redis_url, decode_responses=True)
    pubsub = r.pubsub()
    await pubsub.subscribe(channel_name(session_id))
    try:
        async for message in pubsub.listen():
            if message.get("type") != "message":
                continue
            data = message.get("data")
            if data:
                yield str(data)
    finally:
        await pubsub.unsubscribe(channel_name(session_id))
        await pubsub.aclose()
        await r.aclose()
