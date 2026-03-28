"""Image and web search endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.deps import get_image_search_adapter
from app.services.adapters.base import AdapterError
from app.services.adapters.image_search import ImageSearchAdapter

router = APIRouter(tags=["search"])


@router.get("/images")
async def image_search(
    q: str = Query(..., min_length=1),
    num: int = Query(default=8, ge=1, le=20),
    adapter: ImageSearchAdapter = Depends(get_image_search_adapter),
) -> dict:
    try:
        results = await adapter.search(q, num_results=num)
    except AdapterError as e:
        raise HTTPException(status_code=503, detail=str(e))
    return {"query": q, "results": results}
