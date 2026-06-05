# Auro Healthcare DLP Backend — Build Plan

> Scope: Python FastAPI + Celery + Redis + PostgreSQL backend that the Chrome extension and admin dashboard talk to. Owns auth, scan orchestration, policy evaluation, quarantine, audit log, and admin APIs. Detection logic lives in the separate `aurodlpv2_detection` package (see `detection-engine.md`).

---

## 1. Design Goals (from PRD)

| PRD requirement | Backend implication |
|---|---|
| Pre-send Gmail scan (subject/body/recipients/attachments) | Synchronous `POST /v1/scan/email` endpoint with strict latency budget |
| Attachments up to 10MB with OCR | Sync fast path + Celery deep-scan path; extension polls for deep-scan completion |
| Decision: allow / warn / block / quarantine / escalate | Policy engine evaluates entities + recipient class + attachment context |
| Recipient classification (Internal / Approved Partner / External / Public Email / Unknown) | Domain registry table with per-tenant config |
| Immutable audit log of every scan/decision | Append-only PostgreSQL table with hash chain + DELETE/UPDATE triggers blocked |
| Admin dashboard (blocked logs, risk reports, top violations, policy config) | REST APIs with pagination + aggregations; SSE for live quarantine alerts |
| <2s scan latency normal, <10s for 10MB PDFs | FastAPI inline for text, Celery for OCR/PDFs; structured timeouts |
| Multi-hospital concurrent users | Per-tenant isolation via `workspace_id` on every table |
| TLS, secure auth, encrypted temp files | OAuth Google Workspace → short-lived JWT; temp files in restricted dir with `fs.protected` |

---

## 2. System Topology

```
┌────────────────────┐    HTTPS / JWT     ┌─────────────────────────────┐
│  Chrome Extension  │ ─────────────────► │       FastAPI (web)         │
│  (Gmail compose)   │ ◄───────────────── │   - /v1/scan/email          │
└────────────────────┘    JSON verdict    │   - /v1/scan/attachment     │
                                          │   - /v1/scan/{id}           │
┌────────────────────┐                    │   - /v1/auth/*              │
│  Admin Dashboard   │ ─────────────────► │   - /v1/admin/*             │
│   (React SPA)      │ ◄───────────────── │   - /v1/quarantine/*        │
└────────────────────┘                    └────┬────────────┬───────────┘
                                               │            │
                                  enqueue ─────┘            └──── read/write
                                               ▼                          ▼
                                       ┌───────────────┐       ┌────────────────┐
                                       │     Redis     │ ◄────►│   PostgreSQL   │
                                       │ (broker+cache)│       │  (state+audit) │
                                       └───────┬───────┘       └────────────────┘
                                               │
                                               ▼
                                       ┌───────────────┐
                                       │ Celery worker │── invokes ──► aurodlpv2_detection
                                       │ (prefork x N) │              (OCR / PDF / NER deep scan)
                                       └───────┬───────┘
                                               │
                                               ▼
                                       ┌───────────────┐
                                       │ Celery beat   │── periodic: quarantine expiry,
                                       │ (scheduler)   │             retention, partition rollover
                                       └───────────────┘
```

### 2.1 Repo layout

```
backend/
├── pyproject.toml
├── alembic/                   # migrations
├── aurodlpv2_backend/
│   ├── main.py                # FastAPI app factory
│   ├── settings.py            # pydantic-settings
│   ├── deps.py                # DI: db session, current_user, current_workspace
│   ├── auth/
│   │   ├── google_oauth.py    # verify Google ID token + hd domain check
│   │   ├── jwt.py             # issue/verify access + refresh tokens
│   │   └── api.py             # /v1/auth router
│   ├── scan/
│   │   ├── api.py             # /v1/scan/* router
│   │   ├── service.py         # orchestrates detection + policy + audit
│   │   ├── temp_files.py      # secure temp lifecycle
│   │   └── tasks.py           # Celery deep-scan task
│   ├── policy/
│   │   ├── models.py          # Rule, Condition, Decision dataclasses
│   │   ├── evaluator.py       # pure-function policy evaluation
│   │   ├── repository.py      # CRUD against PostgreSQL
│   │   └── api.py
│   ├── recipients/
│   │   ├── classifier.py      # domain → recipient class
│   │   └── repository.py
│   ├── quarantine/
│   │   ├── api.py
│   │   ├── service.py         # state machine: pending→approved/rejected/expired
│   │   └── tasks.py           # daily expiry sweep
│   ├── audit/
│   │   ├── writer.py          # append + hash-chain logic
│   │   ├── reader.py          # paginated queries for dashboard
│   │   └── api.py
│   ├── dashboard/
│   │   ├── aggregations.py    # top violations, daily trend, severity breakdown
│   │   └── api.py
│   ├── workspaces/
│   │   ├── api.py             # tenant CRUD (super-admin only)
│   │   └── repository.py
│   ├── db/
│   │   ├── base.py            # SQLAlchemy Base + async session
│   │   └── models.py          # ORM models
│   ├── celery_app.py
│   └── observability/
│       ├── logging.py         # structlog JSON, request-id propagation
│       ├── metrics.py         # Prometheus counters/histograms
│       └── tracing.py         # OpenTelemetry
└── tests/
```

---

## 3. API Surface (v1)

All endpoints scoped under `/v1`. JSON only. Errors use [RFC 7807 Problem Details](https://datatracker.ietf.org/doc/html/rfc7807).

### 3.1 Auth (called by both extension and dashboard)
| Method | Path | Purpose |
|---|---|---|
| `POST` | `/v1/auth/google` | Exchange Google ID token → Auro Healthcare DLP access JWT + refresh cookie. Enforces `hd` claim against tenant's allowed Workspace domains |
| `POST` | `/v1/auth/refresh` | Refresh access token using refresh cookie |
| `POST` | `/v1/auth/logout` | Revoke refresh token |
| `GET` | `/v1/auth/me` | Current user profile + role |

### 3.2 Scan (called by extension)
| Method | Path | Purpose |
|---|---|---|
| `POST` | `/v1/scan/email` | Body: `{message_id, subject, body, recipients[]}` (no attachments). Returns verdict synchronously (<2s) |
| `POST` | `/v1/scan/attachment` | `multipart/form-data` single file, max 10MB sync. Returns `{scan_id, status: 'scanned'\|'queued'}` |
| `GET` | `/v1/scan/{scan_id}` | Poll for queued deep-scan result. Returns same verdict shape when ready |
| `POST` | `/v1/scan/finalize` | Body: `{message_id, attachment_scan_ids[]}`. Combines text + attachment verdicts into final decision and writes audit |

Verdict response:
```json
{
  "scan_id": "01HW...",
  "decision": "warn",
  "severity": "HIGH",
  "score": 47.2,
  "matched_policies": ["pol_block_aadhaar_external"],
  "entities": [
    {"type": "IN_AADHAAR", "count": 1, "source": "body", "masked": "XXXX XXXX 9012"}
  ],
  "recipient_classes": {
    "alice@hospital.org": "internal",
    "patient@gmail.com": "public_email"
  },
  "warning_message": "This email contains 1 Aadhaar number and is going to a public email address. Are you sure?",
  "requires_user_confirmation": true,
  "audit_id": "aud_01HW...",
  "elapsed_ms": 312
}
```

### 3.3 Policy (admin)
| `GET/POST/PUT/DELETE` | `/v1/admin/policies` | CRUD policies, stored as JSON in `policies` table |
| `POST` | `/v1/admin/policies/{id}/dry-run` | Replay last N audit events against the proposed policy; returns counterfactual decision distribution |

### 3.4 Recipients / Domains (admin)
| `GET/POST/PUT/DELETE` | `/v1/admin/domains` | Manage Internal / Approved Partner domain lists |

### 3.5 Quarantine (admin)
| `GET` | `/v1/admin/quarantine` | Filterable, paginated list |
| `POST` | `/v1/admin/quarantine/{id}/approve` | Release; emits event to sender's extension to resume send |
| `POST` | `/v1/admin/quarantine/{id}/reject` | Block permanently |
| `POST` | `/v1/admin/quarantine/{id}/escalate` | Forward to security team |
| `GET` | `/v1/admin/quarantine/stream` | SSE — live new items |

### 3.6 Audit (admin)
| `GET` | `/v1/admin/audit` | Cursor-paginated; filters on actor, action, severity, date range |
| `GET` | `/v1/admin/audit/{id}` | Full event |
| `GET` | `/v1/admin/audit/export` | Async CSV export job; returns download URL when ready |

### 3.7 Dashboard aggregations
| `GET` | `/v1/admin/dashboard/stats?days=30` | Headline cards (total scans, blocked, quarantined, avg latency) |
| `GET` | `/v1/admin/dashboard/top-violations?days=30&limit=10` | Top entities / policies / users |
| `GET` | `/v1/admin/dashboard/trend?days=30&bucket=day` | Daily trend per decision |

---

## 4. Sync vs Async Split

| Workload | Path | Why |
|---|---|---|
| Subject + body text scan | **Inline FastAPI** | Always sub-second; blocking is fine on async endpoint with sync NLP via `run_in_threadpool` |
| Small text attachment (<200KB extracted text) | **Inline FastAPI** | Sub-second |
| Standard PDF/DOCX/XLSX, text-extractable | **Inline FastAPI** with timeout 1.5s | Most pass within budget |
| Scanned PDF, image, large PDF (>2MB), OCR-needed | **Celery worker** | OCR is unbounded |
| Audit write | **Inline** | Sync write is fast (single insert), but never block the verdict on it — use `BackgroundTasks` after sending response |
| Quarantine expiry, partition rollover, retention | **Celery beat** | Daily/hourly schedules |
| Dashboard CSV export | **Celery** | Can take minutes |

### 4.1 Wrapping sync detection on async endpoints
```python
from fastapi.concurrency import run_in_threadpool

@router.post("/scan/email")
async def scan_email(payload: ScanRequest, ctx: Ctx = Depends(get_ctx)):
    with timeout(seconds=2):
        result = await run_in_threadpool(
            detection_engine.scan_email, payload.to_engine_input()
        )
    ...
```

### 4.2 Celery dispatch without blocking
The `apply_async` call is blocking on Redis I/O. Wrap with `asyncio.to_thread` so a slow Redis can't stall request handlers:
```python
task = await asyncio.to_thread(deep_scan_attachment.apply_async,
                               args=[storage_uri, scan_id])
```

---

## 5. Authentication & Authorization

### 5.1 Identity model
- `Workspace` ↔ Google Workspace domain (or set of domains).
- `User` belongs to one workspace, role ∈ {`user`, `analyst`, `admin`, `super_admin`}.
- `ApiKey` (optional, for headless integrations) belongs to a workspace, scope ∈ {`scan`, `admin`}.

### 5.2 Chrome extension auth
- Extension uses Chrome `identity.getAuthToken` to obtain a Google ID token.
- Sends `POST /v1/auth/google` with `Authorization: Bearer <google_id_token>`.
- Backend verifies via `google.oauth2.id_token.verify_oauth2_token`, checks `hd` claim against workspace allowed domains.
- Issues:
  - Access JWT (HS256, 15-minute TTL, signed with per-workspace secret rotated quarterly).
  - Refresh token (opaque, 30-day TTL, stored hashed in `refresh_tokens` table, set as `HttpOnly; Secure; SameSite=Strict` cookie).
- Extension stores access JWT in `chrome.storage.session` only — never `chrome.storage.local` (survives uninstall).

### 5.3 Admin dashboard auth
Same Google OAuth flow, but role gated by DB. Access JWT 5-minute TTL because dashboard is web-visible.

### 5.4 Authorization
- `get_current_user`, `get_current_workspace`, `require_role("admin")` FastAPI dependencies.
- Every query MUST include `workspace_id = current_workspace.id`. Enforce at the repository layer; lint-rule on ORM queries.

### 5.5 Anti-bypass
- All `/v1/scan/*` endpoints require valid JWT; extension can't run without backend reachable.
- "Hard enforcement" mode: extension uses [Chrome Enterprise policy](https://chromeenterprise.google/policies/) to make uninstall require admin password. Policy file shipped with extension.

---

## 6. Policy Engine

### 6.1 Choice: custom Python DSL (JSON-serializable) over OPA/Rego

Rationale:
- Sub-millisecond evaluation inline in request (no sidecar hop).
- Dashboard can render/edit policies as forms — JSON DSL maps trivially.
- We only have one consumer (this backend); OPA's distribution model is overkill.
- Migration path to OPA is open if we ever add gateway-layer enforcement.

### 6.2 Policy model
```python
class Condition(BaseModel):
    field: Literal['entity.type', 'entity.count', 'recipient.class',
                   'attachment.has', 'severity', 'score']
    op:    Literal['eq', 'gte', 'lte', 'in', 'not_in', 'contains']
    value: Any

class Rule(BaseModel):
    id: str
    name: str
    when: list[Condition]      # AND-combined
    then: Literal['allow', 'warn', 'block', 'quarantine', 'escalate']
    warning_message: str | None = None
    priority: int              # higher wins on conflict

class Policy(BaseModel):
    id: str
    workspace_id: str
    name: str
    enabled: bool
    rules: list[Rule]
    updated_at: datetime
    updated_by: str
```

### 6.3 Evaluation
```python
def evaluate(scan: ScanResult, recipients: list[ClassifiedRecipient],
             attachments: list[Attachment], policies: list[Policy]) -> Decision:
    ctx = build_context(scan, recipients, attachments)
    matched: list[Rule] = []
    for p in policies:
        if not p.enabled:
            continue
        for r in p.rules:
            if all(eval_condition(c, ctx) for c in r.when):
                matched.append(r)
    if not matched:
        return Decision(action='allow', matched=[])
    winner = max(matched, key=lambda r: (ACTION_RANK[r.then], r.priority))
    return Decision(action=winner.then, matched=matched, message=winner.warning_message)
```

`ACTION_RANK = {'allow':0, 'warn':1, 'quarantine':2, 'block':3, 'escalate':4}` — most restrictive wins on tie.

### 6.4 Default seed policies (per new workspace)
1. `IN_AADHAAR` count≥1 + recipient.class `public_email` → **block**
2. `IN_AADHAAR` count≥1 + recipient.class `external` → **warn**
3. `severity = CRITICAL` → **quarantine**
4. `ABHA` count≥1 + recipient.class `external` → **quarantine**
5. `MEDICAL_DISEASE_DISORDER` + `PERSON` + recipient.class `public_email` → **warn**

Admin can edit/disable any of these.

### 6.5 Dry-run
`POST /v1/admin/policies/{id}/dry-run` replays the last N=10,000 audit events against the proposed policy and returns:
```json
{
  "would_block": 142,
  "would_warn": 380,
  "would_allow": 9450,
  "delta_vs_current": {"newly_blocked": 18, "newly_allowed": 4}
}
```

---

## 7. Recipient Classification

```python
class RecipientClass(str, Enum):
    INTERNAL        = 'internal'         # in workspace's primary domains
    APPROVED_PARTNER = 'approved_partner'  # in tenant-managed partner list
    EXTERNAL        = 'external'         # known business org (heuristic: corporate TLD, MX has SPF/DKIM, not in public list)
    PUBLIC_EMAIL    = 'public_email'     # gmail/yahoo/outlook/hotmail/proton/icloud/...
    UNKNOWN         = 'unknown'          # everything else
```

Implementation:
- Maintain `public_email_domains` static set (~50 domains, configurable).
- `domain_classifications` table per workspace for INTERNAL and APPROVED_PARTNER.
- EXTERNAL vs UNKNOWN heuristic: check MX record presence and SPF/DKIM via async DNS lookup, cached in Redis 24h. Default to UNKNOWN on lookup failure.

---

## 8. Database Schema (PostgreSQL 16+)

Use UUIDv7 (sortable, time-ordered) for IDs via `uuidv7` extension.

### 8.1 Core tables

```sql
CREATE TABLE workspaces (
  id           UUID PRIMARY KEY DEFAULT uuidv7(),
  name         TEXT NOT NULL,
  google_domains TEXT[] NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  settings     JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE users (
  id           UUID PRIMARY KEY DEFAULT uuidv7(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  email        CITEXT NOT NULL,
  role         TEXT NOT NULL CHECK (role IN ('user','analyst','admin','super_admin')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, email)
);

CREATE TABLE refresh_tokens (
  id           UUID PRIMARY KEY DEFAULT uuidv7(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   BYTEA NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  revoked_at   TIMESTAMPTZ
);

CREATE TABLE domain_classifications (
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  domain       TEXT NOT NULL,
  class        TEXT NOT NULL CHECK (class IN ('internal','approved_partner')),
  PRIMARY KEY (workspace_id, domain)
);

CREATE TABLE policies (
  id           UUID PRIMARY KEY DEFAULT uuidv7(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  name         TEXT NOT NULL,
  enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  rules        JSONB NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by   UUID REFERENCES users(id)
);

CREATE TABLE scans (
  id           UUID PRIMARY KEY DEFAULT uuidv7(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  user_id      UUID REFERENCES users(id),
  message_id   TEXT,                              -- Gmail message id when known
  status       TEXT NOT NULL CHECK (status IN ('pending','scanning','completed','failed')),
  decision     TEXT,
  severity     TEXT,
  score        NUMERIC(5,2),
  matched_policies UUID[],
  entities_summary JSONB,                         -- counts/types only, masked
  attachments_count INT NOT NULL DEFAULT 0,
  duration_ms  INT,
  error        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX idx_scans_ws_created ON scans(workspace_id, created_at DESC);
CREATE INDEX idx_scans_ws_decision ON scans(workspace_id, decision, created_at DESC);

CREATE TABLE quarantine_queue (
  id              UUID PRIMARY KEY DEFAULT uuidv7(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id),
  scan_id         UUID NOT NULL REFERENCES scans(id),
  sender_user_id  UUID NOT NULL REFERENCES users(id),
  recipients      TEXT[] NOT NULL,
  subject         TEXT,
  severity        TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','rejected','expired','escalated')),
  reviewed_by     UUID REFERENCES users(id),
  reviewed_at     TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_q_ws_status ON quarantine_queue(workspace_id, status, created_at DESC);
CREATE INDEX idx_q_expiry    ON quarantine_queue(expires_at) WHERE status = 'pending';
```

### 8.2 Audit log — immutable, hash-chained, partitioned

```sql
CREATE TABLE audit_events (
  id           UUID NOT NULL DEFAULT uuidv7(),
  workspace_id UUID NOT NULL,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  actor_type   TEXT NOT NULL CHECK (actor_type IN ('user','system','api_key')),
  actor_id     TEXT NOT NULL,
  actor_email  TEXT,

  action       TEXT NOT NULL,        -- 'scan.completed','scan.blocked','policy.updated','quarantine.approved'
  category     TEXT NOT NULL,        -- 'scan' | 'policy' | 'quarantine' | 'auth'

  resource_type TEXT,
  resource_id   TEXT,

  before_state JSONB,
  after_state  JSONB,
  metadata     JSONB,                 -- {scan_id, message_id, recipients_masked, entities_summary, decision, severity}

  prev_hash    BYTEA,
  row_hash     BYTEA NOT NULL,

  PRIMARY KEY (workspace_id, occurred_at, id)
) PARTITION BY RANGE (occurred_at);

-- Monthly partitions; example for May 2026
CREATE TABLE audit_events_2026_05
  PARTITION OF audit_events
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

-- Hash chain trigger
CREATE OR REPLACE FUNCTION compute_audit_hash() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE last_hash BYTEA;
BEGIN
  SELECT row_hash INTO last_hash
    FROM audit_events
   WHERE workspace_id = NEW.workspace_id
   ORDER BY occurred_at DESC, id DESC
   LIMIT 1;
  NEW.prev_hash := last_hash;
  NEW.row_hash := digest(
    concat_ws('|',
      NEW.workspace_id::text, NEW.occurred_at::text, NEW.id::text,
      NEW.actor_id, NEW.action, COALESCE(NEW.resource_id,''),
      COALESCE(NEW.metadata::text,''),
      COALESCE(encode(NEW.prev_hash,'hex'),'')
    ), 'sha256'
  );
  RETURN NEW;
END $$;

CREATE TRIGGER audit_events_hash
  BEFORE INSERT ON audit_events
  FOR EACH ROW EXECUTE FUNCTION compute_audit_hash();

-- Immutability
CREATE OR REPLACE FUNCTION block_audit_mutation() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'audit_events is append-only'; END $$;

CREATE TRIGGER audit_events_no_update BEFORE UPDATE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION block_audit_mutation();
CREATE TRIGGER audit_events_no_delete BEFORE DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION block_audit_mutation();

REVOKE UPDATE, DELETE ON audit_events FROM aurodlpv2_app;
GRANT  INSERT, SELECT ON audit_events TO aurodlpv2_app;
```

Verification job (Celery beat, daily): walk last partition, recompute hash chain, alert if mismatch.

### 8.3 Retention
- Audit: 6 years (HIPAA-equivalent; revisit for DPDP). Partitions rolled to compressed tablespace after 90 days.
- Scan rows: 6 years aligned with audit.
- Quarantine: 90 days after final disposition.

---

## 9. Attachment Handling

### 9.1 Upload pipeline
```
multipart upload  ─►  size check (≤10MB sync, ≤50MB async)
                  ─►  stream to /var/lib/aurodlpv2/tmp/{uuid}.part
                  ─►  python-magic MIME verification (reject mismatch)
                  ─►  atomic rename to {uuid}{.ext}
                  ─►  compute SHA-256 (for dedup + audit)
                  ─►  call detection engine (sync) OR enqueue Celery (async)
                  ─►  delete temp file in `finally`
```

### 9.2 Temp file security
- Dedicated mount with `noexec,nosuid,nodev`.
- Ownership `aurodlpv2:aurodlpv2`, mode `0700`.
- Lifecycle TTL 1 hour; reaper Celery job sweeps orphans.
- Filenames are random UUIDs — never use client-supplied name on disk.

### 9.3 Dedup
SHA-256 cache in Redis 24h. If hash already scanned for the same workspace with same engine config version → reuse verdict, mark audit `cached: true`.

### 9.4 Quarantined attachment storage
Quarantined emails' attachments are moved to a separate restricted-access S3 bucket (or local dir) with server-side encryption. Audit row references the storage URI; only `analyst+` role can fetch with time-limited signed URL.

---

## 10. Quarantine Workflow

### 10.1 State machine
```
              ┌──────────┐
   created    │ pending  │
  ─────────►  └────┬─────┘
                   │           
       ┌───────────┼───────────┬────────────┐
   approve     reject       escalate     expire (TTL)
       │           │           │            │
       ▼           ▼           ▼            ▼
  ┌────────┐ ┌────────┐  ┌─────────┐  ┌─────────┐
  │approved│ │rejected│  │escalated│  │ expired │
  └────────┘ └────────┘  └─────────┘  └─────────┘
```

### 10.2 Approve → release
- Admin clicks approve in dashboard.
- Backend marks `status='approved'`, writes audit, fires pub/sub event on Redis channel `q:approved:{workspace_id}`.
- Extension's service worker subscribes via SSE `/v1/quarantine/stream` for the sender; receives event, prompts user to retry send (or we offer "auto-resume" feature later).
- Sender's extension re-issues `POST /v1/scan/finalize` with `override_quarantine=<id>` and original payload; backend verifies the quarantine ID matches and approved within last 5 minutes, then returns `allow` decision.

### 10.3 Expiry
Celery beat daily: any `pending` past `expires_at` → `expired`, audit logged.

### 10.4 Escalate
Forwards a notification to the configured `escalation_email` (workspace setting) including masked context; never the raw email body.

---

## 11. Observability

| Concern | Tool | Notes |
|---|---|---|
| Structured logs | `structlog` JSON | Required fields: `request_id`, `workspace_id`, `user_id`, `scan_id` |
| Metrics | Prometheus | `scan_latency_seconds{decision}`, `entities_detected_total{type}`, `quarantine_depth`, `celery_queue_depth` |
| Traces | OpenTelemetry → OTLP | Span per request; child spans per detection stage |
| Errors | Sentry | All exceptions; PII scrubbing filter ON |
| Audit verification | Custom Celery job | Daily chain integrity check; alert on mismatch |

Latency SLOs (golden signals):
- `scan_latency_seconds{path=text}` p95 < 1s
- `scan_latency_seconds{path=attachment_sync}` p95 < 4s
- `scan_latency_seconds{path=attachment_deep}` p95 < 30s

---

## 12. Security Hardening

- TLS 1.3 only; HSTS preload on dashboard domain.
- All secrets in env / cloud KMS; no secrets in repo. `pydantic-settings` + dotenv for local only.
- DB at rest: encrypted volume + `pgcrypto` for selected JSONB fields containing partial PHI.
- Outbound: no third-party APIs from worker except OpenTelemetry collector.
- Rate limits: `slowapi` — 60 scans/min per user, 1000/min per workspace, 5 auth/min per IP.
- CORS: extension uses Bearer JWT (no cookies in scan path), so we can restrict CORS to dashboard origin only.
- CSP on dashboard: `default-src 'self'; frame-ancestors 'none'`.
- Dependency scanning: `pip-audit` in CI; renovate weekly.
- SBOM: `cyclonedx-bom` on every release.

---

## 13. Deployment

### 13.1 Containers
- `web` — uvicorn with `--workers=$(nproc)` behind nginx/ingress; rolling deploys.
- `celery-worker` — prefork `--concurrency=4` per pod; HPA on `celery_queue_depth`.
- `celery-beat` — singleton.
- `redis` — managed (Elasticache / Memorystore / Upstash) with persistence.
- `postgres` — managed (RDS / Cloud SQL) with PITR and read replica.

### 13.2 Migrations
- `alembic upgrade head` runs on web startup behind an advisory lock to prevent concurrent migrations.
- Zero-downtime expand → migrate → contract pattern.

### 13.3 Local dev
- `docker-compose.yml` brings up web + worker + beat + redis + postgres + minio (S3) + jaeger (traces).
- `make seed` populates demo workspace + policies + recipients.

---

## 14. Build Phases

### Phase 0 — Skeleton (Days 1–2)
- Repo + pyproject + ruff/mypy/pytest baseline + docker-compose.
- FastAPI app factory, settings, healthcheck, structlog.
- Alembic baseline.

### Phase 1 — Auth + workspaces (Days 3–5)
- Google OAuth verification, JWT issue/refresh.
- `workspaces`, `users`, `refresh_tokens` tables + APIs.
- `get_current_user` / `get_current_workspace` deps.
- Tests: token expiry, hd-claim mismatch, role escalation rejection.

### Phase 2 — Scan endpoints with stubbed engine (Days 6–8)
- `POST /v1/scan/email`, `POST /v1/scan/attachment`, `GET /v1/scan/{id}`, `POST /v1/scan/finalize`.
- Detection engine called via in-process import; stubbed result first.
- Audit writer with hash chain.
- Tests: latency budget enforced, audit rows immutable.

### Phase 3 — Detection engine integration (Days 9–11)
- Wire `aurodlpv2_detection` package.
- Per-tenant config loading.
- Temp file lifecycle.
- Sync vs async decision logic.

### Phase 4 — Celery deep scan (Days 12–14)
- Celery app + redis broker.
- Deep-scan task, status tracking in `scans` table.
- Polling endpoint.
- Workers exit cleanly on SIGTERM.

### Phase 5 — Policy + recipients (Days 15–17)
- `policies` CRUD, evaluator, dry-run endpoint.
- Domain classification + Redis DNS cache.
- Seed default policies on workspace create.

### Phase 6 — Quarantine (Days 18–20)
- Queue + state machine + admin APIs + SSE.
- Beat job for expiry.
- Approve→resume flow with extension.

### Phase 7 — Dashboard APIs (Days 21–22)
- Aggregations, pagination, CSV export job.
- Cursor pagination for audit.

### Phase 8 — Hardening (Days 23–25)
- Rate limiting, security headers, dependency scan, SBOM.
- Load test: 200 concurrent scan/email at 95% allow → confirm p95 budget.
- Audit chain verification CI test.

---

## 15. Reference OSS to study

- [AkesoDLP](https://github.com/derekxmartin/AkesoDLP) — FastAPI DLP server with policy evaluator, gRPC agents, JWT auth, audit. **Closest architectural match to ours.**
- [lumen-argus](https://github.com/lumen-argus/lumen-argus) — Dashboard API patterns, rules engine with live reload, SSE alerts.
- [Nightfall Python SDK](https://github.com/nightfallai/nightfall-python-sdk) — Reference for scan API shape and webhook patterns.

---

## 16. Open Questions for SRS

1. Is the deployment target self-hosted-per-hospital, multi-tenant SaaS, or both?
2. What's the regulatory regime — HIPAA-equivalent or India DPDP — for audit retention and data residency?
3. Where do quarantined attachments live (S3, on-prem object store, encrypted DB blobs)?
4. Should "block" actually prevent send, or is this advisory? (PRD says "block" but Gmail can't be hard-blocked from a Chrome extension without enterprise policy.)
5. What's the escalation channel — email, Slack/Teams webhook, SIEM forwarder?
6. Concurrent-user target per workspace? Drives sizing.
7. Do tenants share one Postgres (logical isolation by `workspace_id`) or get isolated DBs?

---

## 17. References

1. Hemantapkh — FastAPI + Celery production patterns — https://hemantapkh.com/posts/celery-tasks-in-fastapi/
2. OneUptime — FastAPI + Postgres + Celery stack — https://oneuptime.com/blog/post/2026-02-08-how-to-set-up-a-fastapi-postgresql-celery-stack-with-docker-compose/view
3. AppMaster — Hash-chained audit trails in PostgreSQL — https://appmaster.io/blog/tamper-evident-audit-trails-postgresql
4. Viprasol — SaaS audit trail schema — https://viprasol.com/blog/saas-audit-trail/
5. Styra — OPA/Rego vs Cedar vs Zanzibar comparison — https://www.styra.com/blog/comparing-opa-rego-to-aws-cedar-and-google-zanzibar
6. Teleport — Policy languages benchmark — https://goteleport.com/blog/benchmarking-policy-languages/
7. Greeden — Secure file uploads in FastAPI — https://blog.greeden.me/en/2026/03/03/implementing-secure-file-uploads-in-fastapi-practical-patterns-for-uploadfile-size-limits-virus-scanning-s3-compatible-storage-and-presigned-urls/
8. fastapi-secure-file-upload — https://github.com/noone-m/fastapi-secure-file-upload
9. Chrome extension OAuth guide — https://developer.chrome.com/docs/extensions/how-to/integrate/oauth
10. AkesoDLP — https://github.com/derekxmartin/AkesoDLP
11. lumen-argus — https://github.com/lumen-argus/lumen-argus
