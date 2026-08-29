# Deploying Auro Healthcare DLP

How to get the API, the Celery worker and the admin dashboard onto a server.

This document covers **one host running Docker Compose**, which is the shape
almost every hospital install takes. It is honest about what it does not cover:
see [What this does not cover](#what-this-does-not-cover) before you use it as
a reference architecture.

Everything below was exercised against the real images. Where something is
untested or known-broken it says so.

---

## Contents

1. [Architecture](#architecture)
2. [Prerequisites](#prerequisites)
3. [Configure](#configure)
4. [Build](#build)
5. [Migrate](#migrate)
6. [Run](#run)
7. [Health checks](#health-checks)
8. [The reverse proxy](#the-reverse-proxy)
9. [Upgrading](#upgrading)
10. [Rotating secrets](#rotating-secrets)
11. [Backup and restore](#backup-and-restore)
12. [Production checklist](#production-checklist)
13. [Known sharp edges](#known-sharp-edges)
14. [What this does not cover](#what-this-does-not-cover)

---

## Architecture

```
                    ┌──────────────────────────────────────────┐
   browser  ──TLS──▶│  reverse proxy  (nginx / Caddy / ALB)     │   YOU PROVIDE
   extension        │  terminates HTTPS, sets X-Forwarded-For   │   THIS
                    └───────┬──────────────────────────┬────────┘
                            │ :8081                    │ :8000
                   ┌────────▼────────┐        ┌────────▼─────────┐
                   │ dashboard       │        │ api              │
                   │ nginx + Vite SPA│        │ FastAPI/uvicorn  │
                   └─────────────────┘        └──┬────┬──────┬───┘
                                                 │    │      │
                             ┌───────────────────┘    │      └──────────┐
                             ▼                        ▼                 ▼
                     ┌──────────────┐        ┌────────────────┐  ┌────────────┐
                     │  postgres    │        │  redis         │  │  minio     │
                     │  (volume)    │        │  broker + AOF  │  │  (volume)  │
                     └──────▲───────┘        └───────┬────────┘  └─────▲──────┘
                            │                        │                 │
                            │                ┌───────▼────────┐        │
                            └────────────────┤  worker        ├────────┘
                                             │  Celery + OCR  │
                                             └────────────────┘
       one-shot on every `up`:  migrate (alembic) ─▶ postgres
                                minio-init (bucket) ─▶ minio
```

Files:

| Path | What it is |
| --- | --- |
| `infra/docker/api.Dockerfile` | FastAPI image |
| `infra/docker/worker.Dockerfile` | Celery worker image (same deps, different CMD) |
| `infra/docker/dashboard.Dockerfile` | Vite build -> nginx |
| `infra/docker/nginx/` | nginx config for the dashboard image |
| `infra/docker/entrypoint-api.sh` | shared entrypoint (`WAIT_FOR_DB`, `RUN_MIGRATIONS`) |
| `infra/docker/run-migrations.py` | `alembic upgrade head` under a Postgres advisory lock |
| `infra/docker-compose.prod.yml` | the production stack |
| `infra/.env.prod.example` | compose-level config -> copy to `infra/.env` |
| `backend/.env.example` | every application setting -> copy to `infra/api.env` |
| `infra/docker-compose.yml` | **unrelated**: local dev backing services (`make dev-up`) |

---

## Prerequisites

- Linux host, x86-64 or arm64. The images are built for whatever platform you
  build them on; build on the same architecture as the server, or use
  `docker buildx build --platform linux/amd64`.
- Docker Engine 24+ with the Compose v2 plugin. `depends_on: condition:
  service_completed_successfully` and `env_file: required:` both need a recent
  Compose.
- **4 CPU / 8 GB RAM minimum.** The detection engine loads spaCy plus a full
  Tesseract install into every worker process; the compose file's default limits
  are 2 CPU / 2 GB for the API and 4 CPU / 4 GB for the worker.
- ~10 GB disk for images, plus whatever Postgres and MinIO need.
- A TLS-terminating reverse proxy. Not optional - see below.
- An SMTP relay. The app refuses to boot in production without one, because
  invites, password resets and email verification are all undeliverable without
  it.

---

## Configure

Two files. The split exists so that a password is written down exactly once.

```bash
cp infra/.env.prod.example infra/.env       # compose-level: secrets, ports, image tag
cp backend/.env.example    infra/api.env    # application settings
chmod 600 infra/.env infra/api.env
```

- **`infra/.env`** holds everything Compose has to hand to *both* a backing
  service and the backend - the Postgres password, the Redis password, the MinIO
  credentials - plus image tags, published ports and the public URLs. Compose
  derives `DATABASE_URL`, `REDIS_URL` and the S3 credentials from these and
  injects them into the API and worker containers.
- **`infra/api.env`** holds the rest: token lifetimes, rate limits, scan
  concurrency. Every setting is documented in `backend/.env.example`.

`environment:` in the compose file **overrides** `api.env`. That is deliberate:
an operator editing `api.env` cannot accidentally point the API at the wrong
database or turn off `REFRESH_COOKIE_SECURE`.

### Generate the secrets

```bash
openssl rand -base64 48 | tr -d '\n'   # JWT_SECRET
openssl rand -base64 48 | tr -d '\n'   # MFA_ENCRYPTION_KEY  (must differ)
openssl rand -base64 32 | tr -d '/+='  # POSTGRES_PASSWORD
openssl rand -base64 32 | tr -d '/+='  # REDIS_PASSWORD
openssl rand -base64 32 | tr -d '/+='  # MINIO_ROOT_PASSWORD
```

Compose refuses to start if any required value is missing - every one is
declared as `${VAR:?message}`, so you get a named error rather than a stack
silently running on a default.

### The four settings the app enforces

`Settings.enforce_production_security()` raises at import when `APP_ENV=production`
and any of these is wrong. The container will not start; it will crash-loop with
a `ValidationError` naming the setting.

| Setting | Required value | Why |
| --- | --- | --- |
| `REFRESH_COOKIE_SECURE` | `true` | the refresh cookie is a 30-day credential |
| `JWT_SECRET` | must not start with `change-me` | the default is in this repo |
| `STORAGE_BACKEND` | `s3` | `local` needs the API and worker to share a filesystem, so a queued attachment written by the API is simply missing when a worker on another host reads it |
| `MAILER_BACKEND` | `smtp` | `console` writes mail to the log and delivers nothing |

The compose file hard-codes all four correctly. You cannot get them wrong by
editing `api.env`.

### `CORS_ORIGINS` must be JSON

```ini
CORS_ORIGINS=["https://dlp.hospital.example"]     # correct
CORS_ORIGINS=https://dlp.hospital.example         # crashes at startup
CORS_ORIGINS=                                     # also crashes
```

`cors_origins` is a `list[str]`, and pydantic-settings 2.14 JSON-decodes list
fields straight out of the environment - *before* the comma-splitting validator
in `settings.py` ever runs. Same applies to `API_RATE_LIMIT_EXEMPT_PATHS`. Use
`[]` for an empty list. (Verified against pydantic-settings 2.14.1.)

---

## Build

The build context is **the repository root** for all three images.
`backend/pyproject.toml` declares `aurodlpv2-detection = { path = "../detection" }`,
so a `backend/`-only context cannot resolve the dependency. The root
`.dockerignore` keeps the context small.

```bash
make images IMAGE_TAG=$(git rev-parse --short HEAD) \
            VITE_API_BASE_URL=https://dlp-api.hospital.example
```

or directly:

```bash
docker build -f infra/docker/api.Dockerfile       -t aurodlp/api:$TAG       .
docker build -f infra/docker/worker.Dockerfile    -t aurodlp/worker:$TAG    .
docker build -f infra/docker/dashboard.Dockerfile -t aurodlp/dashboard:$TAG \
    --build-arg VITE_API_BASE_URL=https://dlp-api.hospital.example .
```

Approximate sizes: **api and worker ~900 MB** on disk (spaCy 125 MB, PyMuPDF
60 MB, NumPy 67 MB, Tesseract with ten Indic language packs 36 MB, precompiled
bytecode ~100 MB), **dashboard ~23 MB**. The API and worker builder stages are
byte-identical, so building both back to back costs one dependency install.

### `VITE_API_BASE_URL` is a build-time value

Vite performs a literal text substitution of `import.meta.env.VITE_API_BASE_URL`
at build time. There is no runtime environment inside a static bundle.

**Pointing the dashboard at a different API means rebuilding the image.**
`docker run -e VITE_API_BASE_URL=...` does nothing. The same value is also baked
into the nginx `Content-Security-Policy` `connect-src`, so a mismatch shows up as
the dashboard loading but every API call being blocked by the browser.

### Why those Tesseract language packs

`detection/ocr/__init__.py` routes to `hin ben pan guj ori tam tel kan mal mar`
for Indic scripts. A language pack that is not installed does not degrade
gracefully - Tesseract exits non-zero for the whole page and the scan returns no
text. Indian hospital discharge summaries and lab reports are routinely bilingual,
so this is a correctness requirement, not a nice-to-have.

### What is deliberately *not* in the images

`detection[ocr]` (PaddleOCR, PaddlePaddle, OpenCV) and `detection[medical-ner]`
(PyTorch, transformers) are **not installed** - they add multiple gigabytes. The
code imports them opportunistically and logs a warning when they are absent, so
`paddle_backend.run()` returns empty and the Indic fallback in
`ocr/extract_image_text()` never improves on the Tesseract result. Tesseract
itself handles all ten Indic scripts, so this is a quality ceiling, not an outage.

**One package from that extra is installed on its own: `pytesseract`.** It is the
Python binding that actually invokes the Tesseract binaries, it is 15 KB of pure
Python, and without it `tesseract_backend.run()` logs `"pytesseract is not
installed"` and returns `""` - a scanned discharge summary would pass the DLP
scan clean, which is a false negative on PHI rather than a missing feature. The
Dockerfiles install it pinned to the version already resolved in
`detection/uv.lock`:

```dockerfile
ARG INSTALL_TESSERACT_BINDINGS=true
ARG PYTESSERACT_VERSION=0.3.13
```

Build with `--build-arg INSTALL_TESSERACT_BINDINGS=false` to drop it. The proper
fix is to move `pytesseract` out of the `ocr` extra in
`detection/pyproject.toml`; see [Known sharp edges](#known-sharp-edges).

Verified in the built image:

```
$ docker run --rm --entrypoint python aurodlp/api:TAG -c '...'
OCR text       : 'MRN 4471902 Aadhaar 43219876 5432'
OCR confidence : 0.904
```

---

## Migrate

Migrations run as a **one-shot `migrate` service**, not from the API's entrypoint.
Compose runs it to completion before any API or worker container starts:

```yaml
depends_on:
  migrate:
    condition: service_completed_successfully
```

so there is exactly one `alembic` process regardless of how many API replicas
you run. `make prod-up` does this for you.

The migrate service runs `infra/docker/run-migrations.py`, which takes a
Postgres **session-level advisory lock** (`pg_advisory_lock`) before invoking
alembic. Alembic has no locking of its own: two containers booting in the same
second both read the current revision, both decide to apply the same migration,
and one dies on a duplicate object. The lock is released automatically if the
process is killed.

This was verified by dropping the schema and starting three migrate containers
simultaneously: one applied all four revisions, the other two blocked, then saw
`head` and no-op'd. All three exited 0.

Run it by hand:

```bash
make prod-migrate                                       # or
docker compose -f infra/docker-compose.prod.yml run --rm migrate
```

For deploy targets with nowhere to put an init container (a single Docker host,
a PaaS with one process type), the same image can migrate from its own
entrypoint - still under the advisory lock:

```bash
docker run -e RUN_MIGRATIONS=true -e WAIT_FOR_DB=true ... aurodlp/api:$TAG
```

---

## Run

```bash
make prod-up          # docker compose -f infra/docker-compose.prod.yml up -d --wait
make prod-logs
make prod-down        # stops containers, KEEPS volumes
```

`--wait` blocks until every service is healthy and the one-shot services have
exited 0, so a non-zero exit means the deploy actually failed.

Published ports bind to `127.0.0.1` only:

| Service | Host | Container |
| --- | --- | --- |
| api | `127.0.0.1:${API_PORT:-8000}` | 8000 |
| dashboard | `127.0.0.1:${DASHBOARD_PORT:-8081}` | 8080 |

Postgres, Redis and MinIO publish **nothing**. Reach them with
`docker compose exec`, or an SSH tunnel.

Scale the worker - the only service worth scaling horizontally, since detection
is CPU-bound:

```bash
docker compose -f infra/docker-compose.prod.yml up -d --scale worker=3
```

Keep `WORKER_CONCURRENCY` at or below the worker's CPU limit. Oversubscribing a
CPU-bound prefork pool only adds queueing latency.

---

## Health checks

| Endpoint | Meaning | Use for |
| --- | --- | --- |
| `GET /healthz` | process is up. Touches nothing. | liveness, load-balancer |
| `GET /readyz` | Postgres **and** Redis reachable; 503 with a per-component breakdown otherwise | readiness, alerting |
| `GET /healthz` (dashboard, :8080) | nginx is serving | liveness |

```bash
curl -fsS http://127.0.0.1:8000/healthz    # {"status":"ok"}
curl -sS  http://127.0.0.1:8000/readyz     # {"status":"ready","components":[...]}
docker compose -f infra/docker-compose.prod.yml ps
```

The worker has no HTTP endpoint; its healthcheck is
`celery inspect ping -d celery@$HOSTNAME`, which goes broker -> worker -> broker.
It fails when Redis is down, which is correct: a worker that cannot reach the
broker is not healthy.

`/docs` returns 404 in production. That is `main.py` disabling it when
`APP_ENV=production`, not a routing problem.

---

## The reverse proxy

**You must put one in front.** Nothing in this stack terminates TLS, and the app
requires `REFRESH_COOKIE_SECURE=true` in production, so the refresh cookie is
never sent over plain HTTP - the dashboard will log you out on every reload if
you skip this.

Minimum requirements:

- Terminate HTTPS for both the dashboard host and the API host.
- Set `X-Forwarded-For` and `X-Forwarded-Proto`. Set `TRUSTED_PROXY_COUNT` to
  the number of proxies that append to `X-Forwarded-For` (1 for a single nginx;
  2 behind an ALB *and* nginx). Too low and every hospital shares one
  login-rate-limit bucket, so one attacker locks out a whole tenant. Too high
  and a client can forge its own source IP and skip the throttle entirely.
- Add `Strict-Transport-Security`. The dashboard image deliberately does not set
  HSTS: only the proxy that owns the certificate knows whether HTTPS is
  available for the whole domain.

Same-host layout (dashboard and API on one hostname) lets you set
`REFRESH_COOKIE_SAMESITE=lax`, which is safer than the `none` that a split-host
layout forces. If you can arrange it, do.

---

## Upgrading

```bash
git pull
make images IMAGE_TAG=$(git rev-parse --short HEAD) \
            VITE_API_BASE_URL=https://dlp-api.hospital.example
sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=$(git rev-parse --short HEAD)/" infra/.env
make prod-backup            # before the migration, not after
make prod-up
```

`up` re-runs `migrate` to completion before restarting the API and worker.

Use an immutable tag (a git sha). `latest` makes a rollback ambiguous: you
cannot tell which build a running container came from.

**Rolling back is not automatic.** Reverting the image tag reverts the code, not
the schema. If the release included a destructive migration, restore the dump.

---

## Rotating secrets

| Secret | Blast radius | How |
| --- | --- | --- |
| `JWT_SECRET` | every user logged out immediately; refresh tokens rejected | edit `infra/.env`, `make prod-up` |
| `MFA_ENCRYPTION_KEY` | **every TOTP enrolment becomes undecryptable** - users must re-enrol | do not rotate without a re-enrolment plan |
| `POSTGRES_PASSWORD` | brief downtime | `ALTER ROLE` (below), then edit and restart |
| `REDIS_PASSWORD` | queued tasks survive (AOF), in-flight ones retry | edit `infra/.env`, `make prod-up` |
| `MINIO_ROOT_PASSWORD` | in-flight queued attachments unreadable until restart | edit `infra/.env`, `make prod-up` |
| SMTP credentials | outgoing mail fails until restarted | edit `infra/.env`, `make prod-up` |

Because `JWT_SECRET` and `MFA_ENCRYPTION_KEY` have such different rotation
schedules, **never leave `MFA_ENCRYPTION_KEY` unset**. It falls back to
`JWT_SECRET`, which couples them: rotating the JWT secret would then lock every
user out of MFA.

Postgres password:

```bash
C="docker compose -f infra/docker-compose.prod.yml"
$C exec -T postgres psql -U aurodlp -d aurodlp \
    -c "ALTER ROLE aurodlp WITH PASSWORD 'NEW_PASSWORD';"
sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=NEW_PASSWORD/" infra/.env
$C up -d --force-recreate api worker
```

There is **no secret manager integration**. Secrets are plain environment
variables in `infra/.env`. `chmod 600` it, keep it off the git remote, and if
your host has Vault or AWS Secrets Manager, render `infra/.env` from it at deploy
time rather than editing it by hand.

---

## Backup and restore

The database is the only irreplaceable state. MinIO holds queued attachments
that are deleted after each scan - losing it loses in-flight scans, nothing more.
Redis holds the queue; its AOF makes a restart survivable.

### Back up

```bash
make prod-backup      # backups/aurodlp-20260828T120000Z.dump  (custom format)
```

or:

```bash
docker compose -f infra/docker-compose.prod.yml exec -T postgres \
    pg_dump -U aurodlp -Fc aurodlp > aurodlp-$(date -u +%Y%m%dT%H%M%SZ).dump
```

Custom format (`-Fc`) so you can restore selectively with `pg_restore`.

Automate it. A daily cron on the host, with the dump copied **off the host** -
a backup on the same disk as the database is not a backup:

```cron
15 2 * * * cd /opt/aurodlp && make prod-backup && \
           find backups -name '*.dump' -mtime +30 -delete
```

Audit events are append-only and hash-chained (`block_audit_event_mutation()` is
a trigger in the schema). A restore rolls that chain back to the dump's point in
time; anything after is gone. If you are keeping audit logs for compliance, ship
them to an external store as well.

### Restore

Destructive - it drops and recreates every object in the dump.

```bash
C="docker compose -f infra/docker-compose.prod.yml"
$C stop api worker                       # nothing may write during the restore
make prod-restore FILE=backups/aurodlp-20260828T120000Z.dump
$C run --rm migrate                      # bring the schema forward if the dump is older
$C start api worker
curl -sS http://127.0.0.1:8000/readyz
```

**Test your restore.** An untested backup is a hypothesis. Restore into a scratch
database at least once a quarter and confirm `alembic_version` and the table
count match production.

---

## Production checklist

Before the first real send goes through this stack:

**Secrets**
- [ ] `JWT_SECRET` generated, ≥32 bytes, not from this repo
- [ ] `MFA_ENCRYPTION_KEY` generated and **different from** `JWT_SECRET`
- [ ] `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `MINIO_ROOT_PASSWORD` generated
- [ ] `infra/.env` and `infra/api.env` are `chmod 600` and not committed

**Configuration**
- [ ] `APP_ENV=production`
- [ ] `CORS_ORIGINS` is a **JSON array** containing exactly the dashboard origin
- [ ] `APP_BASE_URL` is the dashboard's public https URL (mail links use it)
- [ ] `VITE_API_BASE_URL` was passed at **build** time and matches the API's
      public URL - check with
      `curl -sI http://127.0.0.1:8081/ | grep -i content-security-policy`
- [ ] `TRUSTED_PROXY_COUNT` matches the actual number of proxies
- [ ] `ALLOW_OPEN_SIGNUP=false`
- [ ] `SMTP_*` point at a relay that can actually deliver; send a test invite
- [ ] `S3_SERVER_SIDE_ENCRYPTION` empty for MinIO, `AES256` for real S3
- [ ] `DATABASE_POOL_SIZE + DATABASE_MAX_OVERFLOW`, times replicas, stays under
      Postgres `max_connections` (default 100)

**Network**
- [ ] TLS terminating reverse proxy in front of both the API and the dashboard
- [ ] HSTS set on the proxy
- [ ] Postgres, Redis and MinIO not reachable from outside the host
      (`ss -lntp` shows nothing but your proxy and the two loopback binds)
- [ ] `MINIO_BROWSER=off` (it is an admin console holding root credentials)

**Operations**
- [ ] `make prod-backup` runs from cron and copies the dump off the host
- [ ] A restore has been tested end to end at least once
- [ ] Disk alerting on the Postgres and MinIO volumes
- [ ] Log shipping - container logs cap at 50 MB per service (`10m` × 5) and
      then roll away
- [ ] `SENTRY_DSN` set, **with scrubbing verified** - these events can carry
      patient data
- [ ] `/readyz` monitored, not just `/healthz`
- [ ] Image tag is an immutable git sha, and the sha is recorded somewhere you
      can find during an incident

**Verify after deploy**
```bash
curl -sS  https://dlp-api.hospital.example/readyz            # ready
curl -so /dev/null -w '%{http_code}\n' \
     https://dlp-api.hospital.example/docs                   # 404
curl -sI  https://dlp.hospital.example/ | grep -i security   # CSP present
docker compose -f infra/docker-compose.prod.yml ps           # all healthy, one-shots Exited(0)
```

---

## Known sharp edges

Things that will bite you, found while building and testing this stack.
Items fixed since this document was first written are noted rather than
deleted, so an older deployment reading it still recognises the symptom.

1. ~~**`pytesseract` is installed by the Dockerfile, not the dependency
   graph.**~~ **Fixed.** It is now a plain dependency of `detection` rather
   than a member of the `ocr` extra, and the images no longer special-case it.
   The symptom it caused is worth knowing: a missing binding made OCR return
   `""` silently, so a scanned discharge summary scanned clean. The engine now
   raises `OcrUnavailableError` and the scan reports an extraction error
   instead of a false negative.

2. ~~**`CORS_ORIGINS` and `API_RATE_LIMIT_EXEMPT_PATHS` only accept JSON.**~~
   **Fixed.** pydantic-settings JSON-decodes complex fields inside the settings
   source, before any `field_validator` runs, so the comma-splitting validator
   was dead code and `CORS_ORIGINS=a,b` raised at startup. Both forms are
   accepted now, including an empty value.

3. **`MFA_ENCRYPTION_KEY=` (empty) is not the same as unset.** The documented
   fallback to `JWT_SECRET` only happens when the variable is absent. Set to the
   empty string it becomes `SecretStr('')`, and TOTP seeds get encrypted with an
   empty key. `backend/.env.example` keeps the line commented out for this
   reason; the compose file requires a real value.

4. **`cap_drop: ALL` breaks the stock Postgres, Redis and MinIO images.** Their
   entrypoints start as root and drop privileges, which needs
   `SETUID/SETGID/CHOWN/FOWNER/DAC_OVERRIDE`. The compose file uses two hardening
   anchors for this reason. The three first-party images run non-root from the
   start and keep `cap_drop: ALL`.

5. ~~**`uv.lock` is gitignored.**~~ **Fixed.** Both lock files are committed
   now, so a clean checkout resolves to the same dependency set the images were
   built and tested against.

6. ~~**`make worker-dev` prints "not part of the current backend slice".**~~
   **Fixed.** `worker-dev` and `beat-dev` run the real Celery commands.

7. ~~**`backend/$PGROOT/quarantine` exists in the working tree.**~~ **Fixed.**
   It was an empty directory left by a run with `QUARANTINE_STORAGE_DIR`
   unexpanded; deleted.

8. **The org code is still a working scan credential.** Device enrolment
   replaces it and both are accepted during the migration window. It cannot be
   retired until every install is enrolled, and until then a leaked org code is
   still usable against `/api/v1/scan` and `/api/v1/events`.

---

## What this does not cover

Being explicit so nobody mistakes this for more than it is.

- **TLS.** No certificates, no ACME, no proxy config. You provide the proxy.
- **Kubernetes.** No manifests, no Helm chart. The images are ordinary
  non-root OCI images and will run there - `/healthz` for liveness, `/readyz`
  for readiness, the `migrate` command as an init container or a Job - but none
  of that is written down or tested.
- **High availability.** One Postgres, one Redis, one MinIO, each a single
  container with a local volume. No replication, no failover, no quorum. The API
  and worker scale horizontally; the state layer does not.
- **Managed backing services.** Pointing `DATABASE_URL` at RDS or `S3_*` at real
  S3 works (set `S3_ENDPOINT_URL` empty and `S3_SERVER_SIDE_ENCRYPTION=AES256`),
  but the compose file still starts the local containers. Delete those services
  and their `depends_on` entries if you go managed.
- **Secret management.** Plain environment variables in a file on disk.
- **Log aggregation, metrics, tracing.** The app exposes Prometheus metrics and
  emits OpenTelemetry spans, and the dev stack has a Jaeger container; the
  production stack ships neither a collector nor a scraper.
- **Automated backups.** `make prod-backup` exists; wiring it to cron and
  shipping the dump off-host is yours.
- **Rollback automation.** Retag and re-`up`. Schema rollback means a restore.
- **Multi-architecture images.** Each build targets the host's architecture.
  Use `docker buildx build --platform` for cross-builds; not tested here.
- **Chrome extension distribution.** Packaging and Web Store / enterprise policy
  rollout are not part of this stack.
