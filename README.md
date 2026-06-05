# Auro Healthcare DLP

Healthcare Data-Loss-Prevention for Gmail / Google Workspace.

A Chrome extension inspects outgoing Gmail messages — subject, body, recipients, and
supported attachment types (see [Supported file formats](#supported-file-formats)) — for
Indian healthcare PHI/PII (Aadhaar, PAN, ABHA, MRN/UHID, ICD-10, patient identifiers) and
warns or blocks before the message is sent. A FastAPI backend handles multi-tenant auth,
organization + domain allowlists, and scan-event analytics, and an admin dashboard surfaces
what was detected, blocked, and allowed across the org.

The `detection/` package is a standalone Python PHI/PII engine — recognizers, document
extractors, and OCR backends — built to power deeper server-side scans.

## Repository

```
aurodlpv2/
├── backend/        FastAPI + Postgres (SQLAlchemy async)          (Python 3.12, uv)
├── detection/      Pure-Python PHI/PII detection engine           (Python 3.12, uv)
├── frontend/       pnpm workspace                                 (Node 20, pnpm 9)
│   └── packages/
│       ├── extension/   Chrome MV3 + Vite + InboxSDK + React 19 + Tailwind/Shadow DOM
│       ├── dashboard/   Admin SPA (Vite + React 19 + TanStack + shadcn/ui + Recharts)
│       └── shared/      Cross-package types + zod schemas + API client
├── docs/
│   ├── prd.md                          product requirements
│   ├── srs.md                          software requirements
│   └── plans/                          phased build specs (roadmap)
│       ├── frontend.md
│       ├── backend.md
│       └── detection-engine.md
├── infra/          docker-compose dev stack (postgres, redis, minio, jaeger, mailhog)
├── scripts/        dev helpers
├── Makefile
├── LICENSE         MIT
└── README.md
```

## Stack

| Layer         | Choice                                                                            |
|---------------|-----------------------------------------------------------------------------------|
| Extension     | Chrome MV3, Vite + @crxjs/vite-plugin, React 19, TS strict, InboxSDK, Tailwind v3 |
| Dashboard     | Vite, React 19, React Router 6.4, TanStack Query/Table, shadcn/ui, Recharts       |
| API           | Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2.0 (asyncpg), Alembic              |
| Detection     | Presidio, spaCy, python-stdnum, simple_icd_10_cm, PyMuPDF, python-docx, openpyxl  |
| OCR           | Tesseract primary, PaddleOCR fallback (low-conf / Indic / handwritten)            |
| Database      | PostgreSQL 16 (SQLAlchemy 2.0 async, Alembic migrations)                          |
| Observability | structlog JSON, Prometheus metrics                                                |
| Auth          | Email/password (argon2id) → JWT access + 30-day httpOnly refresh cookie           |
| Tooling       | uv, pnpm 9, ruff, pyright strict, TS strict, Vitest, Docker Compose               |

## Quickstart

```bash
git clone <repo>
cd aurodlpv2

make dev-up                 # docker-compose: postgres, redis, minio, jaeger, mailhog
make install                # uv sync backend + detection, pnpm install
make migrate                # alembic upgrade head

make backend-dev            # FastAPI on :8000
make dashboard-dev          # dashboard (Vite) on :5173
make extension-dev          # extension with crxjs HMR
```

Load the extension in Chrome → `chrome://extensions` → Developer mode → Load unpacked →
`frontend/packages/extension/dist`.

## Status

Implemented today:

- **Extension** — Gmail send-interception with client-side PHI/PII matching, approved-domain
  and email allowlists, and a pre-send warning banner.
- **Dashboard** — auth (signup / login / onboarding / invites), organization switcher,
  domain management, and a detection-analytics overview.
- **Backend** — multi-tenant auth (email/password + JWT), organizations, members, domain
  allowlists, and scan-event ingestion + analytics over Postgres.

The broader pipeline — server-side deep scan (DOCX / XLSX / image + OCR), quarantine vault,
and hash-chained audit log — is specified in [`docs/plans/`](docs/plans) and not yet wired up.

## Supported file formats

PHI/PII detection runs **client-side in the extension**, before Gmail uploads the file.
Email **subject and body** text is always scanned; attachments are scanned by type:

| Attachment | Scanned today | How |
|------------|---------------|-----|
| Plain text — `.txt`, `.csv`, `.log` | yes | read directly |
| PDF — `.pdf` | yes (text layer) | pdf.js; scanned / image-only PDFs are **not** OCR'd |
| Word `.docx`, Excel `.xlsx`, images | not yet | handled by the `detection/` engine, not wired into the live flow |

Attachments larger than 25 MB are skipped. Richer formats (Office documents, images, and
OCR for scanned pages) live in the `detection/` engine and are tracked as roadmap in
[`docs/plans/detection-engine.md`](docs/plans/detection-engine.md).

## License

MIT — see [`LICENSE`](LICENSE).
