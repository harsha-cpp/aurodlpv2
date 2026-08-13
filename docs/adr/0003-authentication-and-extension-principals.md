# ADR-0003: Rotating Human Sessions and Revocable Extension Principals

## Status

Accepted — 2026-08-08

## Context

An organization code appeared in the original design as both routing value and extension access
mechanism. It is displayed in the dashboard and cannot serve as a secret. Human dashboard
sessions also require reload recovery without exposing long-lived tokens to JavaScript.

## Decision

Human users receive a short-lived access JWT held in memory and a rotating opaque refresh token
in an httpOnly cookie. Refresh and logout require a custom CSRF header. A token-family replay
revokes all descendants.

Each browser installation receives one opaque `AuroExtension` token. The raw value is shown once;
the database stores its identifier, SHA-256 digest of the high-entropy secret, tenant, label,
expiry, and revocation state. Organization code remains a non-secret routing value and must match
the authenticated extension tenant.

## Consequences

Positive:

- Browser installations can be revoked independently.
- Database disclosure does not reveal usable raw tokens.
- Human refresh tokens are unavailable to dashboard JavaScript.
- Replay response is fail closed across the family.

Negative:

- Concurrent refresh calls require client-side de-duplication.
- Installation enrollment adds an administrative step.
- A forgotten one-time token must be replaced, not recovered.

## Follow-up

Monitor refresh-family revocations and extension credential failures. Add managed-device identity
or SSO only if a customer requires centralized device attestation.
