"""Discover skills from `SKILL.md` files (OpenClaw-style layout)."""

from __future__ import annotations

from pathlib import Path

from app.core.config import settings


def discover_skill_ids(skills_dir: Path | None = None) -> list[str]:
    root = (skills_dir or settings.skills_dir).resolve()
    if not root.exists():
        return []
    ids: list[str] = []
    for skill_md in root.rglob("SKILL.md"):
        rel = skill_md.parent.relative_to(root)
        ids.append(str(rel).replace("\\", "/"))
    return sorted(ids)


def read_skill_md(skill_id: str, skills_dir: Path | None = None) -> str | None:
    root = (skills_dir or settings.skills_dir).resolve()
    path = root / skill_id / "SKILL.md"
    if not path.is_file():
        return None
    return path.read_text(encoding="utf-8")
