# aurodlpv2-backend

FastAPI service for the Auro Healthcare DLP platform: multi-tenant auth, the
policy engine, server-side scanning, quarantine, the audit log, and scan-event
ingestion and analytics.

It imports `aurodlpv2-detection` as a library through a path dependency on
`../detection`. Detection is not a separate service, which is why the deployment
image build context is the repository root.

## Quickstart

```bash
# from the repo root, start Postgres and the rest of the dev stack
make dev-up
cd backend
uv sync --all-extras
uv run alembic upgrade head
uv run uvicorn aurodlpv2_backend.main:app --reload --port 8000
```

The service needs Postgres. `make dev-up` also starts redis, minio, jaeger and
mailhog. Queued attachment scans need redis, minio and a worker
(`make worker-dev`).

## Layout

```
aurodlpv2_backend/
  main.py            FastAPI app factory, middleware, lifespan
  settings.py        pydantic-settings, env-driven config
  deps.py            DB session, current-member auth, role gates
  health.py          /healthz and /readyz probes
  api/v1/router.py   aggregates the v1 routers under /api/v1
  auth/              signup, login, refresh, logout, password reset,
                     email verification, TOTP MFA, device tokens
  orgs/              organization (tenant) management
  members/           org membership and roles
  domains/           approved-domain and email allowlists
  policy/            per-org rules, first match wins, plus the simulator
  scan/              /scan/email, /scan/attachment, /scan/finalize
  quarantine/        quarantine list, detail, approve, reject, status polling
  events/            scan-event ingestion and analytics
  audit/             append-only audit log, hash chain, chain verification
  tasks/             Celery app and the queued attachment-scan task
  storage/           S3-compatible object storage for queued attachment bytes
  email/             SMTP and console mailers, message templates
  public/            unauthenticated endpoints for the extension
  db/                SQLAlchemy 2.0 Base, async session, models, Alembic
  observability/     structlog, security and rate-limit middleware
  utils/             uuid and masking helpers
```

## Two ingest channels

`POST /api/v1/events` accepts events from both enforcement paths. `channel` is
`email` (default) or `web`. A `web` event must carry `site_host`, a bare
hostname of at most 253 characters; an `email` event must not. Both columns live
on `scan_events`, added by migration `20260829_0006` with a check constraint and
an `(org_id, channel, event_time)` index.

Every accepted event writes one audit row with `category="scan"`, whose metadata
carries `channel`, `site_host`, `client_event_id`, `entity_count`,
`entity_types`, `risk_score` and `severity`. Ingest is idempotent on
`(org_id, client_event_id)` and returns `{"status": "duplicate"}` with HTTP 202
for a replay.

The endpoint has no field for message or page text, and never stores any.
`entities[].masked_value` is the only value-bearing field, and it arrives already
masked from the client.

`GET /api/v1/events/analytics` adds `by_channel` (`{email, web}`) and
`top_sites` (the ten hostnames with the most web events, by descending count).
Responses are cached in process for 10 seconds per `(org_id, days)` and the cache
is cleared for the org on every accepted event.

## Conventions

- Python 3.12, strict pyright, ruff for lint and format, pytest with
  pytest-asyncio.
- SQLAlchemy 2.0 typed models, async sessions only (`asyncpg`).
- Pydantic v2 everywhere. Request and response models live next to their routers.
- All API routes are namespaced under `/api/v1`. `/healthz` and `/readyz` are
  the probes.
- Auth is a JWT access token (Bearer) plus an httpOnly refresh cookie. Refresh
  tokens rotate on use, with a `refresh_rotation_grace_seconds` window (60s by
  default) so concurrent refreshes do not fight, and a replay after that window
  revokes the whole family. `jwt_refresh_ttl_days` is 30. Roles are `owner`,
  `admin`, `analyst` and `viewer`.
- Security-headers and rate-limit middleware run on every request.
  `POST /api/v1/events` and the scan routes carry a second, credential-keyed
  limiter (60 per device per minute, 600 per org per minute) whose counters are
  per process, not shared across replicas.

## Not implemented, despite appearances

`observability/metrics.py` declares five Prometheus collectors. Nothing
increments them and no `/metrics` endpoint is mounted. There is no OpenTelemetry
exporter either, so the `jaeger` container in the dev stack receives nothing.
Observability today is structured logs.

## Status

Implemented: multi-tenant auth with MFA and email verification, organizations,
members, device enrolment, domain allowlists, the policy engine and simulator,
server-side scanning with OCR and queued attachment processing, quarantine
review, the hash-chained audit log, and event ingestion and analytics for both
the email and web channels.

Roadmap and findings: [`docs/plans/backend.md`](../docs/plans/backend.md) and
[`docs/plans/hardening.md`](../docs/plans/hardening.md).
