from functools import lru_cache

from app.agent.orchestrator import Orchestrator
from app.core.config import settings
from app.persistence.transcripts.repository import TranscriptRepository
from app.services.adapters.llm import LLMAdapter
from app.services.adapters.web_search import WebSearchAdapter
from app.skills.registry import SkillRegistry


@lru_cache
def get_transcript_repository() -> TranscriptRepository:
    return TranscriptRepository()


@lru_cache
def get_llm_adapter() -> LLMAdapter:
    return LLMAdapter()


@lru_cache
def get_web_search_adapter() -> WebSearchAdapter:
    return WebSearchAdapter()


@lru_cache
def get_skill_registry() -> SkillRegistry:
    return SkillRegistry()


@lru_cache
def get_orchestrator() -> Orchestrator:
    return Orchestrator(llm=get_llm_adapter(), agent_name=settings.agent_name)
