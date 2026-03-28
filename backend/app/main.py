from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import structlog

from app.api.routes import health, sse, transcripts
from app.core.config import settings
from app.core.logging_config import configure_logging
from app.middleware.http_audit import HttpAuditMiddleware

configure_logging()
_startup_log = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    _startup_log.info("app.lifespan_start", data_dir=str(settings.data_dir))
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    yield
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
