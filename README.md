# Resolution Hacks — Live voice → UI transposition

Speak about a concept; the system persists live transcription, runs a decentralised agent loop (OpenClaw-style context + skills, no workflow engine), and pushes render jobs through queues so the UI canvas shows components, diagrams, and retrieved content in real time.

## Repo layout

| Path | Role |
|------|------|
| `voice-canvas/` | Next.js app (runs locally, outside Docker). SSR + UI packages. |
| `voice-canvas/packages/ui/` | Custom component library (`@resolution/ui`) — `useSessionSSE` hook, `CanvasHost`. |
| `backend/` | FastAPI (HTTP + SSE), Celery workers, adapters, agent runtime, transcript persistence. |
| `backend/frontend_ssr/` | A2UI payload contracts between render jobs and Next SSR. |
| `docker-compose.yml` | **Redis only** — broker + lock store for Celery. Frontend and backend run on the host. |

## Prerequisites

- Python 3.11+
- Node 20+
- Docker Desktop (for Redis)

## Spin up

Open **four terminals**.

### 1 — Redis

Start Docker Desktop first, then:

```bash
docker compose up -d redis
```

### 2 — Backend API

```bash
cd backend
# First time only:
python -m venv .venv
pip install -r requirements.txt
cp .env.example .env   # Windows: copy .env.example .env

# Fill in .env — minimum required keys:
#   ANTHROPIC_API_KEY=...   (Claude — agent pipeline won't fire without this)
#   GEMINI_API_KEY=...      (optional, for backend voice adapter)

.venv\Scripts\activate      # Windows
# source .venv/bin/activate  # Mac/Linux

uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 3 — Celery worker

Same venv, new terminal:

```bash
cd backend
.venv\Scripts\activate
celery -A app.tasks.celery_app worker --loglevel=info
```

### 4 — Frontend

```bash
cd voice-canvas
npm install                 # first time only
cp .env.example .env.local  # Windows: copy .env.example .env.local

# Fill in .env.local — required:
#   NEXT_PUBLIC_GEMINI_API_KEY=...  (Gemini Live — voice auto-connects on page load)
#   NEXT_PUBLIC_API_URL=http://127.0.0.1:8000  (already set in example)

npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Data flow

```
Gemini Live (browser mic)
  │ inputTranscription chunks
  ▼
POST /api/transcripts/ingest   (FastAPI — buffers chunks in memory)
  │ on size/stop-recording flush
  ▼
TranscriptRepository.commit()  (append-only versions.jsonl per session)
  │
  ▼
on_transcript_saved (Celery task)
  │
  ▼
AgentRuntime.run_turn()        (Claude via LLMAdapter + injected SKILL.md snippets)
  │ render job
  ▼
render_queue (Celery task)     (publishes SSE event via Redis pub/sub)
  │
  ▼
GET /api/sse/stream?session_id=...  (FastAPI SSE — streamed to browser)
  │
  ▼
LiveCanvasPanel                (renders A2UI blocks: markdown, mermaid, images, components)
```

## Key behaviour notes

- **Auto-connect**: the voice component connects to Gemini Live automatically on page load. Tap the circle to start/stop the mic.
- **Flush on stop**: stopping the mic (or recording session ending) calls `POST /api/transcripts/flush` to persist any buffered text — nothing is lost between recording sessions.
- **Session isolation**: each page load gets a unique `session_id`; transcripts, SSE events, and agent state are all scoped to it.
- **Task queues in memory**: Celery tasks are in-memory (Redis-backed, ephemeral). Transcripts themselves are persisted to disk under `backend/data/`.

## Environment variables

### `backend/.env`

| Key | Required | Description |
|-----|----------|-------------|
| `ANTHROPIC_API_KEY` | **Yes** | Claude — all LLM calls go through `LLMAdapter` |
| `GEMINI_API_KEY` | No | Backend voice adapter (frontend uses its own key) |
| `EXA_API_KEY` | No | Web search adapter (stub — not wired yet) |
| `REDIS_URL` | No | Defaults to `redis://127.0.0.1:6379/0` |

### `voice-canvas/.env.local`

| Key | Required | Description |
|-----|----------|-------------|
| `NEXT_PUBLIC_GEMINI_API_KEY` | **Yes** | Gemini Live — browser-side transcription |
| `NEXT_PUBLIC_API_URL` | No | Defaults to `http://127.0.0.1:8000` |

## Architecture notes

- **OpenClaw decentralised**: no workflow DAG. Each transcript save enqueues an independent Celery job. Skills are `SKILL.md` files discovered at runtime and injected into the system prompt.
- **A2UI**: agent emits structured UI blocks (`kind: markdown | mermaid | component | image`). `LiveCanvasPanel` renders them via `CanvasHost`.
- **SSE**: clients subscribe to `/api/sse/stream?session_id=...` for `transcript`, `render`, `agent_log`, and `ping` events.

See `backend/openclaw_agent_decription.txt` for OpenClaw terminology.
