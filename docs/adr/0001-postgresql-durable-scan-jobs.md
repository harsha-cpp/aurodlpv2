# ADR-0001: PostgreSQL Durable Scan Jobs and Private Objects

## Status

Accepted — 2026-08-08

## Context

The previous plan used Celery and Redis to hand raw attachment locations to workers. Broker
delivery alone did not make the scan lifecycle durable, and local temporary paths could not be
shared safely across API and worker processes. A crash between scanning and deleting raw PHI
could also leave the product reporting success while sensitive bytes remained stored.

## Decision drivers

- Raw attachment bytes must survive an API/worker process boundary.
- Work must be recoverable after worker or broker failure.
- Duplicate workers must not publish competing results.
- Raw-object cleanup must be provable and retryable.
- Infrastructure should remain portable and low-maintenance.

## Considered options

### Celery with Redis broker

Familiar and feature-rich, but introduces broker state beside database state and does not by
itself solve object durability, atomic creation, or cleanup publication.

### In-process background tasks

Simple, but work disappears on restart and does not scale safely across API replicas.

### PostgreSQL jobs with private S3-compatible objects

Uses the authoritative database for state, supports transactional creation and row locking, and
keeps large bytes in storage designed for them.

## Decision

Use PostgreSQL `attachment_scan_jobs` claimed with `FOR UPDATE SKIP LOCKED`, explicit leases,
attempt fencing, retry availability, and separate scan/cleanup phases. Store queued raw bytes in
a private tenant-prefixed S3-compatible bucket. Do not expose a terminal scan state until object
deletion succeeds. Enforce lifecycle expiration as a second line of defense.

## Consequences

Positive:

- One durable source of truth for scan and job state.
- Crash recovery without a separate message broker.
- Horizontal workers can claim independently.
- Object deletion is an observable release condition.
- Compatible with managed PostgreSQL and several object providers.

Negative:

- Workers poll PostgreSQL and require careful indexes and lease tuning.
- Very high queue volume may eventually justify a dedicated broker.
- Object-store lifecycle behavior must be validated per provider.

## Follow-up

Monitor pending age, lease recovery, attempts, cleanup backlog, and bucket inventory. Revisit a
dedicated broker only when measured load shows PostgreSQL polling is the constraint.
