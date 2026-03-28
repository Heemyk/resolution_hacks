"""Server-Sent Events stream for session-scoped agent + render updates."""

from __future__ import annotations

import json

import structlog
from fastapi import APIRouter, Query
from sse_starlette.sse import EventSourceResponse

from app.core.event_bus import publish, subscribe
from app.schemas.events import SSEEvent

router = APIRouter(tags=["sse"])
log = structlog.get_logger(__name__)


@router.get("/stream")
async def sse_stream(session_id: str = Query(..., min_length=1)) -> EventSourceResponse:
    async def gen():
        ping = {"event": "ping", "data": json.dumps({"ok": True})}
        log.info("sse.outbound", session_id=session_id, sse_event="ping", sse_data={"ok": True})
        yield ping
        async for payload in subscribe(session_id):
            try:
                ev = SSEEvent.model_validate(payload)
                packet = {"event": ev.event, "data": json.dumps(ev.data)}
                log.info(
                    "sse.outbound",
                    session_id=session_id,
                    sse_event=ev.event,
                    sse_data=ev.data,
                )
                yield packet
            except (ValueError, KeyError) as exc:
                err = {"event": "error", "data": json.dumps({"raw": str(payload)})}
                log.warning(
                    "sse.outbound_invalid_payload",
                    session_id=session_id,
                    error=str(exc),
                    raw_payload=payload,
                )
                yield err

    return EventSourceResponse(gen())


@router.post("/emit-test")
async def emit_test(session_id: str = Query(...)) -> dict:
    """Dev helper: verify SSE wiring without a real transcript."""
    ev = SSEEvent(event="agent_log", data={"message": "test"})
    log.info("sse.emit_test", session_id=session_id, payload=ev.model_dump())
    await publish(session_id, ev.model_dump())
    return {"ok": True}
