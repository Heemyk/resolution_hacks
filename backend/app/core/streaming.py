"""In-memory buffers for live caption chunks before persistence + job dispatch."""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from typing import Callable, Coroutine

import structlog

from app.core.config import settings

log = structlog.get_logger(__name__)


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
            log.debug(
                "buffer.append",
                session_id=self.session_id,
                chunk=chunk,
                buffer_len=len(self.text),
                last_append_at=self.last_append_at,
            )

    def should_flush(self) -> bool:
        by_size = len(self.text) >= settings.transcript_buffer_max_chars
        by_time = (time.monotonic() - self.last_append_at) * 1000 >= settings.transcript_buffer_flush_ms
        log.debug(
            "buffer.should_flush",
            session_id=self.session_id,
            buffer_len=len(self.text),
            by_size=by_size,
            by_time=by_time,
            max_chars=settings.transcript_buffer_max_chars,
            flush_ms=settings.transcript_buffer_flush_ms,
        )
        if by_size:
            return True
        return by_time

    async def take(self) -> str:
        async with self._lock:
            out = self.text
            self.text = ""
            log.info(
                "buffer.take",
                session_id=self.session_id,
                taken_len=len(out),
                preview=out[:500] if len(out) > 500 else out,
            )
            return out


class BufferRegistry:
    def __init__(self) -> None:
        self._buffers: dict[str, TranscriptBuffer] = {}

    def get(self, session_id: str) -> TranscriptBuffer:
        if session_id not in self._buffers:
            self._buffers[session_id] = TranscriptBuffer(session_id=session_id)
            log.info(
                "buffer.registry.new",
                session_id=session_id,
                total_buffers=len(self._buffers),
            )
        else:
            log.debug(
                "buffer.registry.hit",
                session_id=session_id,
                total_buffers=len(self._buffers),
            )
        return self._buffers[session_id]


buffer_registry = BufferRegistry()
