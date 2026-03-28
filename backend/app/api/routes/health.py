import structlog
from fastapi import APIRouter

from app.api.deps import get_llm_adapter
from app.core.config import settings

router = APIRouter(tags=["health"])
log = structlog.get_logger(__name__)


@router.get("/health")
async def health() -> dict:
    llm = get_llm_adapter()
    payload = {
        "status": "ok",
        "data_dir": str(settings.data_dir),
        "llm": await llm.health(),
    }
    log.debug("health", **payload)
    return payload
