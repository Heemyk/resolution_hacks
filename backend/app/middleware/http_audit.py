"""Per-request correlation and inbound HTTP audit (structured)."""

from __future__ import annotations

import time
import uuid

import structlog
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.log_constants import LOG_SCHEMA_VERSION, LOG_SERVICE

log = structlog.get_logger(__name__)


class HttpAuditMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(
            log_schema_version=LOG_SCHEMA_VERSION,
            service=LOG_SERVICE,
            component="api",
            request_id=request_id,
        )

        path = request.url.path
        is_health = path.rstrip("/").endswith("/health")
        start = time.perf_counter()
        if is_health:
            log.debug(
                "http.inbound.start",
                method=request.method,
                path=path,
                query=dict(request.query_params),
                client_host=request.client.host if request.client else None,
            )
        else:
            log.info(
                "http.inbound.start",
                method=request.method,
                path=path,
                query=dict(request.query_params),
                client_host=request.client.host if request.client else None,
            )

        try:
            response = await call_next(request)
        except Exception:
            log.exception(
                "http.inbound.error",
                duration_ms=round((time.perf_counter() - start) * 1000, 3),
            )
            raise

        elapsed_ms = round((time.perf_counter() - start) * 1000, 3)
        payload = {
            "method": request.method,
            "path": path,
            "status_code": response.status_code,
            "duration_ms": elapsed_ms,
        }
        if is_health:
            log.debug("http.inbound.complete", **payload)
        else:
            log.info("http.inbound.complete", **payload)

        response.headers["X-Request-ID"] = request_id
        return response
