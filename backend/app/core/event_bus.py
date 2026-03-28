"""In-process event bus: asyncio.Queue per session, replaces Redis pub/sub."""

from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Any, AsyncIterator

# session_id -> list of subscriber queues (one per open SSE connection)
_subscribers: dict[str, list[asyncio.Queue[dict[str, Any]]]] = defaultdict(list)


async def publish(session_id: str, payload: dict[str, Any]) -> None:
    for q in list(_subscribers.get(session_id, [])):
        await q.put(payload)


async def subscribe(session_id: str) -> AsyncIterator[dict[str, Any]]:
    q: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
    _subscribers[session_id].append(q)
    try:
        while True:
            yield await q.get()
    finally:
        _subscribers[session_id].remove(q)
        if not _subscribers[session_id]:
            _subscribers.pop(session_id, None)
