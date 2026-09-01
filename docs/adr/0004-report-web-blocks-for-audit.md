# ADR-0004: Report web-input blocks to the backend for audit

## Status

Accepted, 2026-08-29. Supersedes the reporting half of
[ADR-0002](0002-two-enforcement-paths.md).

## Context

ADR-0002 decided that the universal web-input guard would run entirely in the
page and send nothing at all. That kept the privacy story simple, and it was the
right call for the *decision* path: a network round trip per keystroke is slow,
fails during network loss, and would carry candidate text off the machine.

Sending nothing at all turned out to be the wrong call for the *record*. A
hospital that deploys this has to answer three questions that the original design
made unanswerable:

- Did the control actually fire, or is the fleet silently misconfigured? With no
  reporting, an extension that never blocks and an extension that is broken look
  identical from the dashboard.
- Which sites are staff pasting patient data into? That is the whole point of
  buying the product, and it is the input to a training or blocking decision.
- Where is the evidence for an audit? "Nothing was recorded" is not an acceptable
  answer to a DPDP or HIPAA reviewer asking what happened on a given day.

The Gmail path already produces `scan_events` rows and audit rows. The web path
produced nothing, so the two halves of the same product could not be reported on
together.

## Decision

A web-input block is reported to the backend, and only a block is. Nothing is
sent when the guard inspects text and allows it.

What is transmitted, and nothing else:

| Field | Value |
|---|---|
| `channel` | the literal `"web"` |
| `site_host` | `location.hostname`, a bare hostname, no scheme, path or query |
| `action` | the literal `"block"` |
| `entities[].type` | the entity type, for example `IN_AADHAAR` |
| `entities[].confidence` | the detector confidence, 0 to 1 |
| `entities[].masked_value` | all characters replaced with `*` except the last four |
| `risk_score` | 0 to 100 |
| `severity` | `none`, `low`, `medium`, `high` or `critical` |
| `org_code` | the organization the install is linked to |
| `user_email` | the last Gmail sender seen by this install, or `null` |
| `client_event_id` | a fresh UUID, used for server-side deduplication |

What is never transmitted: the pasted or typed text, the page URL, the page
title, the document, the field name, the surrounding DOM, and any screenshot.

Four constraints hold the decision in place.

1. **The decision stays local and synchronous.** `inspectProtectedText` in
   `frontend/packages/extension/src/content/input-protection.ts` contains no
   `await`, no `fetch` and no `chrome.*` call. The report is fired from an
   `onBlocked` callback after `preventDefault` has already run, inside a
   `try/catch`, and a failure to report can never turn a block into an allow.
2. **The report goes through the service worker.** A content script on an
   arbitrary site issues cross-origin requests with that site's origin, and CORS
   refuses them. An MV3 service worker runs in the extension's own context, where
   the `host_permissions` entry for the backend origin applies. So the content
   script sends a `WEB_BLOCK` runtime message and
   `frontend/packages/extension/src/background/index.ts` makes the single POST,
   with a 5 second abort timeout.
3. **Repeats are collapsed.** The worker keys on
   `site_host | reason | sorted entity types` and drops a repeat inside
   `WEB_BLOCK_DEDUPE_MS = 60_000`. A user retyping the same Aadhaar number into
   the same chat box produces one row per minute, not one per keystroke. The map
   is in memory, so it resets when Chrome tears the worker down.
4. **An unlinked install reports nothing.** If `blade_org_code` is absent from
   `chrome.storage.local`, the worker returns before the fetch. There is no
   anonymous telemetry channel.

Server side: `POST /api/v1/events` accepts `channel` (`"email"` or `"web"`,
default `"email"`) and `site_host` (max 253 characters, rejected if it contains
`/`, `@` or whitespace). A web event without a `site_host` is a 422, and so is an
email event with one. Migration `20260829_0006` adds both columns to
`scan_events` with a check constraint and an
`(org_id, channel, event_time)` index. Every accepted event writes one audit row
with `category="scan"`, whose metadata carries `channel`, `site_host`,
`client_event_id`, `entity_count`, `entity_types`, `risk_score` and `severity`.
Masked values are deliberately left out of the audit metadata.

## Consequences

Positive:

- The dashboard can show a "Where data was blocked" ranking and an email/web
  split, so the control is visibly working.
- Web blocks land in the same hash-chained, trigger-protected `audit_events`
  table as everything else, so one audit export covers both paths.
- Deduplication and the org-code gate keep the volume proportionate to real
  incidents.

Negative:

- The privacy claim got more complicated. "We send nothing" was easy to explain
  and easy to verify. "We send masked findings and a hostname" needs the table
  above, and needs it in the Chrome Web Store listing before the next
  submission. `docs/privacy.md` is the source of truth.
- The last four characters of a matched value leave the browser. For a 12-digit
  Aadhaar that is four digits plus an exact length; it is not reversible on its
  own, but it is not zero either. It is retained because an analyst reviewing an
  incident needs to tell two findings apart.
- The hostname reveals which sites staff use. The design limits that to sites
  where a block actually fired, never to browsing in general.
- The dedupe window is per service-worker lifetime, so a worker restart can let a
  second copy of the same finding through.

## Alternatives rejected

- **Keep sending nothing.** Rejected: leaves the deployment unauditable and the
  control unverifiable.
- **Report allows as well as blocks.** Rejected: that is a browsing history in
  all but name, and it is what the Chrome Web Store disclosure promises not to
  build.
- **Send the candidate text so the server can re-score it.** Rejected outright.
  It would put patient data on the wire from every website, which is the exact
  failure the product exists to prevent.
- **Report from the content script directly.** Not possible without adding
  `<all_urls>` to `host_permissions` for the backend fetch, and it would still
  fail CORS from the page origin.
