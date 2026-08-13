# Auro Healthcare DLP Product Requirements

## Product definition

Auro is a healthcare-focused browser Data Loss Prevention product. It has two enforcement
paths:

1. A local browser guard prevents supported patient identifiers from entering ordinary web
   text fields, including browser-based AI chat products.
2. An enrolled Gmail extension sends the complete draft and supported attachments to the Auro
   service for organization-aware detection, recipient policy, quarantine, and audit.

The first path is local and immediate. The second path is authoritative and centrally managed.
An organization code identifies the tenant but is not a credential; every server request from
the extension requires a separately revocable installation token.

## Problem

Hospital staff routinely move patient information through email and browser tools. A mistaken
recipient or a pasted patient record can expose PHI/PII before a compliance team can intervene.
Generic DLP products often lack Indian identifiers, clinical context, and low-friction review.

## Users

- Clinical and operational staff who compose Gmail messages or use browser tools.
- Organization owners and administrators who enroll browsers and manage policy.
- Analysts who review quarantined sends.
- Compliance and security teams who investigate masked audit evidence.

## Goals

- Stop supported patient data before insertion or submission in web text fields.
- Make Gmail authorization decisions before the native send completes.
- Detect Aadhaar, PAN, ABHA, MRN/UHID, ICD-10, and context-bound patient demographics.
- Fail closed when a required scan, extraction, object-store operation, or approval check fails.
- Keep raw web-input candidates in the browser.
- Avoid retaining raw Gmail bodies and delete queued attachment objects after processing.
- Support tenant isolation, least-privilege roles, revocable browser credentials, and auditable
  administrative actions.
- Run for long periods without expiring SaaS subscriptions by using portable PostgreSQL,
  Redis, and S3-compatible interfaces.

## Functional scope

### Universal web-input protection

The extension installs at `document_start` in HTTP(S) frames. It inspects supported editable
controls during paste, `beforeinput`, drop, input, Enter, form submission, and common SPA send
button activation. Unsafe insertion is prevented; unsafe content introduced by autofill or a
page script is cleared when an input event is observed. Notices contain entity categories only.

Content above the bounded local inspection limit is blocked because it cannot be inspected
safely. Password fields are intentionally excluded.

### Gmail enforcement

The Gmail content script captures subject, body, sender, normalized recipients, and attachment
files or attachment references. The backend returns `allow`, `warn`, `block`, `quarantine`, or
`escalate`. The extension never converts a degraded result into authorization.

Unsupported, unreadable, oversized, queued beyond the polling deadline, or failed attachments
prevent final send authorization.

### Recipient policy

Each tenant can classify domains or individual addresses as internal, approved partner, or
blocked. High-risk PHI sent to an unapproved external recipient is quarantined. Approved
quarantine releases are short-lived, single-use, and bound to a digest of sender, subject, body,
recipients, and attachment manifest.

### Administration

The dashboard provides signup/login, organization settings, members and roles, domain policy,
extension enrollment/revocation, analytics, quarantine review, and hash-chained audit browsing.
Extension tokens are revealed once and stored only as hashes by the service.

### Attachment processing

Small supported documents scan inline. Images and configured large files enter a durable
PostgreSQL job queue and private S3-compatible object storage. Workers claim jobs with database
leases. Scanning and deletion are separate retryable phases; a scan is not terminal until raw
object cleanup succeeds. Bucket lifecycle expiration is the independent safety net.

## Detection behavior

Detection uses deterministic recognizers and validators before optional NLP/OCR enrichment.
Context is required for ambiguous values such as unformatted ABHA numbers, MRNs, patient names,
phone numbers, and dates of birth. ICD-10 candidates must exist in the configured dictionary.
Risk scores use a bounded 0–100 scale with severity thresholds at 25, 50, and 75.

## Data protection

- Universal web-input inspection does not call the backend.
- Normal message content is processed in memory and is not stored as raw body text.
- Persisted entity evidence is masked and excludes raw matched values.
- Attachment objects are private, tenant-prefixed, and short-lived.
- Access and refresh credentials are not stored in browser-readable dashboard storage.
- Browser installation tokens are opaque, independently revocable, and hashed at rest.
- Audit rows are append-only and hash chained; database triggers reject update and delete.

## Product limitations

A Chrome extension cannot execute on browser-internal pages, the Chrome Web Store, or other
schemes where Chrome forbids content scripts. Pages can also use unconventional controls or
programmatic submission without observable input, form, keyboard, or labeled-button events.
These limitations mean no browser extension can truthfully promise zero false negatives across
every website. Auro's release target is zero known critical/high defects and zero failing release
gates, backed by a continuously expanded adversarial corpus.

Default OCR is optional. Production image/scanned-document enforcement requires a selected OCR
runtime and language packs. Handwriting accuracy is not a v1 guarantee.

## Release acceptance

- All Python and TypeScript strict type checks, lint, tests, and production builds pass.
- Golden detection corpus passes, including contextual negatives.
- Clean Alembic migration succeeds against PostgreSQL.
- Live PostgreSQL/MinIO tests prove durable handoff, object deletion, token replay response,
  tenant isolation, and extension revocation.
- Real-browser dashboard journeys pass at desktop and mobile viewports.
- Production configuration rejects insecure defaults.
- CI actions and service images are immutable, and the API image runs as a non-root user.

## Out of scope for this release

- Mobile Gmail applications and native desktop clients.
- Browser-internal pages and non-HTTP(S) applications.
- A general-purpose endpoint agent outside Chrome.
- Guaranteed handwriting recognition.
- Automatic delivery to production before the owner supplies infrastructure and policy inputs.
