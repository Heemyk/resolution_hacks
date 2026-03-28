"""Append-only mini versioning for transcript segments (per session)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field


class MiniVersionRecord(BaseModel):
    version: int
    session_id: str
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    text: str
    source: str = "live"  # e.g. gemini_live, manual
    meta: dict[str, Any] = Field(default_factory=dict)
