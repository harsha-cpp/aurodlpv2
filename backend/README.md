# aurodlpv2-backend

FastAPI service for the Auro Healthcare DLP platform — multi-tenant auth,
organization + domain allowlists, and scan-event ingestion + analytics.

Build roadmap: [`docs/plans/backend.md`](../docs/plans/backend.md).

## Quickstart

```bash
# from repo root — start Postgres (and the rest of the dev stack)
make dev-up
cd backend
uv sync --all-extras
uv run alembic upgrade head
uv run uvicorn aurodlpv2_backend.main:app --reload --port 8000
```

The service needs Postgres; `make dev-up` also starts redis, minio, jaeger, and
mailhog for the wider dev stack.

## Layout

```
aurodlpv2_backend/
├── main.py            # FastAPI app factory, middleware, lifespan
├── settings.py        # pydantic-settings (env-driven config)
├── deps.py            # DB session, current-member auth, role gates
├── health.py          # /healthz + /readyz probes
├── api/v1/router.py   # aggregates the v1 routers under /api/v1
├── auth/              # email/password signup, login, refresh, logout, me (+ JWT)
├── orgs/              # organization (tenant) management
├── members/           # org membership + roles
├── domains/           # approved-domain + email allowlists
├── events/            # scan-event ingestion (org-code keyed) + analytics
├── public/            # unauthenticated endpoints for the extension
├── db/                # SQLAlchemy 2.0 Base, async session, models, Alembic migrations
├── observability/     # structlog, Prometheus metrics, security + rate-limit middleware
└── utils/             # uuid + masking helpers
```

## Conventions

- Python 3.12, **strict** pyright, ruff for lint + format, pytest + pytest-asyncio.
- SQLAlchemy 2.0 typed models, async sessions only (`asyncpg`).
- Pydantic v2 everywhere — request/response models live next to their routers.
- All API routes are namespaced under `/api/v1`; `/healthz` + `/readyz` for probes.
- Auth is a JWT access token (Bearer) plus an httpOnly refresh cookie (no rotation,
  30-day expiry); roles are `owner` / `admin` / `analyst`.
- Security-headers and rate-limit middleware run on every request.

## Status

Implemented: multi-tenant auth, organizations, members, domain allowlists, and
scan-event ingestion + analytics over Postgres. Server-side deep scan, OCR, and
quarantine remain on the roadmap — see [`docs/plans/backend.md`](../docs/plans/backend.md).
