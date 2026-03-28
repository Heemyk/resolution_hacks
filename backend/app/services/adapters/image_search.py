"""Image search adapter via Serper (Google Images proxy)."""

from __future__ import annotations

from typing import Any

from app.core.config import settings
from app.services.httpx_audit import external_httpx_client
from app.services.adapters.base import AdapterError, ServiceAdapter


class ImageSearchAdapter(ServiceAdapter):
    name = "serper_images"

    async def health(self) -> dict[str, Any]:
        return {"ok": bool(settings.serper_api_key), "provider": self.name}

    async def search(self, query: str, num_results: int = 8) -> list[dict[str, Any]]:
        if not settings.serper_api_key:
            raise AdapterError("SERPER_API_KEY not configured")
        async with external_httpx_client(component="serper_image_search") as client:
            r = await client.post(
                "https://google.serper.dev/images",
                headers={
                    "X-API-KEY": settings.serper_api_key,
                    "Content-Type": "application/json",
                },
                json={"q": query, "num": num_results},
            )
            r.raise_for_status()
            data = r.json()
            return [
                {
                    "url": item.get("imageUrl", ""),
                    "thumbnail": item.get("thumbnailUrl", ""),
                    "alt": item.get("title", query),
                    "source": item.get("link", ""),
                }
                for item in data.get("images", [])
                if item.get("imageUrl")
            ]
