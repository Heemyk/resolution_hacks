"""Voice agent HTTP API (your OpenClaw-style decentralised gateway or vendor)."""

from __future__ import annotations

from typing import Any

import httpx

from app.core.config import settings
from app.services.adapters.base import ServiceAdapter


class VoiceAgentAdapter(ServiceAdapter):
    name = "voice_agent"

    async def health(self) -> dict[str, Any]:
        if not settings.voice_agent_base_url:
            return {"ok": False, "reason": "VOICE_AGENT_BASE_URL unset"}
        return {"ok": True, "base_url": settings.voice_agent_base_url}

    async def post_event(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        if not settings.voice_agent_base_url:
            return {}
        url = settings.voice_agent_base_url.rstrip("/") + path
        headers = {}
        if settings.voice_agent_api_key:
            headers["Authorization"] = f"Bearer {settings.voice_agent_api_key}"
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(url, json=payload, headers=headers)
            r.raise_for_status()
            return r.json() if r.content else {}
