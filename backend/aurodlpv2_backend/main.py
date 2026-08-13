"""FastAPI application factory."""

from __future__ import annotations

import asyncio
import os
from collections.abc import AsyncGenerator, Awaitable, Callable
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse

from aurodlpv2_backend.api.v1.router import api_v1_router
from aurodlpv2_backend.db.session import close_engine
from aurodlpv2_backend.health import ReadinessProbe, build_readiness_probe
from aurodlpv2_backend.observability.logging import configure_logging
from aurodlpv2_backend.observability.security import RateLimitMiddleware, SecurityHeadersMiddleware
from aurodlpv2_backend.settings import Settings, get_settings
from aurodlpv2_backend.storage.objects import get_object_store

ReadyzHandler = Callable[[], Awaitable[JSONResponse]]


def ensure_private_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)
    os.chmod(path, 0o700)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None]:
    settings = get_settings()
    configure_logging()
    await asyncio.to_thread(ensure_private_dir, settings.attachment_temp_dir)
    await asyncio.to_thread(get_object_store().ensure_bucket)
    yield
    await close_engine()


async def healthz() -> dict[str, str]:
    return {"status": "ok"}


def build_readyz_handler(probe: ReadinessProbe) -> ReadyzHandler:
    async def readyz() -> JSONResponse:
        readiness = await probe()
        return JSONResponse(
            status_code=200 if readiness.ready else 503,
            content=readiness.as_dict(),
        )

    return readyz


def create_app(
    settings: Settings | None = None,
    readiness_probe: ReadinessProbe | None = None,
) -> FastAPI:
    resolved_settings = settings or get_settings()
    probe = readiness_probe or build_readiness_probe(resolved_settings)

    app = FastAPI(
        title="Auro Healthcare DLP Backend",
        version="0.1.0",
        docs_url="/docs" if resolved_settings.app_env != "production" else None,
        redoc_url=None,
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=resolved_settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(RateLimitMiddleware)

    app.include_router(api_v1_router, prefix="/api/v1")
    app.add_api_route("/healthz", healthz, methods=["GET"], tags=["meta"])

    app.add_api_route(
        "/readyz",
        build_readyz_handler(probe),
        methods=["GET"],
        tags=["meta"],
    )

    return app


app = create_app()
