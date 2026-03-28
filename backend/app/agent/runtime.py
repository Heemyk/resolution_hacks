"""
Agent runtime: one turn = context assembly → LLM tool-use loop → return text.
No workflow graph — extend `run_turn` with tools as needed during the hackathon.
"""

from __future__ import annotations

from typing import Any, AsyncIterator, Awaitable, Callable

import structlog

from app.agent.context import build_system_prompt
from app.agent.memory import ChatMessage, MessageWindow
from app.services.adapters.llm import LLMAdapter
from app.services.adapters.web_search import WebSearchAdapter
from app.skills.loader import discover_skill_ids
from app.skills.registry import SkillRegistry

log = structlog.get_logger(__name__)

# Anthropic tool definitions for Exa web search
EXA_SEARCH_TOOL: dict[str, Any] = {
    "name": "exa_search",
    "description": (
        "Search the web for up-to-date information using Exa. "
        "Use this whenever the user's transcript references current events, "
        "specific data, statistics, or anything that benefits from live web context."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "The search query",
            },
            "num_results": {
                "type": "integer",
                "description": "Number of results to return (default 6)",
                "default": 6,
            },
        },
        "required": ["query"],
    },
}

EXA_IMAGE_SEARCH_TOOL: dict[str, Any] = {
    "name": "exa_image_search",
    "description": (
        "Search the web for images related to a topic using Exa. "
        "Returns a JSON array of image URLs with titles. "
        "Use this when the user's transcript or question would benefit from visual illustrations, "
        "diagrams, photos, or infographics — e.g. showing what something looks like, "
        "comparing visual examples, or illustrating a concept with real images. "
        "Emit the results as image UIBlocks: [{\"kind\": \"image\", \"payload\": {\"url\": \"...\", \"caption\": \"...\"}}]"
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "The image search query",
            },
            "num_results": {
                "type": "integer",
                "description": "Number of image results to return (default 4)",
                "default": 4,
            },
        },
        "required": ["query"],
    },
}


class AgentRuntime:
    def __init__(
        self,
        llm: LLMAdapter,
        skills: SkillRegistry,
        search: WebSearchAdapter | None = None,
        model: str = "claude-sonnet-4-20250514",
    ) -> None:
        self._llm = llm
        self._skills = skills
        self._search = search
        self.model = model
        self.window = MessageWindow()

    def select_skills(self, _transcript_tail: str) -> list[str]:
        """Cheap gate; replace with embedding retrieval (OpenClaw-style selective injection)."""
        ids = discover_skill_ids(self._skills.skills_dir)
        return ids[:5] if ids else []

    async def _exa_search(self, query: str, num_results: int = 6) -> str:
        if not self._search:
            return "Web search is not available."
        try:
            results = await self._search.search(query, num_results=num_results)
            return self._search.format_for_llm(results)
        except Exception as exc:
            log.error("agent.exa_search_error", query=query, error=str(exc))
            return f"Search failed: {exc}"

    async def _exa_image_search(self, query: str, num_results: int = 4) -> str:
        if not self._search:
            return "Web search is not available."
        try:
            results = await self._search.search_images(query, num_results=num_results)
            return self._search.format_images_for_llm(results)
        except Exception as exc:
            log.error("agent.exa_image_search_error", query=query, error=str(exc))
            return f"Image search failed: {exc}"

    async def run_turn(
        self,
        *,
        user_text: str,
        system_base: str,
        extra_messages: list[dict[str, Any]] | None = None,
        on_tool_result: Callable[[str, dict[str, Any], str], Awaitable[None]] | None = None,
    ) -> AsyncIterator[str]:
        skill_ids = self.select_skills(user_text)
        system = build_system_prompt(base=system_base, skill_registry=self._skills, skill_ids=skill_ids)
        self.window.append(ChatMessage(role="user", content=user_text))
        messages: list[dict[str, Any]] = list(extra_messages or [])
        messages.extend(self.window.as_api_messages())
        log.info(
            "agent.run_turn",
            model=self.model,
            skill_ids=skill_ids,
            user_text=user_text,
            system=system,
            messages=messages,
            extra_messages=extra_messages,
        )

        tools = [EXA_SEARCH_TOOL, EXA_IMAGE_SEARCH_TOOL] if self._search else []
        tool_fns = {
            "exa_search": self._exa_search,
            "exa_image_search": self._exa_image_search,
        } if self._search else {}

        if tools:
            response = await self._llm.run_with_tools(
                model=self.model,
                system=system,
                messages=messages,
                tools=tools,
                tool_fns=tool_fns,
                on_tool_result=on_tool_result,
            )
            yield response
        else:
            async for chunk in self._llm.stream_messages(
                model=self.model,
                system=system,
                messages=messages,
            ):
                yield chunk
