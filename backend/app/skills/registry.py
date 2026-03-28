from __future__ import annotations

from pathlib import Path

from app.core.config import settings
from app.skills.loader import read_skill_md


class SkillRegistry:
    def __init__(self, skills_dir: Path | None = None) -> None:
        self.skills_dir = (skills_dir or settings.skills_dir).resolve()

    def get_skill_body(self, skill_id: str) -> str | None:
        return read_skill_md(skill_id, self.skills_dir)
