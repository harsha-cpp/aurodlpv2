# Auro Healthcare DLP

Healthcare Data-Loss-Prevention for Gmail / Google Workspace.

A Chrome extension inspects outgoing Gmail messages — subject, body, recipients, and
supported attachment types (see [Supported file formats](#supported-file-formats)) — for
Indian healthcare PHI/PII (Aadhaar, PAN, ABHA, MRN/UHID, ICD-10, patient identifiers) and
warns or blocks before the message is sent. A FastAPI backend handles multi-tenant auth,
organization + domain allowlists, and scan-event analytics, and an admin dashboard surfaces
what was detected, blocked, and allowed across the org.

The `detection/` package is a standalone Python PHI/PII engine — a declarative rule pack,
document extractors, and OCR backends. The same rule pack is exported to the extension,
so the offline fallback and the server agree by construction rather than by discipline.

## Repository

```
aurodlpv2/
├── backend/        FastAPI + Postgres + Celery                    (Python 3.12, uv)
├── detection/      Pure-Python PHI/PII detection engine           (Python 3.12, uv)
├── frontend/       pnpm workspace                                 (Node 20, pnpm 9)
│   └── packages/
│       ├── extension/   Chrome MV3 + Vite + React 19 + Shadow DOM
│       ├── dashboard/   Admin SPA (Vite + React 19 + TanStack Query + Recharts)
│       └── shared/      Cross-package types, zod schemas, and the exported rule pack
├── docs/
│   ├── prd.md                          product requirements
│   ├── srs.md                          software requirements
│   └── plans/
│       ├── hardening.md                production hardening plan + findings
│       ├── frontend.md                 original build spec
│       ├── backend.md                  original build spec
│       └── detection-engine.md         original build spec
├── infra/          docker-compose dev stack (postgres, redis, minio, jaeger, mailhog)
├── scripts/        dev helpers
├── Makefile
├── LICENSE         MIT
└── README.md
```

## Stack

| Layer         | Choice                                                                            |
|---------------|-----------------------------------------------------------------------------------|
| Extension     | Chrome MV3, Vite + @crxjs/vite-plugin, React 19, TS strict, Shadow DOM         |
| Dashboard     | Vite, React 19, React Router 6.4, TanStack Query, Recharts, hand-rolled CSS    |
| API           | Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2.0 (asyncpg), Alembic              |
| Detection     | Declarative rule pack + spaCy NER, simple_icd_10_cm, PyMuPDF, python-docx, openpyxl |
| OCR           | Tesseract primary, PaddleOCR fallback (low-conf / Indic / handwritten)            |
| Database      | PostgreSQL 16 (SQLAlchemy 2.0 async, Alembic migrations)                          |
| Observability | structlog JSON, Prometheus metrics                                                |
| Auth          | Email/password (argon2id) + TOTP MFA → JWT access + rotating refresh cookie    |
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

Detection accuracy is measured, not asserted — see
[`detection/README.md`](detection/README.md). Against a 116-document labelled
corpus the engine currently scores **0.982 entity F1** and **0.993 document
F1**, with **0 false alarms** on the 40 clean-mail samples. `make accuracy`
prints the table; CI fails if any metric regresses.

Implemented today:

- **Detection** — 21 entity types (Aadhaar, PAN, ABHA number and address,
  MRN/UHID, visit IDs, ICD-10, insurance, bank/UPI/IFSC/GSTIN, passport,
  licence, voter ID, names, DOB, phone, email), validated by checksum where one
  exists, gated on surrounding context, with overlap resolution and a real
  0–100 risk scale.
- **Attachments** — PDF (text layer plus OCR), DOCX including headers, footers
  and text boxes, XLSX and legacy XLS, CSV, PPTX, RTF, EML and ZIP, classified
  by content signature rather than by filename.
- **Backend** — multi-tenant auth with MFA, password reset and email
  verification; per-device enrolment; a configurable policy engine with sender
  and recipient classification; quarantine; and a hash-chained append-only
  audit log.
- **Extension** — Gmail send interception across every send path including
  scheduled send, failing closed when it cannot reach the backend, with the
  same rule pack the server uses.
- **Dashboard** — auth, organizations, domains, members, quarantine review,
  audit, and detection analytics.

The full hardening plan and the findings behind it are in
[`docs/plans/hardening.md`](docs/plans/hardening.md).

### Enforcement scope, honestly

The extension is a strong deterrent against accidental leaks, not a compliance
guarantee. Mobile Gmail, a second browser and a disabled extension all route
around it. A hard guarantee needs Workspace admin force-install plus
server-side Gmail content compliance rules or the Gmail API; that is
deliberately out of scope today.

## Supported file formats

Email **subject and body** are always scanned. Attachments are scanned
server-side by the detection engine; the extension also runs a local pass so a
backend outage does not leave a send unchecked.

| Attachment | Server | Extension fallback |
|------------|--------|--------------------|
| Plain text — `.txt`, `.csv`, `.tsv`, `.log`, `.json`, `.md` | yes | yes |
| PDF — `.pdf` | yes, text layer + OCR for scanned pages | text layer only |
| Word — `.docx` (body, tables, headers, footers, text boxes, embedded images) | yes | no |
| Excel — `.xlsx`, `.xlsm`, `.xls` | yes | no |
| PowerPoint — `.pptx` (slides + speaker notes) | yes | no |
| Rich text — `.rtf` | yes | no |
| Email — `.eml` (recursively, including its own attachments) | yes | no |
| Archives — `.zip` (depth, member and size capped) | yes | no |
| Images — `.png`, `.jpg`, `.tiff`, … | yes, via OCR | no |

Files are classified by content signature, so renaming one does not skip the
scan. Attachments larger than 25 MB are skipped. CSV and spreadsheet rows are
rendered with each value carrying its column header, so a `UHID` header still
reaches the value forty rows below it.

## License

MIT — see [`LICENSE`](LICENSE).
