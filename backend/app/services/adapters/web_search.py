"""Web search adapter backed by Exa (exa-py sync SDK via asyncio.to_thread)."""

from __future__ import annotations

import asyncio
from typing import Any

import structlog
from exa_py import Exa

from app.core.config import settings
from app.services.adapters.base import AdapterError, ServiceAdapter

log = structlog.get_logger(__name__)


def _format_result(r: Any) -> dict[str, Any]:
    highlights: list[str] = []
    if hasattr(r, "highlights") and r.highlights:
        highlights = [h for h in r.highlights if h]
    image_url: str = getattr(r, "image", None) or ""
    return {
        "title": getattr(r, "title", "") or "",
        "url": getattr(r, "url", "") or "",
        "highlights": highlights,
        "image": image_url,
    }


def _format_image_result(r: Any) -> dict[str, Any]:
    """Format an Exa result for image-focused search — includes image_links from extras."""
    image_url: str = getattr(r, "image", None) or ""
    extras = getattr(r, "extras", None) or {}
    image_links: list[str] = []
    if isinstance(extras, dict):
        image_links = [img for img in extras.get("imageLinks", []) if img]
    elif hasattr(extras, "image_links") and extras.image_links:
        image_links = [img for img in extras.image_links if img]
    return {
        "title": getattr(r, "title", "") or "",
        "url": getattr(r, "url", "") or "",
        "image": image_url,
        "image_links": image_links,
    }


class WebSearchAdapter(ServiceAdapter):
    name = "exa"

    def __init__(self) -> None:
        self._exa: Exa | None = None
        if settings.exa_api_key:
            self._exa = Exa(api_key=settings.exa_api_key)

    async def health(self) -> dict[str, Any]:
        return {"ok": bool(self._exa), "provider": self.name}

    async def search(self, query: str, num_results: int = 8) -> list[dict[str, Any]]:
        if not self._exa:
            raise AdapterError("EXA_API_KEY not configured")

        log.info("exa.search_start", query=query, num_results=num_results)

        def _run() -> list[dict[str, Any]]:
            res = self._exa.search_and_contents(
                query,
                type="auto",
                num_results=num_results,
                highlights={"max_characters": 4000},
            )
            return [_format_result(r) for r in res.results]

        results = await asyncio.to_thread(_run)
        log.info("exa.search_done", query=query, result_count=len(results))
        return results

    async def search_images(self, query: str, num_results: int = 6) -> list[dict[str, Any]]:
        """Search for image-rich results. Returns results with image URLs."""
        if not self._exa:
            raise AdapterError("EXA_API_KEY not configured")

        log.info("exa.image_search_start", query=query, num_results=num_results)

        def _run() -> list[dict[str, Any]]:
            res = self._exa.search_and_contents(
                query,
                type="auto",
                num_results=num_results,
                extras={"imageLinks": 3},
            )
            return [_format_image_result(r) for r in res.results]

        results = await asyncio.to_thread(_run)
        # Filter to only results that actually have images
        with_images = [r for r in results if r["image"] or r["image_links"]]
        log.info(
            "exa.image_search_done",
            query=query,
            total=len(results),
            with_images=len(with_images),
        )
        return with_images or results  # fallback to all if none had images

    def format_for_llm(self, results: list[dict[str, Any]]) -> str:
        if not results:
            return "No results found."
        lines: list[str] = []
        for i, r in enumerate(results, 1):
            lines.append(f"{i}. **{r['title']}** <{r['url']}>")
            for h in r.get("highlights", [])[:2]:
                lines.append(f"   > {h.strip()}")
        return "\n".join(lines)

    def format_images_for_llm(self, results: list[dict[str, Any]]) -> str:
        """Format image search results as a JSON array the agent can embed as image UIBlocks."""
        if not results:
            return "No image results found."
        import json
        images = []
        for r in results:
            if r["image"]:
                images.append({"url": r["image"], "title": r["title"], "source": r["url"]})
            for link in r.get("image_links", [])[:1]:
                images.append({"url": link, "title": r["title"], "source": r["url"]})
        return json.dumps(images[:8])
