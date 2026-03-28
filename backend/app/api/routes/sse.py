"""Server-Sent Events stream for session-scoped agent + render updates."""

from __future__ import annotations

import json

from fastapi import APIRouter, Query
from sse_starlette.sse import EventSourceResponse

from app.core.event_bus import publish, subscribe
from app.schemas.events import SSEEvent

router = APIRouter(tags=["sse"])


@router.get("/stream")
async def sse_stream(session_id: str = Query(..., min_length=1)) -> EventSourceResponse:
    async def gen():
        yield {"event": "ping", "data": json.dumps({"ok": True})}
        async for payload in subscribe(session_id):
            try:
                ev = SSEEvent.model_validate(payload)
                yield {"event": ev.event, "data": json.dumps(ev.data)}
            except (ValueError, KeyError):
                yield {"event": "error", "data": json.dumps({"raw": str(payload)})}

    return EventSourceResponse(gen())


@router.post("/emit-test")
async def emit_test(session_id: str = Query(...)) -> dict:
    """Dev helper: verify SSE wiring without a real transcript."""
    ev = SSEEvent(event="agent_log", data={"message": "test"})
    await publish(session_id, ev.model_dump())
    return {"ok": True}
