"""Common adapter surface for external APIs (LLM, voice, search, …)."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class AdapterError(Exception):
    pass


class ServiceAdapter(ABC):
    name: str = "base"

    @abstractmethod
    async def health(self) -> dict[str, Any]:
        """Cheap readiness check for ops."""
