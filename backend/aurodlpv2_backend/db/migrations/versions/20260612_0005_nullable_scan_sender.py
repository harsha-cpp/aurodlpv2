"""Allow scan events with no attributable sender.

The extension scrapes the sender address out of a Gmail aria-label and cannot
always find it. It used to send the literal string "unknown", which then became
the actor on the audit row and a user in the "top offenders" chart. Recording
the absence is honest; inventing a user is not.

Revision ID: 20260612_0005
Revises: 20260610_0004
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260612_0005"
down_revision = "20260610_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "scan_events",
        "user_email",
        existing_type=sa.Text(),
        nullable=True,
    )
    # Existing rows carrying the sentinel are exactly the unattributed ones.
    op.execute("UPDATE scan_events SET user_email = NULL WHERE user_email = 'unknown'")


def downgrade() -> None:
    op.execute("UPDATE scan_events SET user_email = 'unknown' WHERE user_email IS NULL")
    op.alter_column(
        "scan_events",
        "user_email",
        existing_type=sa.Text(),
        nullable=False,
    )
