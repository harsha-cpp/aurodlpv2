# Production hardening plan

Written 28 Aug 2026, after a full review of the codebase. The other files in
this directory are the *original build* plans and use a different, older phase
numbering; they describe building the product. This one describes getting the
built product to a state a hospital can buy.

Findings are referenced by the IDs used in the review (A = detection accuracy,
B = tenancy/auth, C = enforcement integrity, D = operations).

## Why this exists

The review measured detection accuracy rather than assuming it, and found:

| | Before | Now |
|---|---|---|
| Entity precision / recall / F1 | 0.608 / 0.291 / 0.393 | 1.0000 / 0.9657 / 0.9826 |
| Document precision / recall / F1 | 0.796 / 0.513 / 0.624 | 1.0000 / 0.9873 / 0.9936 |
| Clean mail falsely flagged | 25% | 0% |
| Entity types | 5 | 21 |

The "Now" column is `detection/tests/accuracy_baseline.json`, recorded
2026-08-28. `make accuracy` reprints it.

Three root causes, none of them "the regexes need tuning":

- The spaCy model the engine was built around was **never installed** - not in
  any dependency list, CI step or image - so name detection silently degraded
  to a blank tokenizer. Even installed, the analyzer discarded its results.
- Risk came out on a `log1p` scale of roughly 0-7 while the policy consuming it
  tested for `>= 80`. Those branches were unreachable.
- Gmail's "Schedule send" was an explicitly coded bypass, and the extension
  failed open whenever it had no cached config.

## Phases

### Phase 0 - Make accuracy measurable *(done)*

Nothing downstream is verifiable without this. A labelled corpus of 119
documents / 175 entity spans across `clinical`, `administrative`, `identifiers`,
`negative` (ordinary hospital business mail that must stay clean) and
`adversarial` (deliberate false-positive traps). Per-entity and document-level
precision/recall, a false-alarm rate on clean mail, and a committed baseline
that CI ratchets. `make accuracy`. - *D5*

### Phase 1 - Rebuild the detection engine *(done)*

spaCy genuinely installed and wired, with a hard failure instead of a silent
fallback. Presidio's pattern layer replaced by a declarative rule pack (its PAN
recognizer was matching the string `-7236-8829`). Context gating, so a
fourteen-digit vendor invoice is not a health ID and `E11 series patient
monitors` is not a diagnosis. Overlap resolution, so the twelve digits inside an
ABHA number stop being reported as a separate Aadhaar. Deduplication by value.
Risk rescaled to a real 0-100. One rule pack exported to the extension behind a
drift guard, ending the two-detectors-that-disagree problem.
- *A1-A9, A12*

### Phase 2 - Attachments and OCR *(done)*

300 DPI rendering and preprocessing (was 72 DPI, which is why scanned
prescriptions returned nothing). PaddleOCR cached per language and called with
the API the pinned version actually has. Indic routing decided from
configuration rather than from Tesseract's English-only output. DOCX headers,
footers, text boxes and embedded images; XLSX and legacy XLS; CSV, PPTX, RTF,
EML and ZIP. Header-paired tabular rendering so a column label reaches the value
forty rows below it. Magic-byte sniffing, so renaming a spreadsheet does not
skip the scan. Blob storage so the API and worker need no shared filesystem, and
detection moved off the event loop. - *A10, A11, D2, D3*

### Phase 3 - Identity, tenancy and access *(done)*

Per-device enrolment replacing the single org code shared by every user in a
hospital. Password reset, email verification, TOTP MFA, a real password policy,
and mail that actually sends. Refresh-token rotation with reuse detection and a
session list. Org switching without re-entering a password. Rate limiting keyed
on credential rather than IP - a hospital is one NAT address. A per-org advisory
lock so the audit hash chain cannot fork. Google SSO deliberately deferred.
- *B1-B9*

### Phase 4 - Policy engine *(done)*

Rules as data, stored per organisation, first-match-wins, editable and
simulatable. **Sender classification**, so the leak the product exists to stop -
staff mailing patient data from personal accounts - is finally enforced;
`approved_domains` had carried a `sender` direction that nothing ever read.
- *C3*

### Phase 5 - Harden the extension *(done)*

Schedule-send interception closed at both the menu and dialog stages. Fails
closed, with `fail_open` as a deliberate per-org opt-in. One build-time backend
URL. Timeouts on every request plus a progress strip and a cancel. Per-compose
attachment tracking. `DOMParser` instead of `innerHTML`. Sender identity
reported as absent rather than invented. - *C1, C2, C4, C5, C7, C8, C9*

### Phase 6 - Dashboard *(done)*

Grew from 24 files to 60, with 132 tests where there were none. Risk shown on
the 0-100 scale throughout; the 21 entity types given readable labels; an
unattributable sender rendered as "Unattributed" rather than blank. New
surfaces for the policy editor - including a simulator that runs saved and
edited-but-unsaved rules side by side, because a wrong rule either blocks a
ward's mail or lets patient data out - and for device management. Password
reset, email verification, MFA enrolment and session management screens, which
the backend was already mailing links to. RBAC-aware navigation and error
boundaries.

Four backend gaps it surfaced were closed rather than worked around in the
browser: `GET /quarantine` now accepts `status=all`; the member roster reports
`email_verified` and `mfa_enabled`; `POST /auth/login` documents both its
response branches so a generated client can see the MFA challenge; and the
audit endpoint filters and pages server-side with a keyset cursor, plus a
`/audit/chain` endpoint that verifies the whole log rather than whichever page
the browser happened to load.

### Phase 7 - Ship *(done)*

Dockerfiles for api/worker/dashboard, a production compose with MinIO and a
one-shot migrate service, `backend/.env.example`, `docs/deployment.md`, and an
image-build CI job. Integration tests run against a real Postgres in CI.
- *D1, D4, D6*

Verified rather than assumed: all three images were built, the full production
stack was brought up, and an end-to-end scan through it returned
`quarantine` / `critical` / `95.55` with values masked, while PHI sent from a
personal account returned `block` / `unapproved-sender-with-phi`. That exercise
found four bugs no amount of reading would have:

- `CORS_ORIGINS` accepted only JSON, and the shipped compose passes a bare
  string - **the stack would not boot**. pydantic-settings JSON-decodes complex
  fields inside the settings source, before any `field_validator` runs, so the
  comma-splitting validator was dead code.
- `pytesseract` sat in the optional `ocr` extra, so OCR returned `""` and a
  scanned discharge summary passed the scan clean. It is a plain dependency
  now, and the engine raises `OcrUnavailableError` so a broken OCR install is a
  visible extraction error instead of silence.
- `infra/api.env` was not gitignored, and the deployment guide tells operators
  to create it and fill it with secrets.
- `.env.*` silently swallowed `infra/.env.prod.example`, so the template the
  guide says to copy never reached a clone.

### Phase 8 - Universal web input protection *(done, 29 Aug 2026)*

Part two of the product, built on the Phase 1 rule pack rather than as a third
independent detector.

A second content script registered for `http://*/*` and `https://*/*`, excluding
`mail.google.com`, at `document_start`, in all frames, with
`match_about_blank`. It blocks paste, keystroke (`beforeinput`), drop, autofill
(`input`, as a backstop that clears the field), Enter, form submit and
send-button clicks. Password fields are never inspected. The decision is local
and synchronous against the bundled rule pack; there is no network call and no
`chrome.*` call in the keystroke path, and text over 500,000 characters is
blocked rather than passed unchecked.

Identifiers are split into 17 standalone types that block on their own and 4
contextual types (email address, phone, person name, date of birth) that count
only alongside a standalone identifier or clinical keywords. That split is not
tuning: an earlier build blocked a bare email address, which broke ordinary login
and signup forms.

Blocks are reported for audit, reversing the original "send nothing" design. The
content script cannot POST cross-origin from an arbitrary site, so the block is
relayed through the MV3 service worker, which gets the CORS bypass for hosts in
`host_permissions`. It posts to `POST /api/v1/events` with `channel: "web"` and
`site_host`, deduped to one report per finding per site per 60 seconds, and sends
nothing at all if the install is not linked to an organization. The backend stores
`channel` and `site_host` on `scan_events` (migration `20260829_0006`) and writes
one append-only audit row per event. Only masked values and entity types are
transmitted; the raw text never leaves the browser. The reasoning is recorded in
[`../adr/0004-report-web-blocks-for-audit.md`](../adr/0004-report-web-blocks-for-audit.md).

The dashboard gained a "Where" column on recent events, a "Where data was blocked"
card, and an email/web split on the messages-scanned tile, fed by new `by_channel`
and `top_sites` fields on `GET /api/v1/events/analytics`.

## Deliberately out of scope

- **Google Workspace SSO.** Deferred by decision; password/invite/MFA gaps were
  closed on the existing model instead.
- **Server-side Gmail enforcement.** By decision, the extension is the only
  enforcement point. It is a strong deterrent against accidental leaks, not a
  guarantee: mobile Gmail, a second browser and a disabled extension all route
  around it. If a customer needs a compliance guarantee rather than a deterrent,
  that needs Workspace admin force-install plus Gmail content compliance rules
  or the Gmail API.
- **Server-side scanning of web-input text.** The universal guard decides in the
  page and never sends the candidate text. See
  [`../adr/0002-two-enforcement-paths.md`](../adr/0002-two-enforcement-paths.md).

## Known gaps after these phases

- Org code still works alongside device tokens during the migration window. It
  cannot be retired until every install is enrolled.
- Data retention and purge jobs for PHI held in quarantine and audit.
- DPDP / HIPAA posture documentation, threat model, penetration test.
- SIEM export, scheduled reports, SCIM provisioning.
- No end-to-end test drives a real Gmail session; the extension's send-path
  interception is unit-tested against synthetic DOM only. The same is true of the
  web-input guard: `input-protection.test.ts` drives a synthetic DOM, not a real
  ChatGPT or Gemini page.
- The web-block dedupe map lives in the service worker's memory, so a worker
  restart can let a second copy of the same finding through.
- The Chrome Web Store listing still describes the original design, in which the
  web-input guard transmitted nothing. It must be updated before the next
  submission; see [`../privacy.md`](../privacy.md).
- `observability/metrics.py` declares five Prometheus collectors that nothing
  increments, and no `/metrics` endpoint is mounted. The `jaeger` container in the
  dev stack has no exporter pointed at it. Observability is structured logs only.
