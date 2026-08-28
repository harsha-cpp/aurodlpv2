# Auro Healthcare DLP Production V1 SRS

## 1. Purpose

Auro Healthcare DLP production v1 protects Gmail sends by scanning message
content and attachments for healthcare identifiers before the message leaves
the sender. The primary scan path is server-side through the Python detection
engine. The browser extension keeps a lightweight local fallback for backend
outages and timeout cases.

## 2. Scope

In scope:

- Gmail compose send interception in the Chrome extension.
- Org-code authenticated scan APIs under `/api/v1/scan`.
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

The backend shall call `detect_email()` from `aurodlpv2_detection` for subject,
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
to in-memory windows. Lockouts return HTTP 429 with `Retry-After`. Refresh token
behavior remains non-rotating during refresh to avoid concurrent refresh races.

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

## 5. Data Protection Requirements

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

Detection checks:

- Ruff
- Pyright
- Pytest
- pip-audit

Frontend checks:

- Typecheck
- Lint
- Tests
- Build
- Audit where configured
