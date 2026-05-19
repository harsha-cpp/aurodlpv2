# Codex — Backend Build Brief

You are implementing the Auro DLP v2 backend. Scaffold is already in place; fill in the stubs.

## Authoritative spec

`docs/plans/backend.md` is the source of truth. Section numbers below refer to it. Cross-refs: `docs/prd.md` (product), `docs/plans/detection-engine.md` (detection package you will import), `docs/plans/frontend.md` (extension + dashboard contracts).

## Ground rules

- **Stack is locked**: Python 3.12, FastAPI, SQLAlchemy 2.0 async (`asyncpg`), Alembic, Celery 5 + Redis 7, Postgres 16, Pydantic v2, `uv` for deps. Do not swap any of these.
- **Strict everywhere**: `ruff check`, `pyright` (strict), `pytest -q` must all pass before any PR. CI runs them in `.github/workflows/ci.yml`.
- **No event-loop blocking**: any sync I/O (psycopg, requests, file I/O, OCR, parsing) goes through `asyncio.to_thread` or a Celery task. See plan §8.
- **No comments unless necessary**: explain non-obvious algorithms, security invariants, regex, or pgcrypto math only. Self-documenting code over docstrings.
- **Every mutation writes an `audit_event` in the same transaction.** No exceptions. See plan §13.
- **No secrets in code or logs.** `mask_value()` PHI before logging; structlog processors must scrub. See plan §17.

## Work order (phased — do not skip)

Follow plan §16 phases. Each phase ends with green CI.

1. **Phase 0 — Skeleton & infra** (plan §16.0): wire `settings.py` env loading, `db/session.py` engine, `db/base.py` declarative base, `main.py` lifespan, `/healthz` `/readyz`. Goal: `make backend-dev` boots, `pytest` passes.
2. **Phase 1 — Auth + workspaces** (plan §10, §13): Google ID-token verification, JWT issue/refresh, `refresh_tokens` table hashed with Argon2id, `current_user` dep enforces workspace + role. Tests: token round-trip, `hd` claim rejection, expired refresh.
3. **Phase 2 — Scan endpoints (stubbed detector)** (plan §6, §11): `POST /scan/email`, `POST /scan/attachment` (streaming + `python-magic` verify + atomic temp), `GET /scan/{id}`, `POST /scan/{id}/finalize`. Return a hardcoded `Verdict` until Phase 3.
4. **Phase 3 — Detection integration** (plan §6 + detection-engine §3): import `aurodlpv2_detection.api.detect_email`, run via `asyncio.to_thread`, persist `scans` row + audit event. Latency budget: text ≤ 500 ms p95.
5. **Phase 4 — Celery deep scan** (plan §8, §11): attachments ≥ 1 MB or PDFs with images go to `aurodlpv2.scan.deep_attachment`. Status transitions: `pending → scanning → complete`.
6. **Phase 5 — Policy engine + recipients** (plan §9, §12): custom Python DSL evaluator (`evaluate(detection, recipients, attachments, policies) -> Verdict`). Most-restrictive action wins. MX + SPF/DKIM heuristic for recipient class, Redis 24 h cache. `POST /admin/policies/dry-run` replays the last 10 k audit events.
7. **Phase 6 — Quarantine** (plan §14): state machine `pending → approved | rejected | expired | escalated`. Approve emits SSE to `/admin/quarantine/stream`; extension `POST /scan/{id}/finalize` with `override_quarantine=true`. Beat job expires after 7 days.
8. **Phase 7 — Admin dashboard APIs** (plan §15): `/admin/dashboard/stats`, `/top-violations`, `/trend?days=N`. Cursor pagination (`occurred_at, id`) on `/admin/audit`. CSV export streams.
9. **Phase 8 — Hardening** (plan §17): slowapi rate limits (60/min/user), CSP `frame-ancestors none`, KMS-backed secrets, pip-audit + cyclonedx SBOM in CI, daily audit-chain verifier job, Sentry PII scrubber.

## Schema & migrations

DDL is in plan §13. Generate Alembic revisions per phase; never edit a shipped revision. Audit table uses monthly RANGE partitions, `pgcrypto` SHA-256 hash chain in `BEFORE INSERT` trigger, `BEFORE UPDATE OR DELETE` trigger that `RAISE EXCEPTION`s, and `REVOKE UPDATE, DELETE FROM app_role`. Use UUIDv7 PKs.

## Definition of done (per phase)

- [ ] Code + tests + migrations committed
- [ ] `ruff`, `pyright`, `pytest` green locally and in CI
- [ ] New endpoints documented in OpenAPI (FastAPI auto)
- [ ] Audit event emitted for every state change
- [ ] No `# type: ignore`, no `Any` leaking past module boundary
- [ ] No PHI in logs (grep `pytest --capture=tee-sys` output for sample values)

Ask before adding a dependency, changing the schema beyond the plan, or relaxing strict typing.
