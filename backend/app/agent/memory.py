"""Long window of messages (OpenClaw-style session file abstraction, in-memory for hackathon)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

Role = Literal["user", "assistant", "system"]


@dataclass
class ChatMessage:
    role: Role
    content: str
    meta: dict[str, Any] = field(default_factory=dict)


class MessageWindow:
    def __init__(self, max_messages: int = 200) -> None:
        self.max_messages = max_messages
        self._messages: list[ChatMessage] = []

    def append(self, msg: ChatMessage) -> None:
        self._messages.append(msg)
        if len(self._messages) > self.max_messages:
            self._messages = self._messages[-self.max_messages :]

    def as_api_messages(self) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        for m in self._messages:
            out.append({"role": m.role, "content": m.content})
        return out
