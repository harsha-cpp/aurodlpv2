# Backend Revamp Plan and Implemented Architecture

## Outcome

The backend is a FastAPI application plus a separate durable worker. PostgreSQL is the system of
record for tenants, authorization, scan state, job state, quarantine, and audit. Redis is limited
to distributed login throttling. Raw queued attachments use private S3-compatible storage and do
not pass through Redis.

See the [container architecture](../architecture/c4-containers.md),
[deployment model](../architecture/c4-deployment.md), and
[durable-processing decision](../adr/0001-postgresql-durable-scan-jobs.md).

## Security invariants

- Every extension route authenticates an active, unexpired, tenant-bound installation token.
- Organization codes are identifiers, never credentials.
- Every dashboard route resolves an active database member after verifying JWT claims.
- Role gates are explicit: owner, admin, analyst, viewer.
- Refresh tokens are opaque, hashed, rotating, and family-revoked on ancestor reuse.
- Refresh/logout require a non-simple CSRF header.
- No raw matched entity value is persisted in scan or audit records.
- Cross-tenant lookups return not found or unauthorized without revealing resource existence.
- Detector, extraction, storage, and queued-scan failures never authorize a send.

## API modules

| Module | Responsibility |
| --- | --- |
| `auth` | Signup, login, rotation, logout, identity, login throttling |
| `extension_clients` | One-time browser enrollment and independent revocation |
| `orgs`, `members`, `domains` | Tenant configuration, RBAC, recipient policy |
| `scan` | Text scan, attachment staging, final policy, content binding |
| `quarantine` | Locked analyst decisions and extension polling |
| `audit` | Tenant-scoped hash-chain writes and reads |
| `events` | Masked operational events and analytics |
| `storage` | Private S3-compatible object operations and lifecycle enforcement |
| `tasks` | PostgreSQL job claim, lease recovery, scan, cleanup, retry |

## Durable attachment state machine

1. The API bounds the upload and calculates SHA-256.
2. Small supported documents scan inline through a restricted temporary path.
3. Deep-scan inputs are written under `attachments/{org_id}/{scan_id}/{sha256}`.
4. The API commits `attachment_scans` and `attachment_scan_jobs` together.
5. A worker claims one pending/stale job using `FOR UPDATE SKIP LOCKED`.
6. The scan phase downloads to a private temporary file, extracts/detects, and persists only
   masked findings.
7. The job transitions to cleanup; deletion is retried separately.
8. Only after raw-object deletion does the job and attachment become terminal.
9. Bucket lifecycle expiration removes an object that survives all application retries.

Worker ownership and attempt number fence late workers. Crashed workers are recovered after the
lease expires. Maximum attempts and retry availability are configuration, not process memory.

## Failure semantics

| Failure | Required behavior |
| --- | --- |
| Object upload unavailable | HTTP 503; no scan row presented as accepted |
| Database commit after object upload fails | Delete staged object as compensation |
| Duplicate client attachment with same content | Return the original idempotent result |
| Duplicate ID with different content | HTTP 409 |
| Worker crash | Lease expires; another worker resumes |
| Detection/extraction error | Persist masked failure; finalization blocks |
| Object deletion error | Remain in cleanup; do not publish terminal result |
| API outage or timeout | Extension uses degraded context but blocks send |

## Production configuration

Required production values are listed in `backend/.env.example`. The settings validator rejects
default secrets, insecure object-store transport, invalid CORS origins, and insecure refresh
cookie settings in production.

Recommended portable profile:

- PostgreSQL: Neon or another managed PostgreSQL 16-compatible provider.
- API/worker: a container platform with always-on or worker-capable services.
- Object storage: private S3, Cloudflare R2, or a compatible provider with lifecycle support.
- Redis: managed Redis for shared login throttling.
- Dashboard: a static HTTPS host configured for the API origin.

Vercel is suitable for the dashboard. The leased worker requires a runtime that can continuously
poll, so it must not be deployed only as a short-lived serverless function.

## Verification

- Unit suite covers policy, auth rotation, credentials, rate limits, worker phases, audit, and
  failure behavior.
- Live tests run against clean PostgreSQL and MinIO for durable handoff/deletion, CSRF and refresh
  replay, tenant boundaries, and extension revocation.
- Alembic is applied to an empty database in CI.
- Ruff and strict Pyright are blocking.
- Dependency audit and non-root container checks are blocking.
- Git-history secret scanning, Semgrep SAST, Trivy repository/image scanning, and CycloneDX SBOM
  generation are blocking supply-chain gates.

## Legacy database migration

The pre-revamp local database is stamped with an incompatible historical revision and contains a
different schema. It must not be stamped to the new head. Export and map legacy workspaces,
users, scans, and quarantine records into a fresh migrated database, validate counts and hashes,
then switch the connection string. The old database remains the rollback source until sign-off.
