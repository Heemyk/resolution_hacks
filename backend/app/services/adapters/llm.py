"""
LLM adapter — all Claude / Anthropic calls should go through here.
Swap implementation via settings without changing agent code.
"""

from __future__ import annotations

from typing import Any, AsyncIterator

import anthropic
import structlog

from app.core.config import settings
from app.services.adapters.base import AdapterError, ServiceAdapter

log = structlog.get_logger(__name__)


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
        log.info(
            "external.anthropic.stream_start",
            model=model,
            max_tokens=max_tokens,
            system=system,
            messages=messages,
        )
        async with self._client.messages.stream(
            model=model,
            max_tokens=max_tokens,
            system=system,
            messages=messages,
        ) as stream:
            acc: list[str] = []
            async for text in stream.text_stream:
                acc.append(text)
                log.debug(
                    "external.anthropic.delta",
                    delta=text,
                    total_len=sum(len(x) for x in acc),
                )
                yield text
            full = "".join(acc)
            log.info(
                "external.anthropic.stream_end",
                model=model,
                response_text=full,
                response_len=len(full),
            )

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
        log.info(
            "external.anthropic.complete_start",
            model=model,
            max_tokens=max_tokens,
            system=system,
            messages=messages,
        )
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
        out = "".join(parts)
        log.info(
            "external.anthropic.complete_end",
            model=model,
            response_text=out,
            stop_reason=getattr(msg, "stop_reason", None),
            usage=getattr(msg, "usage", None),
        )
        return out
