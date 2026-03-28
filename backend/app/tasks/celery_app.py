from __future__ import annotations

from celery import Celery

from app.core.config import settings

celery_app = Celery(
    "resolution",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=["app.tasks.jobs.on_transcript_saved", "app.tasks.jobs.render_queue"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    task_track_started=True,
)
