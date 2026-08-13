# Auro Healthcare DLP

Healthcare Data-Loss-Prevention for Gmail, web applications, and browser-based AI tools.

A Chrome extension inspects outgoing Gmail messages — subject, body, recipients, and
supported attachment types (see [Supported file formats](#supported-file-formats)) — for
Indian healthcare PHI/PII (Aadhaar, PAN, ABHA, MRN/UHID, ICD-10, patient identifiers) and
warns or blocks before the message is sent. A FastAPI backend handles multi-tenant auth,
organization + domain allowlists, and scan-event analytics, and an admin dashboard surfaces
what was detected, blocked, and allowed across the org.

The `detection/` package is a standalone Python PHI/PII engine — recognizers, document
extractors, and OCR backends — built to power deeper server-side scans.

The extension also installs a local, pre-insertion web input guard. Supported patient
identifiers are blocked during paste, text insertion, drag-and-drop, input, Enter, form submit,
and common SPA send actions in supported editable fields. Candidate text remains in the browser
and notices show entity categories rather than matched values.

## Repository

```
aurodlpv2/
├── backend/        FastAPI + Postgres (SQLAlchemy async)          (Python 3.12, uv)
├── detection/      Pure-Python PHI/PII detection engine           (Python 3.12, uv)
├── frontend/       pnpm workspace                                 (Node 22.16, pnpm 11.20)
│   └── packages/
│       ├── extension/   Chrome MV3 + Vite + InboxSDK + React 19 + Tailwind/Shadow DOM
│       ├── dashboard/   Admin SPA (Vite + React 19 + TanStack + shadcn/ui + Recharts)
│       └── shared/      Cross-package types + zod schemas + API client
├── docs/
│   ├── prd.md                          product requirements
│   ├── srs.md                          software requirements
│   ├── privacy.md                      data-use and Chrome permission disclosure
│   ├── architecture/                   C4 context, container, deployment, and flow views
│   ├── adr/                            accepted architecture decisions
│   └── plans/                          implemented architecture and remaining release work
├── infra/          docker-compose dev stack (postgres, redis, minio)
├── requirements/   non-secret production decisions and owner input checklists
├── scripts/        dev helpers
├── Makefile
├── LICENSE         MIT
└── README.md
```

## Stack

| Layer         | Choice                                                                               |
| ------------- | ------------------------------------------------------------------------------------ |
| Extension     | Chrome MV3, Vite + @crxjs/vite-plugin, React 19, TS strict, InboxSDK, Tailwind v3    |
| Dashboard     | Vite, React 19, React Router 7, TanStack Query/Table, shadcn/ui, Recharts            |
| API           | Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2.0 (asyncpg), Alembic                 |
| Detection     | Presidio, spaCy, python-stdnum, simple_icd_10_cm, PyMuPDF, python-docx, openpyxl     |
| OCR           | Optional Tesseract/PaddleOCR profiles; not installed by the default dev/runtime path |
| Database      | PostgreSQL 16 (SQLAlchemy 2.0 async, Alembic migrations + durable scan jobs)         |
| Object store  | Private S3-compatible storage (MinIO locally; R2/S3-compatible in production)        |
| Observability | structlog JSON, Prometheus metrics                                                   |
| Auth          | Email/password (argon2id) → JWT access + 30-day httpOnly refresh cookie              |
| Tooling       | uv locks, Node 22.16, pnpm 11.20, ruff, strict Pyright/TypeScript, Vitest            |

## Quickstart

```bash
git clone <repo>
cd aurodlpv2

make dev-up                 # docker-compose: postgres, redis, minio
make install                # uv sync backend + detection, pnpm install
make migrate                # alembic upgrade head

make backend-dev            # FastAPI on :8000
make worker-dev             # durable attachment scan worker
make dashboard-dev          # dashboard (Vite) on :5173
make extension-dev          # extension with crxjs HMR
```

Load the extension in Chrome → `chrome://extensions` → Developer mode → Load unpacked →
`frontend/packages/extension/dist`.

## Revamp branch status

- **Extension** — local all-web/AI input prevention plus authenticated Gmail interception,
  complete attachment accounting, fail-closed degraded behavior, content-bound quarantine
  release, and validated production API-origin configuration.
- **Dashboard** — signup/login/session recovery, tenant administration, domains, members,
  quarantine, audit, analytics, and revocable extension enrollment.
- **Backend** — tenant-bound human and extension principals, rotating refresh families, CSRF,
  distributed login throttling, durable PostgreSQL scan jobs, private object storage, locked
  quarantine decisions, masked hash-chained audit events, and readiness checks.
- **Detector** — contextual India-focused healthcare identifiers, bounded `0–100` scoring,
  fail-closed extraction, and an expanded regression corpus.
- **Release gates** — strict lint/type checks, unit and live PostgreSQL/MinIO security tests,
  dependency audits, browser validation, clean migrations, immutable CI dependencies,
  committed-secret/SAST/container scans, CycloneDX SBOM generation, and a non-root API image.

The branch is a complete local engineering deliverable, not a claim of zero residual risk or
regulatory certification. Production launch still requires the non-secret owner decisions in
[`requirements/`](requirements/), provider secrets supplied through a secret manager, a
de-identified detector evaluation, Chrome Web Store review, legal/privacy review, and an
independent penetration test.

Architecture and operating details are in [`docs/architecture/`](docs/architecture/),
[`docs/adr/`](docs/adr/), [`docs/srs.md`](docs/srs.md), and
[`docs/privacy.md`](docs/privacy.md).

## Supported file formats

The extension scans lightweight text locally and sends captured content to the backend for
the authoritative pre-send decision. The backend supports:

| Attachment      | Scanned today | How                                                            |
| --------------- | ------------- | -------------------------------------------------------------- |
| PDF — `.pdf`    | yes           | PyMuPDF text extraction; image pages enter OCR when configured |
| Word — `.docx`  | yes           | `python-docx` extraction                                       |
| Excel — `.xlsx` | yes           | `openpyxl` read-only extraction                                |
| Images          | queued        | OCR worker when an OCR backend is configured                   |

Unsupported, oversized, unreadable, queued, or failed attachments block finalization. Queued
inputs use short-lived private object storage and are deleted by a separately retryable cleanup
phase before a scan becomes terminal. A bucket lifecycle independently expires stranded objects.

## License

MIT — see [`LICENSE`](LICENSE).
