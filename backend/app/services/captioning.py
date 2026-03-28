"""
Gemini Live (or compatible) captioning ingress — wire your streaming client here.

This module only documents the contract; actual WebSocket/SDK integration belongs in
a thin service class that forwards text into `TranscriptBuffer` + FastAPI handlers.
"""

from __future__ import annotations

from typing import Protocol


class CaptionStream(Protocol):
    async def iter_text(self):  # yields str chunks
        ...
