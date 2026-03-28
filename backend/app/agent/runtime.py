"""
Agent runtime: one turn = context assembly → LLM stream → optional tool hooks.
No workflow graph — extend `run_turn` with tools as needed during the hackathon.
"""

from __future__ import annotations

from typing import Any, AsyncIterator

from app.agent.context import build_system_prompt
from app.agent.memory import ChatMessage, MessageWindow
from app.services.adapters.llm import LLMAdapter
from app.skills.loader import discover_skill_ids
from app.skills.registry import SkillRegistry


class AgentRuntime:
    def __init__(
        self,
        llm: LLMAdapter,
        skills: SkillRegistry,
        model: str = "claude-sonnet-4-20250514",
    ) -> None:
        self._llm = llm
        self._skills = skills
        self.model = model
        self.window = MessageWindow()

    def select_skills(self, _transcript_tail: str) -> list[str]:
        """Cheap gate; replace with embedding retrieval (OpenClaw-style selective injection)."""
        ids = discover_skill_ids(self._skills.skills_dir)
        return ids[:5] if ids else []

    async def run_turn(
        self,
        *,
        user_text: str,
        system_base: str,
        extra_messages: list[dict[str, Any]] | None = None,
    ) -> AsyncIterator[str]:
        skill_ids = self.select_skills(user_text)
        system = build_system_prompt(base=system_base, skill_registry=self._skills, skill_ids=skill_ids)
        self.window.append(ChatMessage(role="user", content=user_text))
        messages: list[dict[str, Any]] = list(extra_messages or [])
        messages.extend(self.window.as_api_messages())
        async for chunk in self._llm.stream_messages(
            model=self.model,
            system=system,
            messages=messages,
        ):
            yield chunk
