"""A2UI-style render payloads (agent → Next SSR / client)."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class UIBlock(BaseModel):
    kind: Literal["component", "mermaid", "image", "markdown", "raw_html"]
    id: str
    payload: dict[str, Any] = Field(default_factory=dict)


class A2UIRenderJob(BaseModel):
    session_id: str
    job_id: str
    blocks: list[UIBlock] = Field(default_factory=list)
    meta: dict[str, Any] = Field(default_factory=dict)
