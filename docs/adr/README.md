# Architecture decision records

| ADR | Decision | Status | Date |
|---|---|---|---|
| [0002](0002-two-enforcement-paths.md) | Local universal guard plus authoritative Gmail service | Accepted, superseded in part by 0004 | 2026-08-08 |
| [0004](0004-report-web-blocks-for-audit.md) | Report web-input blocks to the backend for audit | Accepted | 2026-08-29 |

An accepted record is a historical decision. A later change adds a new record and
marks the old one superseded; it does not rewrite the old rationale.

The numbering follows the original series. ADR-0001 (PostgreSQL durable scan
jobs) and ADR-0003 (rotating sessions and revocable extension principals) are not
on this branch. Both describe an earlier design the code no longer matches:
ADR-0001 specifies an `attachment_scan_jobs` table claimed with
`FOR UPDATE SKIP LOCKED`, and the build uses a Celery worker over Redis against
`attachment_scans`; ADR-0003 specifies a per-installation extension token, and the
extension still authenticates with the organization code. Correcting them was out
of scope for this documentation pass. They can be read on `origin/master` with
`git show origin/master:docs/adr/0001-postgresql-durable-scan-jobs.md`.
