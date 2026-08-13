# ADR-0002: Two Browser Enforcement Paths

## Status

Accepted — 2026-08-08

## Context

The original product focused on Gmail. The expanded requirement prevents patient data from being
pasted into browser-based AI chats and other text boxes. A round trip for every keystroke or paste
would expose candidate data, add latency, and fail during network loss. Gmail still needs tenant
recipient policy, attachments, quarantine, and audit that cannot be decided locally.

## Decision

Use a local, pre-insertion guard for ordinary HTTP(S) web inputs and retain a server-authoritative
Gmail send flow. The local guard transmits no candidate text. Gmail uses a revocable extension
principal and fails closed when the backend is unavailable.

## Consequences

Positive:

- Immediate protection in AI chats without sending raw patient data elsewhere.
- Offline web-input protection remains active.
- Gmail retains organization policy and durable review.

Negative:

- Local and Python recognizers require deliberately synchronized golden cases.
- Chrome-restricted pages and unconventional controls remain outside guaranteed coverage.
- All-site permissions require strong disclosure and review.

## Follow-up

Track minimized false-positive/false-negative cases in both detector suites and publish an
explicit Chrome Web Store privacy explanation for all-site access.
