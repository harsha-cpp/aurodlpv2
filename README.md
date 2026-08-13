# Auro Healthcare DLP

Healthcare data-loss prevention for **Gmail**, **web apps**, and **browser-based AI tools**.

- **Chrome extension** — blocks Indian healthcare PHI/PII before it leaves the browser (Gmail send, paste, typing, drag-drop, Enter, form submit, common SPA send buttons).
- **FastAPI backend** — multi-tenant auth, scan decisions, quarantine, audit trail, attachment pipeline.
- **Admin dashboard** — org setup, members, domains, quarantine review, extension enrollment.
- **`detection/`** — standalone Python PHI/PII engine (recognizers, document extractors, optional OCR).

> **Demo scope:** this README gets you running locally in ~10 minutes. It is not a production deployment guide. See [`requirements/`](requirements/) and [`docs/`](docs/) for launch decisions.

---

## What you'll see in the demo

| Scenario | Where | Expected |
| -------- | ----- | -------- |
| Unsafe patient data in a text box | Any website (ChatGPT, Google, etc.) | Blocked locally — text cleared, category notice shown |
| Safe de-identified text | Same | Allowed |
| Password field | Any site | **Not** scanned (intentionally) |
| Unsafe Gmail compose | mail.google.com | Blocked or quarantined via backend |
| Safe Gmail compose | mail.google.com | Send proceeds |

---

## Prerequisites

Install these before you start:

| Tool | Version | Check |
| ---- | ------- | ----- |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | running | `docker info` |
| [uv](https://docs.astral.sh/uv/) | latest | `uv --version` |
| [Node.js](https://nodejs.org/) | ≥ 20.18 | `node --version` |
| [pnpm](https://pnpm.io/) | 11.20.x | `pnpm --version` |
| Google Chrome | ≥ 120 | for the extension |

---

## Demo setup (one time)

```bash
git clone https://github.com/harsha-cpp/aurodlpv2.git
cd aurodlpv2

make install
cp backend/.env.example backend/.env
cp frontend/packages/dashboard/.env.example frontend/packages/dashboard/.env
```

Edit `frontend/packages/dashboard/.env`:

```env
VITE_API_BASE_URL=http://localhost:8000
```

The extension defaults to `http://localhost:8000` — no extension `.env` needed for local demo.

Start local Postgres, Redis, and MinIO, then migrate:

```bash
make dev-up
make migrate
```

If `make migrate` fails with `Can't locate revision identified by '20260520_1000'`, your old local DB volume is stale. Reset it:

```bash
make dev-down
rm -rf infra/data/postgres
make dev-up
make migrate
```

Build the extension once:

```bash
cd frontend && pnpm build --filter @aurodlpv2/extension
```

---

## Run the demo (4 terminals)

Open four terminal tabs in the repo root:

```bash
# Terminal 1 — API
make backend-dev          # http://localhost:8000

# Terminal 2 — attachment worker (needed for Gmail attachments)
make worker-dev

# Terminal 3 — admin dashboard
make dashboard-dev        # http://localhost:5173

# Terminal 4 — extension rebuilds on change (optional but handy)
make extension-dev
```

Sanity check:

```bash
curl http://localhost:8000/healthz   # → {"status":"ok"}
```

Open http://localhost:5173 — the dashboard should load.

---

## Load the extension in Chrome

1. Open **`chrome://extensions`**
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select this folder:

   ```
   aurodlpv2/frontend/packages/extension/dist
   ```

5. Pin the **AURO** icon in the toolbar
6. Click the icon — popup should show **v0.3.0**

After loading, copy your **Extension ID** from `chrome://extensions` and add it to `backend/.env`:

```env
CORS_ORIGINS=http://localhost:5173,chrome-extension://YOUR_EXTENSION_ID_HERE
```

Restart `make backend-dev` if you change CORS.

> **Important:** `CORS_ORIGINS` must be comma-separated URLs — not JSON.  
> ✅ `http://localhost:5173,chrome-extension://abc123`  
> ❌ `["http://localhost:5173"]`

---

## Enroll the extension (needed for Gmail)

### 1. Create an organization

1. Open http://localhost:5173/signup
2. Fill in org name, email, password → **Create account**
3. On onboarding, copy your **org code** (also visible later under **Settings**)

### 2. Create an extension token

1. Go to **Settings → Extension enrollment**
2. Enter a label (e.g. `my-laptop`) → **Create token**
3. Copy the token immediately — it is shown **once**

### 3. Save enrollment in the extension

1. Click the AURO toolbar icon
2. Paste **org code** and **enrollment token**
3. Click **Save** — org name should appear after policy refresh

---

## Try the demo

### A. Web / AI input guard (works without backend enrollment)

Open any page with a textarea or chat input. Paste these strings:

**Should block:**

```
ABHA 12-3456-7890-1234 for discharge summary
MRN HSP-2026-0012 requires review
Aadhaar 234567890124 appears in the mail
```

**Should allow:**

```
Please review the de-identified case summary for ward rounds.
```

Also try paste, drag-drop, and Enter in a chat box. Type an ABHA-like value in a **password** field — it should be left alone.

### B. Gmail DLP (needs enrollment + backend running)

1. Open https://mail.google.com
2. **Compose** a new message
3. Paste the unsafe ABHA line above → click **Send**
4. AURO should block or quarantine with a modal
5. Replace with the safe line → send should proceed

Check the dashboard:

- **Overview** — scan events
- **Quarantine** — held messages
- **Audit** — decision trail

---

## Troubleshooting

| Problem | Fix |
| ------- | --- |
| **Signup failed** / CORS error in browser console | Check `CORS_ORIGINS` in `backend/.env` is comma-separated (see above). Restart `make backend-dev`. |
| Extension does nothing after code changes | `chrome://extensions` → AURO → **Reload**. Keep `make extension-dev` running or rebuild with `pnpm build --filter @aurodlpv2/extension`. |
| Gmail send stuck / attachment never completes | Ensure `make worker-dev` is running and `make dev-up` started MinIO. |
| `make migrate` fails on old revision | Wipe `infra/data/postgres` and re-run (see setup section). |
| Dashboard can't reach API | Confirm `VITE_API_BASE_URL=http://localhost:8000` in `frontend/packages/dashboard/.env`. |
| Port 8000 already in use | Stop the other process: `lsof -ti :8000 \| xargs kill` then restart `make backend-dev`. |

---

## Repository layout

```
aurodlpv2/
├── backend/        FastAPI API + worker          (Python 3.12, uv)
├── detection/      PHI/PII detection engine      (Python 3.12, uv)
├── frontend/
│   └── packages/
│       ├── extension/   Chrome MV3 extension
│       ├── dashboard/   Admin SPA
│       └── shared/      Shared types + API client
├── docs/               PRD, SRS, architecture, ADRs, privacy
├── infra/              docker-compose (postgres, redis, minio)
├── requirements/       Production decision checklists
└── Makefile            Common dev commands
```

---

## Stack

| Layer | Choice |
| ----- | ------ |
| Extension | Chrome MV3, Vite, React 19, InboxSDK |
| Dashboard | Vite, React 19, React Router 7, TanStack, shadcn/ui |
| API | FastAPI, Pydantic v2, SQLAlchemy 2.0 async, Alembic |
| Detection | Presidio, spaCy, python-stdnum, simple_icd_10_cm, PyMuPDF |
| Database | PostgreSQL 16 |
| Object store | MinIO locally (S3-compatible in production) |
| Auth | Argon2id passwords, JWT access + httpOnly refresh cookie |

---

## Supported attachment formats (Gmail)

| Format | Status |
| ------ | ------ |
| PDF `.pdf` | Scanned (text extraction; OCR when configured) |
| Word `.docx` | Scanned |
| Excel `.xlsx` | Scanned |
| Images | Queued — requires OCR worker + configured OCR backend |

Unsupported, oversized, unreadable, or failed attachments block send (fail-closed).

---

## Further reading

- [`docs/srs.md`](docs/srs.md) — software requirements
- [`docs/privacy.md`](docs/privacy.md) — Chrome permissions and data handling
- [`docs/architecture/`](docs/architecture/) — C4 diagrams
- [`requirements/`](requirements/) — what you need before production

---

## License

MIT — see [`LICENSE`](LICENSE).
