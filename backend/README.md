# Backend — FastAPI, SSE, Celery, Redis

## Run

1. Start Redis: from repo root, `docker compose up -d redis`.
2. `python -m venv .venv` then activate and `pip install -r requirements.txt`.
3. Copy `.env.example` to `.env`.
4. API: `uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`
5. Worker: `celery -A app.tasks.celery_app worker --loglevel=info`

## Modules

- `app/api/` — HTTP routes; SSE stream for client events.
- `app/services/adapters/` — Pluggable integrations; **all LLM calls go through `LLMAdapter`**.
- `app/agent/` — Session message window + tool loop shell (no workflow DAG).
- `app/skills/` — OpenClaw-style `SKILL.md` discovery and selective injection.
- `app/persistence/transcripts/` — Buffered writes + mini versioning on disk under `DATA_DIR`.
- `app/tasks/` — Celery app, Redis-backed locks, jobs triggered after transcript saves and for render queue.

## SSE

Clients subscribe to `/api/sse/stream?session_id=...` for server-pushed render and transcript events.
