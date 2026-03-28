"""Triggered after a transcript version is committed — kicks agent/render pipeline."""

from __future__ import annotations

import uuid

from app.tasks.celery_app import celery_app
from app.tasks.jobs.render_queue import enqueue_render_job


@celery_app.task(name="transcript.on_saved")
def on_transcript_saved(session_id: str, version: int, text_preview: str) -> str:
    job_id = str(uuid.uuid4())
    enqueue_render_job.delay(session_id, job_id, version, text_preview[:2000])
    return job_id
