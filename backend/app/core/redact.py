"""Redact secrets before logging request bodies, headers, or JSON-like dicts."""

from __future__ import annotations

import re
from typing import Any

_REDACT_KEYS = frozenset(
    k.lower()
    for k in (
        "authorization",
        "x-api-key",
        "api-key",
        "api_key",
        "openai_api_key",
        "anthropic_api_key",
        "password",
        "secret",
        "token",
    )
)

_BEARER = re.compile(r"(?i)(bearer\s+)[^\s]+")


def redact_headers(headers: dict[str, str]) -> dict[str, str]:
    out = {}
    for k, v in headers.items():
        lk = k.lower()
        if lk in _REDACT_KEYS or lk == "authorization":
            out[k] = "[REDACTED]"
        else:
            out[k] = v
    return out


def redact_string(s: str) -> str:
    return _BEARER.sub(r"\1[REDACTED]", s)


def redact_value(key: str, value: Any) -> Any:
    if key.lower() in _REDACT_KEYS:
        return "[REDACTED]"
    if isinstance(value, str) and "Bearer " in value:
        return redact_string(value)
    return value


def redact_json_like(obj: Any) -> Any:
    """Deep-copy dict/list structures and redact known sensitive keys."""
    if isinstance(obj, dict):
        return {k: redact_value(k, redact_json_like(v)) for k, v in obj.items()}
    if isinstance(obj, list):
        return [redact_json_like(x) for x in obj]
    if isinstance(obj, str):
        return redact_string(obj) if "Bearer " in obj else obj
    return obj
