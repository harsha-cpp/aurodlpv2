# ADR-0002: Two browser enforcement paths

## Status

Accepted, 2026-08-08.

Superseded in part by
[ADR-0004](0004-report-web-blocks-for-audit.md), 2026-08-29. ADR-0004 reverses
the reporting half of the decision below: the local guard still transmits no
candidate text, but it now transmits block metadata. The rest of this record
stands as written.

## Context

The original product focused on Gmail. The expanded requirement prevents patient
data from being pasted into browser-based AI chats and other text boxes. A round
trip for every keystroke or paste would expose candidate data, add latency, and
fail during network loss. Gmail still needs tenant recipient policy, attachments,
quarantine, and audit that cannot be decided locally.

## Decision

Use a local, pre-insertion guard for ordinary HTTP(S) web inputs and retain a
server-authoritative Gmail send flow. The local guard transmits no candidate
text. Gmail uses a revocable extension principal and fails closed when the
backend is unavailable.

## Consequences

Positive:

- Immediate protection in AI chats without sending raw patient data elsewhere.
- Offline web-input protection remains active.
- Gmail retains organization policy and durable review.

Negative:

- Local and Python recognizers require deliberately synchronized golden cases.
- Chrome-restricted pages and unconventional controls remain outside guaranteed
  coverage.
- All-site permissions require strong disclosure and review.

## Follow-up

Track minimized false-positive and false-negative cases in both detector suites,
and publish an explicit Chrome Web Store privacy explanation for all-site access.

## What "transmits no candidate text" means today

The phrase was written to mean two things at once, and only one of them survived.

- **Candidate text.** Still true, and still enforced. The characters a user
  pastes or types into a page are inspected in page memory and are never sent to
  Auro, never written to extension storage, and never included in the on-page
  notice. There is no code path from the inspected string to a network call.
- **Block metadata.** No longer true. Since ADR-0004 a block produces one
  `POST /api/v1/events` carrying the entity types, masked values, risk score,
  severity, and site hostname. The decision itself is still made locally and
  synchronously; the report is a separate, best-effort, after-the-fact call.

Read this record as the decision about *where enforcement happens*. Read ADR-0004
as the decision about *what gets recorded when it fires*.
