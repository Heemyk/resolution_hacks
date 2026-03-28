from functools import lru_cache

from app.persistence.transcripts.repository import TranscriptRepository
from app.services.adapters.llm import LLMAdapter
from app.skills.registry import SkillRegistry


@lru_cache
def get_transcript_repository() -> TranscriptRepository:
    return TranscriptRepository()


@lru_cache
def get_llm_adapter() -> LLMAdapter:
    return LLMAdapter()


@lru_cache
def get_skill_registry() -> SkillRegistry:
    return SkillRegistry()
