from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import structlog

from app.api.routes import health, sse, transcripts
from app.api.deps import get_transcript_repository
from app.core.config import settings
from app.core.event_bus import publish
from app.core.logging_config import configure_logging
from app.core.streaming import buffer_registry
from app.middleware.http_audit import HttpAuditMiddleware
from app.schemas.events import SSEEvent
from app.tasks.pipeline import on_transcript_saved

configure_logging()
_startup_log = structlog.get_logger(__name__)


async def _auto_flush_loop() -> None:
    """Periodically commit any buffer with content that hasn't been appended to in > flush_ms.

    This handles the race where Gemini returns a transcription *after* stopRecording
    already called /flush on an empty buffer — without this loop the chunk would sit
    in the buffer indefinitely.
    """
    log = structlog.get_logger("app.auto_flush")
    repo = get_transcript_repository()
    while True:
        await asyncio.sleep(1.0)
        for session_id in buffer_registry.stale_sessions():
            buf = buffer_registry.get(session_id)
            text = await buf.take()
            if not text.strip():
                continue
            try:
                rec = repo.commit(session_id, text.strip(), source="auto_flush")
                log.info(
                    "auto_flush.committed",
                    session_id=session_id,
                    version=rec.version,
                    text_preview=rec.text[:200],
                )
                asyncio.create_task(on_transcript_saved(session_id, rec.version, rec.text))
                await publish(
                    session_id,
                    SSEEvent(event="transcript", data=rec.model_dump()).model_dump(),
                )
            except Exception:
                log.exception("auto_flush.error", session_id=session_id)


@asynccontextmanager
async def lifespan(app: FastAPI):
    _startup_log.info("app.lifespan_start", data_dir=str(settings.data_dir))
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    flush_task = asyncio.create_task(_auto_flush_loop())
    _startup_log.info("app.auto_flush_started")
    yield
    flush_task.cancel()
    _startup_log.info("app.lifespan_stop")


app = FastAPI(title="Resolution Voice Canvas API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(HttpAuditMiddleware)

app.include_router(health.router, prefix="/api")
app.include_router(transcripts.router, prefix="/api/transcripts")
app.include_router(sse.router, prefix="/api/sse")
