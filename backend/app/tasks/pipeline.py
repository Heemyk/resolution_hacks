"""In-process async pipeline: replaces Celery tasks + Redis locks.

transcript saved
  → on_transcript_saved()        [asyncio.create_task from request handler]
  → run_render_job()             [asyncio.Lock per session — no duplicate renders]
  → publish() to event bus       [picked up by open SSE connections]

Plug the agent loop into run_render_job() when ready.
"""

from __future__ import annotations

import asyncio
import uuid

from app.core.event_bus import publish
from app.schemas.a2ui import A2UIRenderJob, UIBlock
from app.schemas.events import SSEEvent

# Per-session asyncio lock — prevents overlapping renders for the same session
_render_locks: dict[str, asyncio.Lock] = {}


def _lock(session_id: str) -> asyncio.Lock:
    if session_id not in _render_locks:
        _render_locks[session_id] = asyncio.Lock()
    return _render_locks[session_id]


async def on_transcript_saved(session_id: str, version: int, text: str) -> None:
    """Entry point: called via asyncio.create_task() after a transcript is committed."""
    job_id = str(uuid.uuid4())
    asyncio.create_task(run_render_job(session_id, job_id, version, text))


async def run_render_job(session_id: str, job_id: str, version: int, text: str) -> None:
    """Build A2UI blocks and push to all open SSE connections for this session.

    TODO: replace the stub block with a real AgentRuntime.run_turn() call that
    returns structured UIBlock output based on the transcript content.
    """
    async with _lock(session_id):
        job = A2UIRenderJob(
            session_id=session_id,
            job_id=job_id,
            blocks=[
                UIBlock(
                    kind="markdown",
                    id=str(uuid.uuid4()),
                    payload={"text": f"v{version} — {text[:500]}"},
                )
            ],
            meta={"version": version},
        )
        ev = SSEEvent(event="render", data={"job": job.model_dump()})
        await publish(session_id, ev.model_dump())
