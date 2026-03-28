"""In-process async pipeline: replaces Celery tasks + Redis locks.

transcript saved
  → on_transcript_saved()        [asyncio.create_task from request handler]
  → run_render_job()             [asyncio.Lock per session — no duplicate renders]
  → AgentRuntime.run_turn()      [streams Claude response]
  → publish() to event bus       [picked up by open SSE connections]
"""

from __future__ import annotations

import asyncio
import uuid

import structlog

from app.agent.memory import ChatMessage
from app.agent.runtime import AgentRuntime
from app.api.deps import get_llm_adapter, get_skill_registry
from app.core.event_bus import publish
from app.schemas.a2ui import A2UIRenderJob, UIBlock
from app.schemas.events import SSEEvent

log = structlog.get_logger(__name__)

# Per-session asyncio lock — prevents overlapping renders for the same session
_render_locks: dict[str, asyncio.Lock] = {}

# Per-session AgentRuntime — preserves MessageWindow (conversation history)
_runtimes: dict[str, AgentRuntime] = {}

_SYSTEM_PROMPT = (
    "You are a real-time voice canvas assistant. "
    "The user is speaking live — a transcript of what they just said is provided. "
    "Respond concisely and helpfully. Output will be rendered as markdown."
)


def _lock(session_id: str) -> asyncio.Lock:
    if session_id not in _render_locks:
        _render_locks[session_id] = asyncio.Lock()
    return _render_locks[session_id]


def _runtime(session_id: str) -> AgentRuntime:
    if session_id not in _runtimes:
        _runtimes[session_id] = AgentRuntime(
            llm=get_llm_adapter(),
            skills=get_skill_registry(),
        )
    return _runtimes[session_id]


async def on_transcript_saved(session_id: str, version: int, text: str) -> None:
    """Entry point: called via asyncio.create_task() after a transcript is committed."""
    job_id = str(uuid.uuid4())
    structlog.contextvars.bind_contextvars(session_id=session_id, job_id=job_id)
    log.info(
        "pipeline.transcript_scheduled",
        version=version,
        user_text=text,
    )
    asyncio.create_task(run_render_job(session_id, job_id, version, text))


async def run_render_job(session_id: str, job_id: str, version: int, text: str) -> None:
    """Run one agent turn and push resulting UIBlocks to open SSE connections."""
    structlog.contextvars.bind_contextvars(session_id=session_id, job_id=job_id)
    lock = _lock(session_id)
    log.info("pipeline.render_wait_lock", version=version, user_text=text)
    async with lock:
        log.info("pipeline.render_start", version=version, runtimes_cached=len(_runtimes))
        runtime = _runtime(session_id)
        chunks: list[str] = []
        async for chunk in runtime.run_turn(
            user_text=text,
            system_base=_SYSTEM_PROMPT,
        ):
            chunks.append(chunk)
            log.debug("pipeline.llm_chunk", chunk_len=len(chunk), total_chars=sum(len(c) for c in chunks))
        response = "".join(chunks)
        runtime.window.append(ChatMessage(role="assistant", content=response))

        job = A2UIRenderJob(
            session_id=session_id,
            job_id=job_id,
            blocks=[
                UIBlock(
                    kind="markdown",
                    id=str(uuid.uuid4()),
                    payload={"text": response},
                )
            ],
            meta={"version": version},
        )
        ev = SSEEvent(event="render", data={"job": job.model_dump()})
        log.info(
            "pipeline.render_publish",
            response_preview=response[:1000],
            response_len=len(response),
            job=job.model_dump(),
        )
        await publish(session_id, ev.model_dump())
        log.info("pipeline.render_done", version=version)
