# Auro Healthcare DLP Production V1 SRS

## 1. Purpose

Auro Healthcare DLP production v1 stops healthcare identifiers leaving the
browser on two separate paths.

The Gmail path scans message content and attachments before the message leaves
the sender. Its primary scan is server-side through the Python detection engine,
imported in-process by the FastAPI backend. The extension keeps a lightweight
local fallback for backend outages and timeout cases.

The web-input path runs on every other HTTP and HTTPS page. It blocks patient
data being pasted or typed into any editable field, decides locally and
synchronously from the offline rule pack, and reports each block to the backend
for audit.

## 2. Scope

In scope:

- Gmail compose send interception in the Chrome extension.
- Universal web-input interception in the Chrome extension, on every HTTP and
  HTTPS page except `mail.google.com`.
- Org-code authenticated scan APIs under `/api/v1/scan`.
- Org-code or device-token authenticated event ingest at `POST /api/v1/events`,
  carrying a `channel` of `email` or `web`.
- Server-side policy decisions using approved, blocked, and external recipient
  classifications.
- Quarantine review and extension polling.
- Append-only audit events with a hash chain.
- Dashboard views for analytics, quarantine, audit, domains, members, and org
  settings.
- Login-specific rate limiting.

Out of scope for v1:

- SSE/WebSocket quarantine updates. The extension polls.
- Client-side DOCX/XLSX parsing. Those files are sent to the backend.
- Storing raw message bodies after normal scans.
- Server-side scanning of web-input text. The web-input path never sends the
  candidate text anywhere.
- Recipient, quarantine or escalation handling on the web-input path. Its only
  outcomes are allow and block.

## 3. Actors

- Extension user: Gmail sender using an org code as the scan credential.
- Owner/admin: manages organization settings, members, org code, and domains.
- Analyst: reviews quarantine items and approves or rejects sends.
- Viewer: can access read-only dashboard views where permitted by existing auth.

## 4. Functional Requirements

### 4.1 Scan APIs

The backend shall expose org-code authenticated scan endpoints:

- `POST /api/v1/scan/email`
  - Request: `{ org_code, client_scan_id, subject, body, recipients[], user_email? }`
  - Response: `Verdict`
- `POST /api/v1/scan/attachment`
  - Multipart fields: `org_code`, `client_scan_id`, `attachment_id`, `file`
  - Response: `{ attachment_scan_id, status, verdict?, error? }`
- `GET /api/v1/scan/attachment/{attachment_scan_id}?org_code=...`
  - Response: same attachment scan status/result shape.
- `POST /api/v1/scan/finalize`
  - Request: `{ org_code, client_scan_id, subject, body, recipients[], user_email?, attachment_scan_ids[] }`
  - Response: final `Verdict`

The verdict shape is shared with the extension:

```json
{
  "scan_id": "uuid",
  "action": "allow|warn|block|quarantine|escalate",
  "severity": "none|low|medium|high|critical",
  "risk_score": 0,
  "matched_policy_ids": [],
  "entities": [],
  "recipients": [],
  "user_message": "",
  "created_at": "iso timestamp",
  "quarantine_id": "optional uuid",
  "degraded": false
}
```

`quarantine_id` and `degraded` are optional additive fields used by the v1
extension UI.

### 4.2 Detection

The backend shall call `detect_email()` from `blade_detection` for subject,
body, and scannable attachments. Normal attachment scans write bytes to private
temporary storage only for the duration of extraction and delete the file after
the scan attempt completes.

Large files above `SCAN_DEEP_SCAN_THRESHOLD_BYTES` and image attachments shall
be stored in private queued-scan storage and marked `queued`. A Celery task
(`aurodlpv2.scan.process_attachment`) processes queued rows through Redis-backed
workers, writes masked summaries to the database, and deletes the queued raw
file when processing finishes. If Redis/workers are unavailable, the row remains
queued and clients may continue without that attachment result after timeout.

### 4.3 Policy

Policy decisions are made server-side for backend scans:

- Blocked recipient domains always block.
- PHI to internal or approved partner recipients is allowed and audited.
- High-risk PHI, critical severity, or risk score >= 80 to unapproved external
  or public-email recipients is quarantined.
- Medium-risk external PHI produces a warning.
- No detected sensitive data is allowed.

The extension only owns final policy decisions when backend scanning fails and
the local fallback is used.

### 4.4 Quarantine

Quarantine items shall store scan id, org id, sender, subject, recipients,
masked entities, matched policies, risk, severity, status, analyst decision,
timestamps, and attachment references. The dashboard shall support list, detail,
approve, and reject for owner/admin/analyst roles. Extension users shall poll:

- `GET /api/v1/quarantine/{quarantine_id}/status?org_code=...`

Approved quarantines enable "Send now" in the existing compose without
re-scanning. Rejected quarantines keep the send blocked.

### 4.5 Audit

The backend shall write append-only audit rows for scan verdicts, quarantine
creation, quarantine approval/rejection, login rate-limit lockouts, and org-code
regeneration. Each row includes org id, actor, category, action, metadata,
previous hash, event hash, and timestamp. Database triggers reject UPDATE and
DELETE on `audit_events`.

The dashboard shall expose a searchable recent audit view with event and
previous hashes visible.

### 4.6 Auth And Rate Limiting

Email/password login shall be rate-limited by IP plus email:

- 5 attempts per minute.
- 20 attempts per hour.

Redis counters are used when Redis is reachable. Local development falls back
to in-memory windows. Lockouts return HTTP 429 with `Retry-After`.

Refresh tokens rotate on use. The rotated token stays usable for
`refresh_rotation_grace_seconds` so two concurrent refresh calls do not fight;
a replay after that grace window revokes the whole token family.

`POST /api/v1/events` is rate limited separately by
`scan_rate_limit_per_device_per_minute` (60) and
`scan_rate_limit_per_org_per_minute` (600), in a fixed 60-second window. The
counters are per API process and are not shared across replicas.

### 4.7 Extension Behavior

On Gmail send, the extension shall collect subject, body, recipients, sender,
and captured files. It uploads attachments, polls queued attachment scans for a
fixed timeout, calls `/scan/finalize`, and renders the verdict:

- `allow`: send immediately.
- `warn`: show review UI with "Send anyway".
- `block`: keep send blocked.
- `quarantine`: poll approval status and enable "Send now" only after approval.

If the backend fails or times out, the extension shall use the local fallback
scanner and mark the verdict as degraded. The fallback validates Aadhaar with
Verhoeff checksum, validates PAN structure and common fake samples, and assigns
entity-specific confidence scores.

### 4.8 Universal Web Input Protection

A second content script shall be registered for `http://*/*` and `https://*/*`,
with `exclude_matches` of `https://mail.google.com/*`, `run_at: document_start`,
`all_frames: true` and `match_about_blank: true`. It runs in the isolated world.

The guard shall decide locally and synchronously against the rule pack bundled
into the content script. No network call, and no `chrome.*` call, occurs in the
decision path.

It shall listen in the capture phase and block on:

- `paste`
- `beforeinput`, for insertion input types, one check per inserted keystroke
- `drop`
- `input`, as an autofill backstop; the text has already landed, so the field is
  cleared
- `keydown` on Enter
- `submit`, checking every editable in the form
- `click` on a control whose accessible name matches send, submit, ask, generate,
  run or continue

A blocked event is stopped with `preventDefault()` and
`stopImmediatePropagation()`.

Eligible fields are text-like `input` elements, `textarea` elements, and elements
that are `contenteditable` or carry `role="textbox"`. Password inputs shall never
be inspected. Disabled, read-only and `aria-disabled` controls are skipped.

Detected identifiers shall be classed as standalone or contextual:

- Standalone (17): `IN_AADHAAR`, `IN_PAN`, `IN_PASSPORT`, `IN_DRIVING_LICENSE`,
  `IN_VOTER_ID`, `ABHA_NUMBER`, `ABHA_ADDRESS`, `MRN`, `PATIENT_VISIT_ID`,
  `LAB_ACCESSION`, `ICD10`, `MEDICAL_LICENSE`, `INSURANCE_POLICY`,
  `BANK_ACCOUNT`, `IN_IFSC`, `IN_UPI`, `IN_GSTIN`. Any one of these blocks on its
  own.
- Contextual (4): `EMAIL_ADDRESS`, `IN_PHONE`, `PERSON`, `DATE_OF_BIRTH`. These
  count only when a standalone identifier is present in the same inspected text,
  or the text matches the clinical keyword pattern `PATIENT_CONTEXT`.

The split is a requirement, not a tuning detail: blocking a bare email address
made ordinary login and signup forms unusable.

Text longer than 500,000 characters shall not be inspected and shall be blocked,
so the guard fails closed rather than passing an unchecked paste.

The block notice shall render in a closed shadow root, shall name only the entity
types detected, shall never echo the matched value, and shall dismiss itself after
6 seconds.

### 4.9 Web Block Reporting

A block, and only a block, shall be reported for audit. An allow reports nothing.

A content script on an arbitrary site cannot post to the backend, because the
request carries that site's origin and CORS refuses it. The content script shall
therefore send a `WEB_BLOCK` runtime message and the MV3 service worker shall make
the request, since it runs in the extension context where the `host_permissions`
entry for the backend origin applies.

The service worker shall `POST /api/v1/events` with `channel: "web"`,
`site_host` set to `location.hostname`, `action: "block"`, the entity types,
confidences and masked values, the risk score, the severity, the organization
code, the last observed sender address or `null`, and a fresh `client_event_id`.
The request has a 5-second abort timeout. A failure to report shall never turn a
block into an allow.

The worker shall drop a repeat of the same
`site_host | reason | sorted entity types` key inside 60 seconds, and shall send
nothing at all if the install has no organization code stored.

The backend shall accept `channel` (`email` or `web`, default `email`) and
`site_host` (max 253 characters, rejected if it contains `/`, `@` or whitespace).
A `web` event without `site_host` is a 422; an `email` event with one is a 422.
Both columns are added to `scan_events` by migration `20260829_0006`, with a
check constraint and an `(org_id, channel, event_time)` index. Every accepted
event writes one audit row with `category="scan"` whose metadata carries
`channel`, `site_host`, `client_event_id`, `entity_count`, `entity_types`,
`risk_score` and `severity`. Masked values are not written to audit metadata.

Ingest is idempotent on `(org_id, client_event_id)` and returns
`{"status": "duplicate"}` with HTTP 202 for a replay.

### 4.10 Channel Analytics

`GET /api/v1/events/analytics` shall return `by_channel`, an object with the
integer keys `email` and `web`, and `top_sites`, the ten hostnames with the most
web events in the window, ranked by descending count.

The dashboard overview shall show a "Where" column on recent events reading
`Gmail` for the email channel and the hostname for the web channel, a "Where data
was blocked" card ranking sites, and an email/web split under the
messages-scanned tile.

## 5. Data Protection Requirements

- Web-input candidate text must never leave the browser. It must not be
  transmitted, written to extension storage, or echoed in the block notice.
- A web block report must carry only entity types, confidences, masked values,
  risk, severity, hostname, organization code, sender address and event id.
  Never the page URL, the page title, the field name or the surrounding DOM.
- Raw email bodies must not be persisted for normal scans.
- Normal attachment files must be deleted after synchronous scan completion.
- Queued attachment files may be stored privately until the worker completes.
- Persisted scan data must use masked entity summaries, verdict metadata,
  hashes, timings, and recipient context.
- Org code remains the v1 extension scan credential and can be regenerated by
  organization owners.

## 6. CI Requirements

CI shall run on pull requests and pushes to both `main` and `master`.

Backend checks:

- Ruff
- Pyright
- Pytest
- pip-audit

Backend integration tests run against a real Postgres service container.

Detection checks:

- Ruff
- Pyright
- Pytest
- The accuracy ratchet against `detection/tests/accuracy_baseline.json`
- pip-audit

Frontend checks:

- Typecheck
- Lint
- Tests
- Build
- `pnpm audit`

The three deployment images (api, worker, dashboard) are also built in CI and
started, so a Dockerfile that builds but produces an image that cannot boot fails
the pipeline.
