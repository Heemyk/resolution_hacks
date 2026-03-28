"""Live caption ingestion → buffer → persisted version → async pipeline + SSE."""

from __future__ import annotations

import asyncio

import structlog
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.api.deps import get_transcript_repository
from app.core.event_bus import publish
from app.core.streaming import buffer_registry
from app.persistence.transcripts.repository import TranscriptRepository
from app.schemas.events import SSEEvent
from app.tasks.pipeline import on_transcript_saved

router = APIRouter(tags=["transcripts"])
log = structlog.get_logger(__name__)


class IngestBody(BaseModel):
    session_id: str = Field(default="default", min_length=1)
    role: str = Field(default="user")  # "user" | "gemini"
    text: str
    timestamp: str | None = None
    source: str = "gemini_live"


class FlushBody(BaseModel):
    session_id: str = Field(min_length=1)
    source: str = "gemini_live"


@router.post("/ingest")
async def ingest_chunk(
    body: IngestBody,
    repo: TranscriptRepository = Depends(get_transcript_repository),
) -> dict:
    structlog.contextvars.bind_contextvars(session_id=body.session_id)
    log.info(
        "transcript.ingest",
        role=body.role,
        text=body.text,
        timestamp=body.timestamp,
        source=body.source,
    )
    buf = buffer_registry.get(body.session_id)
    await buf.append(body.text)
    flushed = False
    if buf.should_flush():
        text = await buf.take()
        if text.strip():
            flushed = True
            rec = repo.commit(body.session_id, text.strip(), source=body.source, meta={"role": body.role})
            log.info(
                "transcript.committed",
                version=rec.version,
                committed_text=rec.text,
                source=body.source,
                meta={"role": body.role},
            )
            asyncio.create_task(on_transcript_saved(body.session_id, rec.version, rec.text))
            await publish(
                body.session_id,
                SSEEvent(event="transcript", data=rec.model_dump()).model_dump(),
            )
        else:
            log.info("transcript.flush_skipped_empty", after_should_flush=True)
    else:
        log.info(
            "transcript.buffer_hold",
            should_flush=False,
            hint="Anthropic runs only after a committed transcript (buffer size/time threshold or POST /api/transcripts/flush).",
        )
    return {"ok": True, "flushed": flushed}


@router.post("/flush")
async def flush(
    body: FlushBody,
    repo: TranscriptRepository = Depends(get_transcript_repository),
) -> dict:
    structlog.contextvars.bind_contextvars(session_id=body.session_id)
    log.info("transcript.flush_request", source=body.source)
    buf = buffer_registry.get(body.session_id)
    text = await buf.take()
    if not text.strip():
        log.info("transcript.flush_empty")
        return {"ok": True, "committed": False}
    rec = repo.commit(body.session_id, text.strip(), source=body.source)
    log.info(
        "transcript.committed",
        version=rec.version,
        committed_text=rec.text,
        source=body.source,
    )
    asyncio.create_task(on_transcript_saved(body.session_id, rec.version, rec.text))
    await publish(
        body.session_id,
        SSEEvent(event="transcript", data=rec.model_dump()).model_dump(),
    )
    return {"ok": True, "committed": True, "version": rec.version}


@router.get("/history")
async def history(
    session_id: str,
    repo: TranscriptRepository = Depends(get_transcript_repository),
) -> dict:
    structlog.contextvars.bind_contextvars(session_id=session_id)
    items = [x.model_dump() for x in repo.read_tail(session_id)]
    log.info("transcript.history", count=len(items), items=items)
    return {"items": items}
