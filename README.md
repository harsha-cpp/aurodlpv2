# Auro DLP v2

Healthcare Data-Loss-Prevention for Gmail / Google Workspace.

A Chrome extension scans every outgoing email — subject, body, recipients, attachments — for Indian healthcare PHI/PII (Aadhaar, PAN, ABHA, MRN/UHID, ICD-10, patient info) before Gmail sends it. A FastAPI backend runs the detection pipeline (Presidio + custom recognizers + Tesseract/PaddleOCR), evaluates per-tenant policies, and quarantines high-risk messages for admin review.

## Repository

```
aurodlpv2/
├── backend/        FastAPI + Celery + Postgres + Redis           (Python 3.12, uv)
├── detection/      Pure-Python detection engine                  (Python 3.12, uv)
├── frontend/       pnpm workspace                                (Node 20, pnpm 9)
│   └── packages/
│       ├── extension/   Chrome MV3 + Vite + InboxSDK + React 19 + Tailwind/Shadow DOM
│       ├── dashboard/   Admin SPA (Vite + React 19 + TanStack + shadcn/ui + Recharts)
│       └── shared/      Cross-package types + zod schemas + API client
├── docs/
│   ├── prd.md
│   ├── srs.md
│   ├── codex-backend-prompt.md      handoff prompt for Codex backend build
│   └── plans/                       authoritative build specs
│       ├── frontend.md
│       ├── backend.md
│       └── detection-engine.md
├── infra/          docker-compose, k8s manifests (later)
├── scripts/        dev helpers
├── Makefile
├── LICENSE         MIT
└── README.md
```

## Stack

| Layer       | Choice                                                                              |
|-------------|-------------------------------------------------------------------------------------|
| Extension   | Chrome MV3, Vite + @crxjs/vite-plugin, React 19, TS strict, InboxSDK, Tailwind v3   |
| Dashboard   | Vite, React 19, React Router 6.4, TanStack Query/Table, shadcn/ui, Recharts, SSE    |
| API         | Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2.0 (asyncpg), Alembic, slowapi       |
| Async jobs  | Celery 5 + Redis 7 (broker + result + cache)                                        |
| Detection   | Presidio, spaCy, python-stdnum, simple_icd_10_cm, PyMuPDF, python-docx, openpyxl    |
| OCR         | Tesseract 5 primary, PaddleOCR fallback (low-conf / Indic / handwritten)            |
| Database    | PostgreSQL 16 (partitioned audit log + pgcrypto hash chain)                         |
| Object store| MinIO (local) / S3-compatible (prod) - quarantine vault                             |
| Observability | structlog JSON, Prometheus, OpenTelemetry, Sentry                                 |
| Auth        | Google Identity (openid email profile only) -> backend JWT 15min + 30d refresh      |
| Tooling     | uv, pnpm 9, ruff, pyright strict, TS strict, Vitest, Playwright, Docker Compose     |

## Quickstart

```bash
git clone <repo>
cd aurodlpv2

# infra
make dev-up                 # postgres + redis + minio + jaeger

# python
make install                # uv sync backend + detection, pnpm install
make migrate                # alembic upgrade head
make seed                   # demo workspace + default policies (once implemented)

# backend
make backend-dev            # FastAPI :8000
make worker-dev             # Celery worker (in another shell)
make beat-dev               # Celery beat   (in another shell)

# frontend
make dashboard-dev          # Vite :5173
make extension-dev          # crxjs HMR :5174
```

Load the extension in Chrome → `chrome://extensions` → Developer mode → Load unpacked → `frontend/packages/extension/dist`.

## Status

Scaffold complete. Module shells in place, no business logic. Implementation follows phased plans:

- Backend phases → [`docs/plans/backend.md`](docs/plans/backend.md) §16
- Detection phases → [`docs/plans/detection-engine.md`](docs/plans/detection-engine.md) §13
- Frontend phases → [`docs/plans/frontend.md`](docs/plans/frontend.md) §17

Backend implementation is being delegated; the handoff brief lives at [`docs/codex-backend-prompt.md`](docs/codex-backend-prompt.md).

## License

MIT — see [`LICENSE`](LICENSE).
