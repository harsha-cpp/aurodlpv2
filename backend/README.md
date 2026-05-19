# medshield-backend

FastAPI service for the MedShield Gmail DLP platform.

Authoritative build spec: [`docs/plans/backend.md`](../docs/plans/backend.md).

## Quickstart

```bash
# From repo root
make dev-up                    # postgres + redis + minio + jaeger via docker-compose
cd backend
uv sync --all-extras
uv run alembic upgrade head
uv run uvicorn medshield_backend.main:app --reload
uv run celery -A medshield_backend.celery_app worker -l info
```

## Layout

```
medshield_backend/
├── main.py              # FastAPI app factory + lifespan
├── settings.py          # pydantic-settings (env-driven)
├── deps.py              # FastAPI dependencies (db, user, workspace, roles)
├── celery_app.py        # Celery factory
├── api/v1/router.py     # v1 aggregate router
├── auth/                # Google ID-token exchange + JWT
├── scan/                # /api/scan/* endpoints + temp file pipeline + Celery deep scan
├── policy/              # Custom Python policy DSL + evaluator + repo + admin API
├── recipients/          # Recipient classification + MX/SPF cache
├── quarantine/          # State machine, review API, SSE stream
├── audit/               # Append-only writer + reader API + hash-chain verifier
├── dashboard/           # Aggregation + stats endpoints
├── workspaces/          # Tenant + user CRUD
├── db/                  # SQLAlchemy 2.0 Base, session, Alembic env, migrations
├── observability/       # structlog, Prometheus, OTel, Sentry init
└── utils/               # crypto, time, masking helpers
```

## Conventions

- Python 3.12, **strict** pyright, ruff for lint+format, pytest+pytest-asyncio.
- SQLAlchemy 2.0 typed mappings, async sessions only (`asyncpg`).
- Pydantic v2 everywhere - request/response models live next to their routers.
- Never block the event loop - heavy work goes to Celery; bounded sync calls use `run_in_threadpool` / `asyncio.to_thread`.
- All routes namespaced under `/api/v1`.
- Every mutation writes an `audit_events` row in the same DB transaction.

## Status

Scaffold only - module shells in place, no business logic yet. Implement per phases in [`docs/plans/backend.md`](../docs/plans/backend.md) §16.
