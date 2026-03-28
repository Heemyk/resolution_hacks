"""Assemble model context: base prompt + skill snippets + rolling transcript summary."""

from __future__ import annotations

from app.agent.memory import MessageWindow
from app.skills.registry import SkillRegistry


def build_system_prompt(
    *,
    base: str,
    skill_registry: SkillRegistry,
    skill_ids: list[str] | None = None,
) -> str:
    parts = [base.strip()]
    for sid in skill_ids or []:
        body = skill_registry.get_skill_body(sid)
        if body:
            parts.append(f"--- Skill: {sid} ---\n{body}")
    return "\n\n".join(parts)
