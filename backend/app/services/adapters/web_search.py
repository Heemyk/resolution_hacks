"""Web search adapter (e.g. Exa) — implement HTTP calls behind this interface."""

from __future__ import annotations

from typing import Any

from app.core.config import settings
from app.services.httpx_audit import external_httpx_client
from app.services.adapters.base import AdapterError, ServiceAdapter


class WebSearchAdapter(ServiceAdapter):
    name = "exa"

    async def health(self) -> dict[str, Any]:
        return {"ok": bool(settings.exa_api_key), "provider": self.name}

    async def search(self, query: str, num_results: int = 5) -> list[dict[str, Any]]:
        if not settings.exa_api_key:
            raise AdapterError("EXA_API_KEY not configured")
        # Placeholder: replace with Exa REST contract your team uses
        async with external_httpx_client(component="exa_web_search") as client:
            r = await client.post(
                "https://api.exa.ai/search",
                headers={"x-api-key": settings.exa_api_key, "Content-Type": "application/json"},
                json={"query": query, "numResults": num_results},
            )
            r.raise_for_status()
            data = r.json()
            return list(data.get("results") or data.get("items") or [])
