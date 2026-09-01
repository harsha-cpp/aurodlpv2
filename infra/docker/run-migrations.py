#!/usr/bin/env python
"""Run `alembic upgrade head` exactly once, even with N replicas starting together.

Alembic has no locking of its own. Two API containers booting at the same second
both read the current revision, both decide they must apply 0003, and one of them
dies on a duplicate object - or worse, on a migration that is not transactional,
leaves the schema half-applied. Postgres advisory locks are the standard fix:
session-scoped, released automatically if the process is killed, and free.

Usage:
    python run-migrations.py              # wait for the DB, lock, upgrade head
    python run-migrations.py --wait-only  # just block until the DB answers

Configuration comes from the application's own Settings, so there is exactly one
definition of DATABASE_SYNC_URL and this cannot drift from what the app uses.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
import time
from pathlib import Path

import psycopg

from blade_backend.settings import get_settings

# Arbitrary but fixed: any 64-bit int works as long as every deployer of this
# application uses the same one.
ADVISORY_LOCK_KEY = 0x4155524F_444C5001

BACKEND_DIR = Path("/app/backend")
CONNECT_TIMEOUT_SECONDS = 5
DEFAULT_WAIT_SECONDS = 120


def log(message: str) -> None:
    print(f"run-migrations: {message}", file=sys.stderr, flush=True)


def dsn() -> str:
    """Alembic uses the sync (psycopg) URL; strip the SQLAlchemy driver prefix."""
    url = get_settings().database_sync_url
    return url.replace("postgresql+psycopg://", "postgresql://", 1).replace(
        "postgresql+psycopg2://", "postgresql://", 1
    )


def wait_for_database(timeout: int = DEFAULT_WAIT_SECONDS) -> psycopg.Connection[object]:
    deadline = time.monotonic() + timeout
    attempt = 0
    while True:
        attempt += 1
        try:
            return psycopg.connect(dsn(), connect_timeout=CONNECT_TIMEOUT_SECONDS)
        except psycopg.OperationalError as exc:
            if time.monotonic() >= deadline:
                log(f"database unreachable after {timeout}s: {exc}")
                raise
            log(f"database not ready (attempt {attempt}), retrying in 2s")
            time.sleep(2)


def upgrade_head() -> int:
    connection = wait_for_database()
    try:
        connection.autocommit = True
        with connection.cursor() as cursor:
            # Blocking form on purpose: a replica that loses the race should wait
            # for the schema it is about to depend on, not start against the old one.
            log("acquiring advisory lock")
            cursor.execute("SELECT pg_advisory_lock(%s)", (ADVISORY_LOCK_KEY,))
            log("lock held; running alembic")
            result = subprocess.run(  # noqa: S603 - fixed argv, no shell
                [sys.executable, "-m", "alembic", "upgrade", "head"],
                cwd=BACKEND_DIR,
                check=False,
            )
            cursor.execute("SELECT pg_advisory_unlock(%s)", (ADVISORY_LOCK_KEY,))
        return result.returncode
    finally:
        connection.close()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--wait-only",
        action="store_true",
        help="block until the database answers, then exit without migrating",
    )
    parser.add_argument("--timeout", type=int, default=DEFAULT_WAIT_SECONDS)
    args = parser.parse_args()

    if args.wait_only:
        wait_for_database(args.timeout).close()
        log("database reachable")
        return 0
    return upgrade_head()


if __name__ == "__main__":
    raise SystemExit(main())
