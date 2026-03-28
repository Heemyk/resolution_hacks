# Frontend SSR contracts (A2UI-style)

This folder holds **cross-team contracts** between the Python backend (render jobs, agent output) and the Next.js app in `voice-canvas/`.

- **`component_manifest.example.json`** — Example registry of UI kinds the agent may emit (`component`, `mermaid`, `image`, …). Extend alongside `backend/app/schemas/a2ui.py` and the React renderers in `voice-canvas/packages/ui/`.
- **Pydantic models** live in `backend/app/schemas/a2ui.py`; keep field names stable so SSR props stay predictable.

## Flow

1. Agent / render queue produces `A2UIRenderJob` blocks.
2. Celery publishes JSON to Redis; SSE delivers to the browser.
3. Next.js maps each block to a server or client component using the shared `kind` + `payload` shape.
