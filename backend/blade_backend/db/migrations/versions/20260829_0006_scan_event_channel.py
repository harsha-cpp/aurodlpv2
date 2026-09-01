from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260829_0006"
down_revision = "20260612_0005"
branch_labels: tuple[str, ...] | None = None
depends_on: tuple[str, ...] | None = None

def upgrade() -> None:
    op.add_column(
        "scan_events",
        sa.Column("channel", sa.Text(), nullable=False, server_default=sa.text("'email'")),
    )
    op.add_column("scan_events", sa.Column("site_host", sa.Text(), nullable=True))
    op.create_check_constraint(
        "ck_scan_events_channel",
        "scan_events",
        "channel IN ('email','web')",
    )
    op.create_index(
        "ix_scan_events_org_channel_time",
        "scan_events",
        ["org_id", "channel", "event_time"],
    )

def downgrade() -> None:
    op.drop_index("ix_scan_events_org_channel_time", table_name="scan_events")
    op.drop_constraint("ck_scan_events_channel", "scan_events", type_="check")
    op.drop_column("scan_events", "site_host")
    op.drop_column("scan_events", "channel")
