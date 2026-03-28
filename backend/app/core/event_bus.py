"""In-process event bus: asyncio.Queue per session, replaces Redis pub/sub."""

from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Any, AsyncIterator

import structlog

# session_id -> list of subscriber queues (one per open SSE connection)
_subscribers: dict[str, list[asyncio.Queue[dict[str, Any]]]] = defaultdict(list)

log = structlog.get_logger(__name__)


def _queue_snapshot(queues: list[asyncio.Queue[dict[str, Any]]]) -> list[dict[str, int]]:
    return [{"qsize": q.qsize()} for q in queues]


async def publish(session_id: str, payload: dict[str, Any]) -> None:
    queues = list(_subscribers.get(session_id, []))
    log.info(
        "event_bus.publish",
        session_id=session_id,
        subscriber_queues=len(queues),
        queue_depths_before=_queue_snapshot(queues),
        payload=payload,
    )
    for q in queues:
        await q.put(payload)
    log.info(
        "event_bus.publish_flushed",
        session_id=session_id,
        queue_depths_after=_queue_snapshot(queues),
    )


async def subscribe(session_id: str) -> AsyncIterator[dict[str, Any]]:
    q: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
    _subscribers[session_id].append(q)
    log.info(
        "event_bus.subscribe_open",
        session_id=session_id,
        subscriber_queues=len(_subscribers[session_id]),
        queue_depths=_queue_snapshot(_subscribers[session_id]),
    )
    try:
        while True:
            item = await q.get()
            log.info(
                "event_bus.queue_pop",
                session_id=session_id,
                qsize_after=q.qsize(),
                payload=item,
            )
            yield item
    finally:
        _subscribers[session_id].remove(q)
        if not _subscribers[session_id]:
            _subscribers.pop(session_id, None)
        log.info(
            "event_bus.subscribe_close",
            session_id=session_id,
            active_bus_sessions=len(_subscribers),
        )
