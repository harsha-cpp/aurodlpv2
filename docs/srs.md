# Auro Healthcare DLP Software Requirements

## Scope and trust boundaries

The Chrome extension is an enforcement point, not a trusted tenant identity. `org_code` is a
routing value. Server-facing extension routes require an `AuroExtension` bearer credential
whose hash, organization, status, and expiry are verified for every request.

The dashboard is an untrusted public client. It holds its short-lived access JWT in memory and
uses a secure, httpOnly refresh cookie. Refresh and logout require `X-Auro-CSRF: 1` and refresh
tokens rotate once. Reuse of an ancestor revokes the complete token family.

## Extension requirements

### Web-input guard

- The content script shall start before page scripts in every permitted HTTP(S) frame.
- It shall support text-like inputs, textareas, contenteditable elements, and ARIA textboxes.
- It shall inspect paste, typed/replacement insertion, drop, input, Enter, form submit, and
  common labeled SPA action buttons.
- It shall block inputs larger than 500,000 characters rather than skip inspection.
- It shall exclude disabled, read-only, and password inputs.
- It shall not transmit raw candidate text or include matched values in notices.

### Gmail

- Send interception shall gather subject, body, recipients, sender, and the complete captured
  attachment set.
- The extension shall upload each attachment under one `client_scan_id`, poll queued scans, and
  finalize only with attachment IDs from the same tenant and client scan.
- A backend error or timeout shall produce a local degraded verdict that cannot authorize send.
- `allow` may resume Gmail send. `warn`, `block`, and `quarantine` shall keep native send blocked.
- Quarantine status polling shall use the enrolled extension credential.
- The API origin shall come from a validated HTTPS build value or enterprise-managed setting;
  HTTP is allowed only for localhost development.

## API requirements

All application APIs live under `/api/v1`.

### Human authentication

- `POST /auth/signup`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/me`
- `GET /auth/my-orgs`

Passwords shall use Argon2id. Login attempts shall be rate limited by IP and normalized email,
using Redis with a local-development memory fallback. Protected queries shall verify the member
still exists, is active, belongs to the token organization, and has the required role.

### Extension enrollment

- Owners/admins shall create, list, and revoke extension installations.
- Raw tokens shall be returned only at creation.
- Stored records shall contain only a one-way secret hash and non-secret token identifier.
- Revoked, expired, malformed, or cross-tenant credentials shall receive an authorization error.

### Scanning

- `POST /scan/email`
- `POST /scan/attachment`
- `GET /scan/attachment/{attachment_scan_id}`
- `POST /scan/finalize`

Request tenant code must match the authenticated extension tenant. Client-generated IDs shall be
idempotent within a tenant and become content-bound: reuse with different filename, MIME, size,
or SHA-256 shall return conflict.

Finalization shall block if a referenced scan is absent, cross-tenant, cross-client, queued,
failed, unreadable, unsupported, or has extraction errors.

### Quarantine and audit

Owners, admins, and analysts may approve or reject pending quarantine items. Approval shall be
single-decision, short-lived, single-use, and content-bound. All release validation occurs inside
a locked transaction.

Audit writes shall store masked operational metadata, previous hash, and event hash. PostgreSQL
triggers shall reject update and delete. Reads shall always be scoped to the authenticated tenant.

## Durable attachment requirements

- Inline scans shall use permission-restricted temporary files and delete them in `finally`.
- Deep-scan inputs shall be stored in a private S3-compatible bucket before the database job is
  committed.
- If database commit fails, the staged object shall be deleted as compensation.
- Workers shall claim PostgreSQL jobs with `FOR UPDATE SKIP LOCKED`.
- Jobs shall include lease owner, lease expiry, attempt count, availability time, and last error.
- Stale leases shall be recoverable.
- Worker results shall be fenced by worker ID and attempt.
- Scan and raw-object cleanup shall be independently retryable phases.
- Terminal success/failure shall not be exposed until cleanup succeeds.
- A bucket lifecycle shall expire stranded `attachments/` objects after the configured retention
  period.

## Detection requirements

- Supported structured identifiers: Aadhaar, PAN, ABHA, MRN/UHID, ICD-10.
- Supported contextual demographics: patient name, date of birth, email, and Indian phone.
- Aadhaar shall use checksum validation; PAN shall use structural validation and fake-sample
  rejection; ICD-10 shall use dictionary validation.
- Ambiguous raw identifiers shall require healthcare context.
- Results shall contain masked values, confidence, source, and optional attachment reference.
- Risk score shall be finite and bounded to 0–100.
- Detector or extractor exceptions shall fail closed at the policy boundary.

## Storage and privacy requirements

- Raw Gmail subject/body shall not be persisted.
- Raw web-input candidates shall not leave the page process.
- Logs shall not contain credentials, raw PHI, cookies, or attachment bytes.
- Production object storage shall use TLS, private access, encryption at rest, and lifecycle
  retention.
- Production cookies shall be Secure, httpOnly, and use the configured SameSite policy.
- Production settings shall reject default JWT/object-store credentials, insecure object-store
  URLs, and non-HTTPS CORS origins.

## Availability and failure behavior

- `/healthz` reports process liveness.
- `/readyz` reports database, Redis, and object-store readiness.
- Loss of the object store shall reject deep-scan uploads.
- Loss of a worker shall leave recoverable jobs in PostgreSQL.
- Loss of the API or a scan timeout shall never allow a Gmail send.
- Redis loss shall not disable local-development login throttling; production monitoring must
  alert on the degraded dependency.

## Verification requirements

CI shall use immutable action SHAs, least-privilege permissions, timeouts, concurrency
cancellation, and frozen dependency locks. It shall block on lint, strict typing, unit tests,
dependency audits, frontend production builds, clean migrations, live PostgreSQL/Redis/MinIO
security tests, Git-history secret scanning, SAST, repository and runtime-image vulnerability
scanning, CycloneDX SBOM generation, and a non-root API image check.
