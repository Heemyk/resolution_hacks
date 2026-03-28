"""Second queue: build A2UI blocks and publish to SSE subscribers (via Redis)."""

from __future__ import annotations

import uuid

from app.core.redis_events import publish_session_json
from app.schemas.a2ui import A2UIRenderJob, UIBlock
from app.schemas.events import SSEEvent
from app.tasks.celery_app import celery_app
from app.tasks.locks import redis_lock


@celery_app.task(name="render.enqueue")
def enqueue_render_job(session_id: str, job_id: str, version: int, transcript_preview: str) -> None:
    with redis_lock(f"render:{session_id}:{version}", ttl_sec=120):
        job = A2UIRenderJob(
            session_id=session_id,
            job_id=job_id,
            blocks=[
                UIBlock(
                    kind="markdown",
                    id=str(uuid.uuid4()),
                    payload={"text": f"v{version} — {transcript_preview[:500]}"},
                )
            ],
            meta={"version": version},
        )
        ev = SSEEvent(event="render", data={"job": job.model_dump()})
        publish_session_json(session_id, ev.model_dump())
