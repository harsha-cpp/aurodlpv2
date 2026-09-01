# Auro privacy and Chrome permission disclosure

This is the engineering disclosure: what the code actually sends, stores and
keeps. It is not a substitute for legal review, and the owner values listed at
the end are still outstanding.

Last checked against the code on 2026-08-29.

## Data handled

### Universal web-input guard, every site except Gmail

The guard inspects text-entry candidates inside the browser. The inspected text
is never sent to Auro, never written to extension storage, and never shown in the
on-page notice. Detection runs against the offline rule pack bundled into the
content script; there is no network call in the decision path.

When the guard **blocks**, and only when it blocks, it reports the block for
audit. This reverses the original design, which reported nothing. See
[`adr/0004-report-web-blocks-for-audit.md`](adr/0004-report-web-blocks-for-audit.md)
for the reasoning.

The report is a single `POST /api/v1/events` made by the extension's service
worker, containing:

- `channel: "web"` and `site_host`, the bare hostname of the page. No scheme, no
  path, no query string, no page title.
- For each finding: the entity type (for example `IN_AADHAAR`), a confidence
  between 0 and 1, and a masked value in which every character except the last
  four is replaced with `*`.
- A risk score from 0 to 100, a severity, and the literal action `block`.
- The organization code the install is linked to, the last Gmail sender address
  this install observed (or `null`), and a fresh client event ID.

Not in the report: the pasted or typed text, the page URL, the page title, the
name or id of the field, the surrounding DOM, and any screenshot. Nothing at all
is sent when the guard inspects text and allows it, so this is not a browsing
history.

Two limits keep the volume proportionate. Repeated blocks of the same finding on
the same host are collapsed to one report per 60 seconds. An install with no
organization code stored reports nothing at all.

### Gmail send scanning

When an enrolled user attempts a Gmail send, the extension sends the draft
subject, body, recipients, sender metadata, and supported attachments to the
configured Auro API. The service uses them only to calculate a DLP decision. It
persists masked entity summaries, decision metadata, recipient context, and audit
records. It does not persist the raw message body.

Large attachments (over `SCAN_DEEP_SCAN_THRESHOLD_BYTES`, 10 MB by default) and
image attachments are stored temporarily in a private S3-compatible bucket. The
worker deletes each object after processing. The bucket also carries a 7-day
lifecycle expiry rule, applied by the `minio-init` job in
`infra/docker-compose.prod.yml`, as an independent cleanup mechanism for objects
a crashed worker left behind.

## Retention

| Data | Where it lives | Retained by Auro |
|---|---|---|
| Web-input candidate text | Page memory only | No. Never transmitted. |
| Web-block entity types | `scan_events.entities`, audit metadata | Yes |
| Web-block masked values | `scan_events.entities[].masked_value` | Yes. All but the last four characters are `*`. Not written to audit metadata. |
| Web-block site hostname | `scan_events.site_host`, audit metadata | Yes |
| Web-block risk score and severity | `scan_events`, audit metadata | Yes |
| Web-block timestamp | `scan_events.event_time`, `audit_events.created_at` | Yes |
| Gmail subject and body | Request memory only | No raw database retention |
| Inline attachment temporary file | Local temp path | Deleted after the extraction attempt |
| Queued attachment object | Private S3 bucket | Deleted after processing; 7-day lifecycle expiry as a backstop |
| Masked scan and audit metadata | `scan_events`, `audit_events` | Per the organization's production policy |
| Revoked or expired credential metadata | `device_tokens`, `refresh_tokens` | Per security audit policy |

`audit_events` is append-only: database triggers reject `UPDATE` and `DELETE`,
and each row is hashed over the one before it. There is no purge job yet. An
operator who needs a retention period shorter than "forever" has to implement it;
see the known gaps in [`plans/hardening.md`](plans/hardening.md).

## Credentials

The extension stores an organization routing code in `chrome.storage.local` under
`blade_org_code`, the cached organization config under `blade_config`, and the
last observed Gmail sender address under `blade_last_user_email`. Websites
cannot read extension storage.

The backend supports revocable per-device installation tokens, and the dashboard
can issue them. The extension does not send one today: the organization code is
still the credential on both the Gmail and the web path. The raw device token is
shown only when an administrator creates it; the backend stores only its digest.

The dashboard keeps its access token in memory. Its refresh token is an httpOnly
cookie, rotated on use with a short grace window and reuse detection, and is not
readable by dashboard JavaScript. The only thing the dashboard writes to
`localStorage` is the light/dark theme preference.

## Chrome permissions

`storage` holds the extension enrolment and the cached organization policy.
`alarms` refreshes that policy every five minutes while respecting Manifest V3
service-worker suspension.

`host_permissions` lists exactly two origins: `https://mail.google.com/*` and the
backend origin, which is fixed at build time.

All-site HTTP(S) **content-script** access is declared separately, as
`matches: ["http://*/*", "https://*/*"]` with `exclude_matches:
["https://mail.google.com/*"]`, `run_at: "document_start"`, `all_frames: true`
and `match_about_blank: true`. It is required because the feature must protect
text entry across browser-based AI tools and other websites, including embedded
frames. The extension uses that access to observe editable controls and prevent
patient-data insertion. It does not sell browsing data, build browsing histories,
inject advertising, or send ordinary web-input content to Auro.

The separate Gmail content script uses page access to intercept drafts before
native send, and collects the draft only after the user initiates sending.

## Chrome Web Store disclosure

**The store listing must be updated before the next submission.** The current
listing was written against the original design, in which the web-input guard
transmitted nothing. That is no longer accurate.

The disclosure needs to state that a block on a non-Gmail site sends masked
findings and the site hostname to the organization's own Auro backend, that
allows send nothing, and that the raw typed or pasted text never leaves the
browser. Under the store's data-use questions this means declaring collection of
"website content" in the narrow, masked form described above, and re-confirming
that the data is not sold, not used for creditworthiness or lending, and not
used for purposes unrelated to the item's single purpose.

## Owner values required before publication

The owner must provide a legal entity name, a privacy contact, a public
privacy-policy URL, a support URL, a jurisdiction-specific retention period, a
deletion-request process, and the final hosting vendors.
