"""
LLM adapter — all Claude / Anthropic calls should go through here.
Swap implementation via settings without changing agent code.
"""

from __future__ import annotations

from typing import Any, AsyncIterator

import anthropic

from app.core.config import settings
from app.services.adapters.base import AdapterError, ServiceAdapter


class LLMAdapter(ServiceAdapter):
    name = "anthropic_claude"

    def __init__(self) -> None:
        self._client: anthropic.AsyncAnthropic | None = None
        if settings.anthropic_api_key:
            self._client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

    async def health(self) -> dict[str, Any]:
        return {"ok": bool(self._client), "provider": self.name}

    async def stream_messages(
        self,
        *,
        model: str,
        system: str,
        messages: list[dict[str, Any]],
        max_tokens: int = 4096,
    ) -> AsyncIterator[str]:
        if not self._client:
            raise AdapterError("ANTHROPIC_API_KEY not configured")
        async with self._client.messages.stream(
            model=model,
            max_tokens=max_tokens,
            system=system,
            messages=messages,
        ) as stream:
            async for text in stream.text_stream:
                yield text

    async def complete(
        self,
        *,
        model: str,
        system: str,
        messages: list[dict[str, Any]],
        max_tokens: int = 4096,
    ) -> str:
        if not self._client:
            raise AdapterError("ANTHROPIC_API_KEY not configured")
        msg = await self._client.messages.create(
            model=model,
            max_tokens=max_tokens,
            system=system,
            messages=messages,
        )
        parts: list[str] = []
        for block in msg.content:
            if block.type == "text":
                parts.append(block.text)
        return "".join(parts)
