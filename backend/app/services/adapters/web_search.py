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
    return {
        "title": getattr(r, "title", "") or "",
        "url": getattr(r, "url", "") or "",
        "highlights": highlights,
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

    def format_for_llm(self, results: list[dict[str, Any]]) -> str:
        if not results:
            return "No results found."
        lines: list[str] = []
        for i, r in enumerate(results, 1):
            lines.append(f"{i}. **{r['title']}** <{r['url']}>")
            for h in r["highlights"][:2]:
                lines.append(f"   > {h.strip()}")
        return "\n".join(lines)
