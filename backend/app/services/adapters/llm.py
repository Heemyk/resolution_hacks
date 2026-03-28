"""
LLM adapter — all Claude / Anthropic calls should go through here.
Swap implementation via settings without changing agent code.
"""

from __future__ import annotations

from typing import Any, AsyncIterator, Callable, Awaitable

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

    async def run_with_tools(
        self,
        *,
        model: str,
        system: str,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
        tool_fns: dict[str, Callable[..., Awaitable[str]]],
        max_tokens: int = 4096,
        max_tool_rounds: int = 5,
        on_tool_result: Callable[[str, dict[str, Any], str], Awaitable[None]] | None = None,
    ) -> str:
        """Anthropic tool-use loop: call → execute tools → repeat until text response."""
        if not self._client:
            raise AdapterError("ANTHROPIC_API_KEY not configured")

        msgs: list[dict[str, Any]] = list(messages)

        for round_num in range(max_tool_rounds):
            log.info(
                "external.anthropic.tool_round",
                round=round_num,
                model=model,
                message_count=len(msgs),
            )
            response = await self._client.messages.create(
                model=model,
                max_tokens=max_tokens,
                system=system,
                messages=msgs,
                tools=tools,  # type: ignore[arg-type]
            )
            log.info(
                "external.anthropic.tool_response",
                round=round_num,
                stop_reason=response.stop_reason,
                content_types=[b.type for b in response.content],
            )

            if response.stop_reason != "tool_use":
                return "".join(b.text for b in response.content if b.type == "text")

            # Execute every tool_use block in this response
            tool_results: list[dict[str, Any]] = []
            for block in response.content:
                if block.type != "tool_use":
                    continue
                log.info(
                    "external.anthropic.tool_call",
                    tool_name=block.name,
                    tool_input=block.input,
                )
                fn = tool_fns.get(block.name)
                if fn is None:
                    content = f"Tool '{block.name}' not available."
                    is_error = True
                else:
                    try:
                        content = await fn(**block.input)
                        is_error = False
                        log.info(
                            "external.anthropic.tool_result",
                            tool_name=block.name,
                            preview=content[:300],
                        )
                        if on_tool_result:
                            await on_tool_result(block.name, dict(block.input), content)
                    except Exception as exc:
                        content = f"Error calling {block.name}: {exc}"
                        is_error = True
                        log.error(
                            "external.anthropic.tool_fn_error",
                            tool_name=block.name,
                            error=str(exc),
                        )
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": content,
                    **({"is_error": True} if is_error else {}),
                })

            msgs.append({"role": "assistant", "content": response.content})  # type: ignore[arg-type]
            msgs.append({"role": "user", "content": tool_results})

        log.warning("external.anthropic.tool_max_rounds_exceeded", max_rounds=max_tool_rounds)
        return ""

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
