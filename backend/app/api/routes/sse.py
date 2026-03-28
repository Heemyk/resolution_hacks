"""Server-Sent Events stream for session-scoped agent + render updates."""

from __future__ import annotations

import json

from fastapi import APIRouter, Query
from sse_starlette.sse import EventSourceResponse

from app.core.redis_events import publish_session_json, subscribe_session
from app.schemas.events import SSEEvent

router = APIRouter(tags=["sse"])


@router.get("/stream")
async def sse_stream(session_id: str = Query(..., min_length=1)) -> EventSourceResponse:
    async def gen():
        yield {"event": "ping", "data": json.dumps({"ok": True})}
        async for raw in subscribe_session(session_id):
            try:
                payload = json.loads(raw)
                ev = SSEEvent.model_validate(payload)
                yield {"event": ev.event, "data": json.dumps(ev.data)}
            except (json.JSONDecodeError, ValueError):
                yield {"event": "error", "data": json.dumps({"raw": raw})}

    return EventSourceResponse(gen())


@router.post("/emit-test")
async def emit_test(session_id: str = Query(...)) -> dict:
    """Dev-only helper to verify SSE + Redis wiring."""
    ev = SSEEvent(event="agent_log", data={"message": "test"})
    publish_session_json(session_id, ev.model_dump())
    return {"ok": True}
