"""Live caption ingestion → buffer → persisted version → async pipeline + SSE."""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.api.deps import get_transcript_repository
from app.core.event_bus import publish
from app.core.streaming import buffer_registry
from app.persistence.transcripts.repository import TranscriptRepository
from app.schemas.events import SSEEvent
from app.tasks.pipeline import on_transcript_saved

router = APIRouter(tags=["transcripts"])


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
    buf = buffer_registry.get(body.session_id)
    await buf.append(body.text)
    if buf.should_flush():
        text = await buf.take()
        if text.strip():
            rec = repo.commit(body.session_id, text.strip(), source=body.source, meta={"role": body.role})
            asyncio.create_task(on_transcript_saved(body.session_id, rec.version, rec.text))
            await publish(
                body.session_id,
                SSEEvent(event="transcript", data=rec.model_dump()).model_dump(),
            )
    return {"ok": True}


@router.post("/flush")
async def flush(
    body: FlushBody,
    repo: TranscriptRepository = Depends(get_transcript_repository),
) -> dict:
    buf = buffer_registry.get(body.session_id)
    text = await buf.take()
    if not text.strip():
        return {"ok": True, "committed": False}
    rec = repo.commit(body.session_id, text.strip(), source=body.source)
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
    return {"items": [x.model_dump() for x in repo.read_tail(session_id)]}
