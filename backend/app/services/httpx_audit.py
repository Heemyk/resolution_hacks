"""Event hooks for httpx: log outbound requests and responses (structured)."""

from __future__ import annotations

import json
from typing import Any

import httpx
import structlog

from app.core.redact import redact_headers, redact_json_like

log = structlog.get_logger(__name__)

_MAX_BODY_LOG = 512_000


def _clip(text: str) -> str:
    if len(text) <= _MAX_BODY_LOG:
        return text
    return text[:_MAX_BODY_LOG] + f"... [truncated, total_chars={len(text)}]"


def httpx_audit_hooks(*, component: str) -> dict[str, list[Any]]:
    async def on_request(request: httpx.Request) -> None:
        body = ""
        if request.content:
            try:
                body = request.content.decode("utf-8", errors="replace")
            except Exception:
                body = f"<binary {len(request.content)} bytes>"
        try:
            parsed = json.loads(body) if body and body.strip().startswith("{") else body
            payload_log = redact_json_like(parsed) if isinstance(parsed, dict) else parsed
        except json.JSONDecodeError:
            payload_log = body
        log.info(
            "external.http.request",
            component=component,
            method=request.method,
            url=str(request.url),
            headers=redact_headers({k: v for k, v in request.headers.items()}),
            body=_clip(payload_log if isinstance(payload_log, str) else str(payload_log)),
        )

    async def on_response(response: httpx.Response) -> None:
        await response.aread()
        text = ""
        try:
            text = response.text
        except Exception:
            text = f"<unreadable body, {len(response.content)} bytes>"
        try:
            parsed = json.loads(text) if text and text.strip().startswith("{") else text
            payload_log = redact_json_like(parsed) if isinstance(parsed, dict) else parsed
        except json.JSONDecodeError:
            payload_log = text
        log.info(
            "external.http.response",
            component=component,
            status_code=response.status_code,
            url=str(response.request.url),
            headers=redact_headers({k: v for k, v in response.headers.items()}),
            body=_clip(payload_log if isinstance(payload_log, str) else str(payload_log)),
        )

    return {"request": [on_request], "response": [on_response]}


def external_httpx_client(*, component: str, timeout: float = 30.0) -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=timeout, event_hooks=httpx_audit_hooks(component=component))
