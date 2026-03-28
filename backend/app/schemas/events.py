from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class SSEEvent(BaseModel):
    event: Literal["transcript", "render", "agent_log", "ping", "error", "agent_plan", "tool_result"]
    data: dict[str, Any] = Field(default_factory=dict)
