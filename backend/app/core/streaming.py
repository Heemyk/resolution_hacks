"""In-memory buffers for live caption chunks before persistence + job dispatch."""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from typing import Callable, Coroutine

from app.core.config import settings


@dataclass
class TranscriptBuffer:
    """Holds partial text for a session until flush (size or time)."""

    session_id: str
    text: str = ""
    last_append_at: float = field(default_factory=time.monotonic)
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    async def append(self, chunk: str) -> None:
        async with self._lock:
            self.text += chunk
            self.last_append_at = time.monotonic()

    def should_flush(self) -> bool:
        if len(self.text) >= settings.transcript_buffer_max_chars:
            return True
        return (time.monotonic() - self.last_append_at) * 1000 >= settings.transcript_buffer_flush_ms

    async def take(self) -> str:
        async with self._lock:
            out = self.text
            self.text = ""
            return out


class BufferRegistry:
    def __init__(self) -> None:
        self._buffers: dict[str, TranscriptBuffer] = {}

    def get(self, session_id: str) -> TranscriptBuffer:
        if session_id not in self._buffers:
            self._buffers[session_id] = TranscriptBuffer(session_id=session_id)
        return self._buffers[session_id]


buffer_registry = BufferRegistry()
