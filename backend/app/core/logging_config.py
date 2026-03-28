"""Single structured logging configuration for the API (JSON lines, shared schema).

Uses structlog's stdlib integration correctly: ``JSONRenderer`` runs only inside
``ProcessorFormatter``, and ``wrap_for_formatter`` bridges BoundLogger → stdlib
so each line is one flat JSON object (no stringified blob in ``event``).
"""

from __future__ import annotations

import logging
import sys

import structlog
from structlog.typing import Processor

from app.core.config import settings
from app.core.log_constants import LOG_SCHEMA_VERSION, LOG_SERVICE


def configure_logging() -> None:
    level_name = settings.log_level.upper()
    level = getattr(logging, level_name, logging.INFO)

    timestamper = structlog.processors.TimeStamper(fmt="iso", utc=True)

    shared_pre_chain: list[Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        timestamper,
        structlog.processors.StackInfoRenderer(),
        structlog.processors.CallsiteParameterAdder(
            {
                structlog.processors.CallsiteParameter.FILENAME,
                structlog.processors.CallsiteParameter.FUNC_NAME,
                structlog.processors.CallsiteParameter.LINENO,
            }
        ),
        structlog.processors.dict_tracebacks,
    ]

    structlog.configure(
        processors=shared_pre_chain
        + [
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    formatter = structlog.stdlib.ProcessorFormatter(
        processor=structlog.processors.JSONRenderer(),
        foreign_pre_chain=shared_pre_chain,
    )

    root = logging.getLogger()
    root.handlers.clear()
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)
    root.setLevel(level)
    root.addHandler(handler)

    for name in ("uvicorn", "uvicorn.access", "uvicorn.error", "httpx", "httpcore"):
        logging.getLogger(name).handlers.clear()
        logging.getLogger(name).propagate = True
        logging.getLogger(name).setLevel(level)

    # SSE library debug noise (keepalive ping bytes)
    sse = logging.getLogger("sse_starlette")
    sse.handlers.clear()
    sse.propagate = True
    sse.setLevel(logging.WARNING)

    structlog.contextvars.bind_contextvars(
        log_schema_version=LOG_SCHEMA_VERSION,
        service=LOG_SERVICE,
        component="api",
    )


def get_logger(name: str | None = None) -> structlog.stdlib.BoundLogger:
    return structlog.get_logger(name)
