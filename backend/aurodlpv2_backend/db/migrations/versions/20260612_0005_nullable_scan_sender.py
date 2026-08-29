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
    op.execute("UPDATE scan_events SET user_email = NULL WHERE user_email = 'unknown'")

def downgrade() -> None:
    op.execute("UPDATE scan_events SET user_email = 'unknown' WHERE user_email IS NULL")
    op.alter_column(
        "scan_events",
        "user_email",
        existing_type=sa.Text(),
        nullable=False,
    )
