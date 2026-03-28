"""In-process async pipeline: replaces Celery tasks + Redis locks.

Two-stage agent pattern:

transcript saved
  → on_transcript_saved()          [asyncio.create_task from request handler]
  → run_render_job()               [asyncio.Lock per session — no duplicate renders]
    ├─ Orchestrator.plan()         [fast Haiku call: classify direct/passive, generate worker prompt]
    └─ AgentRuntime.run_turn()     [Sonnet tool-use loop: search + canvas blocks]
  → publish() to event bus         [picked up by open SSE connections]
"""

from __future__ import annotations

import asyncio
import json
import re
import uuid

import structlog

from app.agent.memory import ChatMessage
from app.agent.runtime import AgentRuntime
from app.api.deps import (
    get_image_search_adapter,
    get_llm_adapter,
    get_orchestrator,
    get_skill_registry,
    get_web_search_adapter,
)
from app.core.event_bus import publish
from app.schemas.a2ui import A2UIRenderJob, UIBlock
from app.schemas.events import SSEEvent

log = structlog.get_logger(__name__)

# Per-session asyncio lock — prevents overlapping renders for the same session
_render_locks: dict[str, asyncio.Lock] = {}

# Per-session AgentRuntime — preserves MessageWindow (conversation history)
_runtimes: dict[str, AgentRuntime] = {}

# ── Worker base prompt (appended to orchestrator-generated prompt) ────────────
# The orchestrator generates a context-specific plan; this suffix enforces output format.

_WORKER_OUTPUT_RULES = """
---
OUTPUT FORMAT (mandatory):
Respond ONLY with a valid JSON array of canvas blocks. No prose, no markdown fences, \
no text outside the JSON array.

Each block must be one of:
  {"kind": "markdown",  "payload": {"text": "..."}}
  {"kind": "mermaid",   "payload": {"source": "<raw mermaid syntax — no fences>"}}
  {"kind": "chartjs",   "payload": {"config": <Chart.js config object>}}
  {"kind": "image",     "payload": {"url": "...", "caption": "...", "source_url": "..."}}

Rules:
- Always include at least one markdown block.
- Chart.js config must be pure JSON (no JS functions, no undefined). Set responsive: true.
- Mermaid source must be raw syntax only — never wrap in ``` fences.
- Maximum 4 blocks per response to keep the canvas readable.
"""


def _lock(session_id: str) -> asyncio.Lock:
    if session_id not in _render_locks:
        _render_locks[session_id] = asyncio.Lock()
    return _render_locks[session_id]


def _runtime(session_id: str) -> AgentRuntime:
    if session_id not in _runtimes:
        _runtimes[session_id] = AgentRuntime(
            llm=get_llm_adapter(),
            skills=get_skill_registry(),
            search=get_web_search_adapter(),
            image_search=get_image_search_adapter(),
        )
    return _runtimes[session_id]


def _guarded_task(coro, label: str):
    """Wrap a coroutine in a task that logs any exception via structlog instead of swallowing it."""
    async def _run():
        try:
            await coro
        except Exception as exc:
            log.exception("pipeline.task_error", label=label, error=str(exc))
    return asyncio.create_task(_run())


async def on_transcript_saved(session_id: str, version: int, text: str) -> None:
    """Entry point: called via asyncio.create_task() after a transcript is committed."""
    job_id = str(uuid.uuid4())
    structlog.contextvars.bind_contextvars(session_id=session_id, job_id=job_id)
    log.info("pipeline.transcript_scheduled", version=version, user_text=text)
    _guarded_task(run_render_job(session_id, job_id, version, text), label="run_render_job")


def _parse_blocks(response: str) -> list[UIBlock]:
    """Parse agent JSON response into UIBlocks. Falls back to a single markdown block."""
    # Strip optional markdown fences that the model may emit despite instructions
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", response.strip(), flags=re.DOTALL)
    try:
        raw = json.loads(cleaned)
        if not isinstance(raw, list):
            raise ValueError("expected a JSON array")
        blocks: list[UIBlock] = []
        for item in raw:
            if not isinstance(item, dict) or "kind" not in item:
                continue
            blocks.append(UIBlock(id=str(uuid.uuid4()), **item))
        if blocks:
            return blocks
    except Exception as exc:
        log.warning("pipeline.parse_blocks_failed", error=str(exc), response_preview=response[:200])
    return [UIBlock(kind="markdown", id=str(uuid.uuid4()), payload={"text": response})]


async def run_render_job(session_id: str, job_id: str, version: int, text: str) -> None:
    """Two-stage: orchestrator → worker. Publishes UIBlocks via SSE."""
    structlog.contextvars.bind_contextvars(session_id=session_id, job_id=job_id)
    lock = _lock(session_id)
    log.info("pipeline.render_wait_lock", version=version, user_text=text)

    async with lock:
        log.info("pipeline.render_start", version=version, runtimes_cached=len(_runtimes))

        # ── Stage 1: Orchestrator (fast Haiku call) ───────────────────────────
        orchestrator = get_orchestrator()
        plan = await orchestrator.plan(text)
        mode = plan["mode"]
        focus = plan["focus"]
        worker_prompt = plan["worker_prompt"] + _WORKER_OUTPUT_RULES

        log.info(
            "pipeline.orchestrator_done",
            mode=mode,
            focus=focus,
            worker_prompt_len=len(worker_prompt),
        )

        # Publish an SSE status event so the frontend knows what mode we're in
        await publish(
            session_id,
            SSEEvent(
                event="agent_plan",
                data={"mode": mode, "focus": focus},
            ).model_dump(),
        )

        # ── Stage 2: Worker (Sonnet tool-use loop) ────────────────────────────
        runtime = _runtime(session_id)

        async def _on_tool_result(tool_name: str, tool_input: dict, result: str) -> None:
            ev = SSEEvent(
                event="tool_result",
                data={"tool": tool_name, "input": tool_input, "preview": result[:1000]},
            )
            log.info("pipeline.tool_result_publish", tool_name=tool_name, input=tool_input)
            await publish(session_id, ev.model_dump())

        chunks: list[str] = []
        async for chunk in runtime.run_turn(
            user_text=text,
            system_base=worker_prompt,
            on_tool_result=_on_tool_result,
        ):
            chunks.append(chunk)
            log.debug(
                "pipeline.llm_chunk",
                chunk_len=len(chunk),
                total_chars=sum(len(c) for c in chunks),
            )

        response = "".join(chunks)
        runtime.window.append(ChatMessage(role="assistant", content=response))

        blocks = _parse_blocks(response)
        log.info(
            "pipeline.blocks_parsed",
            mode=mode,
            focus=focus,
            count=len(blocks),
            kinds=[b.kind for b in blocks],
        )

        job = A2UIRenderJob(
            session_id=session_id,
            job_id=job_id,
            blocks=blocks,
            meta={"version": version, "mode": mode, "focus": focus},
        )
        ev = SSEEvent(event="render", data={"job": job.model_dump()})
        log.info(
            "pipeline.render_publish",
            response_preview=response[:500],
            response_len=len(response),
            block_count=len(blocks),
            mode=mode,
            focus=focus,
        )
        await publish(session_id, ev.model_dump())
        log.info("pipeline.render_done", version=version, mode=mode)
