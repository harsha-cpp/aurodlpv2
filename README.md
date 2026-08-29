# Auro Healthcare DLP

Healthcare data-loss prevention for the browser. One Chrome extension enforces two
separate paths, and one FastAPI backend keeps the policy, the analytics and the
audit log.

**Path 1, Gmail send-time scanning.** A content script on `mail.google.com`
intercepts every send path, uploads the subject, body, recipients and supported
attachments to the backend, and applies the organization's policy before Gmail
transmits anything. Verdicts are `allow`, `warn`, `quarantine`, `block` and
`escalate`.

**Path 2, universal web input protection.** A second content script runs on every
other `http://` and `https://` page and stops patient data being pasted or typed
into any editable field: ChatGPT, Gemini, a support ticket, an ordinary web form.
It decides locally and synchronously from the offline rule pack, so there is no
network call in the keystroke path. When it blocks, it reports the block to the
backend for audit: entity types, masked values and the site hostname, never the
text itself.

The `detection/` package is a Python PHI/PII engine: a declarative rule pack,
document extractors and OCR backends. It is a library that the backend imports,
not a service you deploy. The same rule pack is exported to the extension, so the
offline guard and the server agree by construction rather than by discipline.

## Repository

```
aurodlpv2/
  backend/      FastAPI + Postgres + Celery                 (Python 3.12, uv)
  detection/    PHI/PII detection engine, imported by the backend
  frontend/     pnpm workspace                              (Node 20, pnpm 9)
    packages/extension/   Chrome MV3, Vite, React 19, shadow DOM
    packages/dashboard/   Admin SPA (Vite, React 19, TanStack Query, Recharts)
    packages/shared/      Shared types, zod schemas, exported rule pack
  demo/         Demo runbook and synthetic sample documents
  docs/
    prd.md                product requirements
    srs.md                software requirements
    privacy.md            data handling and Chrome permission disclosure
    deployment.md         single-host Docker Compose deployment
    adr/                  architecture decision records
    plans/                build plans and the production hardening plan
  infra/        Docker Compose stacks and the deployment images
  scripts/      bootstrap.sh
  Makefile
  LICENSE       MIT
```

## Deployable services

The production stack in `infra/docker-compose.prod.yml` runs six long-lived
services plus two one-shot jobs:

| Service | What it is |
|---|---|
| `api` | FastAPI, uvicorn. Imports the detection engine in-process. |
| `worker` | Celery worker for queued and image attachment scans. |
| `dashboard` | The admin SPA, built by Vite and served by nginx. |
| `postgres` | All application data. |
| `redis` | Celery broker and rate-limit counters. |
| `minio` | S3-compatible storage for queued attachment bytes. |
| `migrate` | One-shot `alembic upgrade head` under an advisory lock. |
| `minio-init` | One-shot bucket creation. |

Detection is not on that list. `backend/pyproject.toml` takes a path dependency on
`../detection`, which is why the image build context is the repository root. See
[`docs/deployment.md`](docs/deployment.md).

## Stack

| Layer | Choice |
|---|---|
| Extension | Chrome MV3, Vite, @crxjs/vite-plugin, React 19, TS strict, shadow DOM |
| Dashboard | Vite, React 19, React Router 6, TanStack Query, Recharts, hand-written CSS |
| API | Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2.0 (asyncpg), Alembic |
| Detection | Declarative rule pack, spaCy NER, simple_icd_10_cm, PyMuPDF, python-docx, openpyxl |
| OCR | Tesseract first, PaddleOCR fallback for low-confidence, Indic and handwritten pages |
| Database | PostgreSQL 16 |
| Observability | structlog JSON logs. See the note under Status. |
| Auth | Email/password (argon2id) plus TOTP MFA, JWT access token, rotating refresh cookie |
| Tooling | uv, pnpm 9, ruff, pyright strict, Vitest, Docker Compose |

## Quickstart

```bash
git clone <repo>
cd aurodlpv2

make dev-up                 # postgres, redis, minio, jaeger, mailhog
make install                # uv sync backend + detection, pnpm install
make migrate                # alembic upgrade head

make backend-dev            # FastAPI on :8000
make dashboard-dev          # dashboard on :5173
make extension-dev          # extension with crxjs HMR, writes dist/
```

Load the extension in Chrome: `chrome://extensions`, turn on Developer mode,
choose Load unpacked, select `frontend/packages/extension/dist`. There is no
checked-in `manifest.json`; it is generated from `manifest.config.ts` at build
time, so you must build before loading. Chrome 120 or newer.

A full walkthrough, including the sample documents and the exact verdict each one
produces, is in [`demo/README.md`](demo/README.md).

Other useful targets: `make test`, `make lint`, `make typecheck`,
`make accuracy`, `make rulepack`, `make test-integration`. Run `make` with no
argument to list them.

## Status

Detection accuracy is measured, not asserted. Against the 119-document,
175-span labelled corpus in `detection/tests/corpus/`, the engine scores
**0.9826 entity F1** and **0.9936 document F1**, with **0 false alarms** on the
40 clean-mail samples. `make accuracy` prints the table;
`detection/tests/accuracy_baseline.json` records every metric as a floor and CI
fails if one drops.

Implemented today:

- **Detection.** 21 entity types (Aadhaar, PAN, ABHA number and address,
  MRN/UHID, patient visit ID, lab accession, ICD-10, medical licence, insurance
  policy, bank account, IFSC, UPI, GSTIN, passport, driving licence, voter ID,
  person name, date of birth, phone, email), validated by checksum where one
  exists, gated on surrounding context, with overlap resolution and a 0 to 100
  risk scale.
- **Attachments.** PDF with text layer plus OCR, DOCX including headers, footers
  and text boxes, XLSX and legacy XLS, CSV, PPTX, RTF, EML and ZIP, classified by
  content signature rather than by filename.
- **Backend.** Multi-tenant auth with MFA, password reset and email verification;
  per-device enrolment; a configurable policy engine with sender and recipient
  classification; quarantine; and a hash-chained, trigger-protected audit log.
- **Gmail path.** Send interception across every send path including scheduled
  send, failing closed when it cannot reach the backend, running the same rule
  pack the server uses as its offline fallback.
- **Web input path.** A `document_start` content script in all frames on every
  other site, blocking paste, keystroke, drop, autofill, form submit and
  send-button clicks that would put patient data into an editable field.
- **Dashboard.** Auth, organizations, domains, members, devices, policy editing
  and simulation, quarantine review, audit log, and detection analytics split by
  channel and by site.

Not implemented, despite the code that looks like it is:
`backend/aurodlpv2_backend/observability/metrics.py` declares five Prometheus
collectors, but nothing increments them and no `/metrics` endpoint is mounted.
Treat the backend as having structured logs only. The `jaeger` container in the
dev stack is likewise unused: no OpenTelemetry exporter is configured in
`backend/aurodlpv2_backend/`.

The production hardening plan and the findings behind it are in
[`docs/plans/hardening.md`](docs/plans/hardening.md).

## How the web input path decides

The guard runs entirely in the page. It listens in the capture phase for
`paste`, `beforeinput` (one check per inserted keystroke), `drop`, `input` (an
autofill backstop that clears the field after the fact), `keydown` on Enter,
`submit`, and clicks on send-like buttons. Password inputs are never inspected,
and neither are disabled, read-only or non-text inputs.

Detected identifiers fall into two classes, both defined in
`frontend/packages/extension/src/content/input-protection.ts`:

| Class | Types | Behaviour |
|---|---|---|
| Standalone (17) | Aadhaar, PAN, passport, driving licence, voter ID, ABHA number, ABHA address, MRN, patient visit ID, lab accession, ICD-10, medical licence, insurance policy, bank account, IFSC, UPI, GSTIN | Blocks on its own |
| Contextual (4) | Email address, phone, person name, date of birth | Counts only when a standalone identifier is present in the same text, or the text matches the clinical keyword pattern `PATIENT_CONTEXT` |

The split exists because blocking a bare email address broke ordinary login and
signup forms. A name and a phone number in a support ticket are left alone; the
same name next to an MRN is not.

Text longer than 500,000 characters is not inspected and is blocked outright, so
the guard fails closed on a paste it cannot check in time.

## Reporting a web block

A content script on an arbitrary site cannot POST to the backend: the request
carries that site's origin and CORS refuses it. The block is therefore relayed
to the extension's MV3 service worker, which runs in the extension's own context
where the `host_permissions` entry for the backend origin applies.

The service worker posts to `POST /api/v1/events` with `channel: "web"` and
`site_host: "<hostname>"`. The backend stores `channel` and `site_host` on
`scan_events` (migration `20260829_0006`) and writes one append-only audit row
with `category="scan"`, whose metadata carries the channel, the site host, the
entity types, the entity count, the risk score and the severity.

What leaves the browser: entity types, masked values, a risk score, a severity,
the hostname, the organization code and a client event ID. What does not: the
typed or pasted text, the page URL, the page title, the field name, and any DOM
context. Repeated blocks of the same finding on the same site are collapsed to
one report per 60 seconds (`WEB_BLOCK_DEDUPE_MS`), and nothing is reported at
all if the install has no organization code stored.

Full detail is in [`docs/privacy.md`](docs/privacy.md) and
[`docs/adr/0004-report-web-blocks-for-audit.md`](docs/adr/0004-report-web-blocks-for-audit.md).

## Supported file formats

Email subject and body are always scanned. Attachments are scanned server-side by
the detection engine; the extension also runs a local pass so a backend outage
does not leave a send unchecked.

| Attachment | Server | Extension fallback |
|---|---|---|
| Plain text: `.txt`, `.csv`, `.tsv`, `.log`, `.json`, `.md` | yes | yes |
| PDF: `.pdf` | yes, text layer plus OCR for scanned pages | text layer only |
| Word: `.docx` (body, tables, headers, footers, text boxes, embedded images) | yes | no |
| Excel: `.xlsx`, `.xlsm`, `.xls` | yes | no |
| PowerPoint: `.pptx` (slides and speaker notes) | yes | no |
| Rich text: `.rtf` | yes | no |
| Email: `.eml`, recursively, including its own attachments | yes | no |
| Archives: `.zip`, with depth, member and size caps | yes | no |
| Images: `.png`, `.jpg`, `.tiff` and similar | yes, via OCR | no |

Files are classified by content signature, so renaming one does not skip the
scan. Attachments larger than 25 MB are skipped. CSV and spreadsheet rows are
rendered with each value carrying its column header, so a `UHID` header still
reaches the value forty rows below it.

## Enforcement scope, honestly

The extension is a strong deterrent against accidental leaks, not a compliance
guarantee. Mobile Gmail, a second browser and a disabled extension all route
around it. Chrome blocks content scripts on `chrome://` pages, the Chrome Web
Store and other extensions' pages, so the web input guard cannot run there
either. A hard guarantee needs Workspace admin force-install plus server-side
Gmail content compliance rules or the Gmail API; that is deliberately out of
scope today.

## License

MIT. See [`LICENSE`](LICENSE).
