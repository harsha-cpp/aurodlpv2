#!/bin/sh
# Entrypoint for both the API and the Celery worker image.
#
# Default behaviour is to exec the CMD unchanged. Two opt-in behaviours:
#
#   WAIT_FOR_DB=true    block until the database accepts a connection. Only
#                       useful in compose/dev; on Kubernetes the readiness probe
#                       and a restart loop do this better.
#   RUN_MIGRATIONS=true run `alembic upgrade head` under a Postgres advisory
#                       lock before starting. Safe with N replicas — the losers
#                       block until the winner finishes, then see head and
#                       no-op. Prefer the one-shot `migrate` service in
#                       infra/docker-compose.prod.yml; this flag exists for
#                       single-container deploys where there is no place to put
#                       an init container.
set -eu

log() { printf '%s entrypoint: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }

if [ "${WAIT_FOR_DB:-false}" = "true" ]; then
    log "waiting for database"
    python /usr/local/bin/run-migrations.py --wait-only
fi

if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
    log "running alembic upgrade head"
    python /usr/local/bin/run-migrations.py
    log "migrations complete"
fi

exec "$@"
