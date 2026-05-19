"""phase 1 auth and workspaces

Revision ID: 20260518_1730
Revises: 20260518_1700
Create Date: 2026-05-18 17:30:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260518_1730"
down_revision = "20260518_1700"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS citext")
    op.execute(
        """
        CREATE OR REPLACE FUNCTION uuidv7() RETURNS uuid
        LANGUAGE plpgsql
        VOLATILE
        AS $$
        DECLARE
          unix_ts_ms bytea;
          rand_bytes bytea;
        BEGIN
          unix_ts_ms := substring(int8send((extract(epoch from clock_timestamp()) * 1000)::bigint) from 3);
          rand_bytes := gen_random_bytes(10);
          rand_bytes := set_byte(rand_bytes, 0, (get_byte(rand_bytes, 0) & 15) | 112);
          rand_bytes := set_byte(rand_bytes, 2, (get_byte(rand_bytes, 2) & 63) | 128);
          RETURN encode(unix_ts_ms || rand_bytes, 'hex')::uuid;
        END
        $$;
        """
    )

    op.create_table(
        "workspaces",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("uuidv7()"), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("google_domains", postgresql.ARRAY(sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("settings", postgresql.JSONB(), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("uuidv7()"), nullable=False),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("email", postgresql.CITEXT(), nullable=False),
        sa.Column("role", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("role IN ('user','analyst','admin','super_admin')", name="ck_users_role"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("workspace_id", "email", name="uq_users_workspace_email"),
    )
    op.create_table(
        "refresh_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("uuidv7()"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("token_hash", sa.LargeBinary(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.execute(
        """
        CREATE TABLE audit_events (
          id UUID NOT NULL DEFAULT uuidv7(),
          workspace_id UUID NOT NULL,
          occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          actor_type TEXT NOT NULL CHECK (actor_type IN ('user','system','api_key')),
          actor_id TEXT NOT NULL,
          actor_email TEXT,
          action TEXT NOT NULL,
          category TEXT NOT NULL CHECK (category IN ('scan','policy','quarantine','auth')),
          resource_type TEXT,
          resource_id TEXT,
          before_state JSONB,
          after_state JSONB,
          metadata JSONB,
          prev_hash BYTEA,
          row_hash BYTEA NOT NULL,
          PRIMARY KEY (workspace_id, occurred_at, id)
        ) PARTITION BY RANGE (occurred_at)
        """
    )
    op.execute(
        """
        CREATE TABLE audit_events_2026_05
          PARTITION OF audit_events
          FOR VALUES FROM ('2026-05-01') TO ('2026-06-01')
        """
    )
    op.execute(
        """
        CREATE TABLE audit_events_default
          PARTITION OF audit_events
          DEFAULT
        """
    )
    op.execute(
        """
        CREATE OR REPLACE FUNCTION compute_audit_hash() RETURNS TRIGGER
        LANGUAGE plpgsql
        AS $$
        DECLARE last_hash BYTEA;
        BEGIN
          SELECT row_hash INTO last_hash
            FROM audit_events
           WHERE workspace_id = NEW.workspace_id
           ORDER BY occurred_at DESC, id DESC
           LIMIT 1;
          NEW.prev_hash := last_hash;
          NEW.row_hash := digest(
            concat_ws('|',
              NEW.workspace_id::text, NEW.occurred_at::text, NEW.id::text,
              NEW.actor_id, NEW.action, COALESCE(NEW.resource_id,''),
              COALESCE(NEW.metadata::text,''),
              COALESCE(encode(NEW.prev_hash,'hex'),'')
            ), 'sha256'
          );
          RETURN NEW;
        END
        $$;
        """
    )
    op.execute(
        """
        CREATE TRIGGER audit_events_hash
          BEFORE INSERT ON audit_events
          FOR EACH ROW EXECUTE FUNCTION compute_audit_hash()
        """
    )
    op.execute(
        """
        CREATE OR REPLACE FUNCTION block_audit_mutation() RETURNS TRIGGER
        LANGUAGE plpgsql
        AS $$
        BEGIN
          RAISE EXCEPTION 'audit_events is append-only';
        END
        $$;
        """
    )
    op.execute(
        """
        CREATE TRIGGER audit_events_no_update
          BEFORE UPDATE ON audit_events
          FOR EACH ROW EXECUTE FUNCTION block_audit_mutation()
        """
    )
    op.execute(
        """
        CREATE TRIGGER audit_events_no_delete
          BEFORE DELETE ON audit_events
          FOR EACH ROW EXECUTE FUNCTION block_audit_mutation()
        """
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS audit_events_no_delete ON audit_events")
    op.execute("DROP TRIGGER IF EXISTS audit_events_no_update ON audit_events")
    op.execute("DROP TRIGGER IF EXISTS audit_events_hash ON audit_events")
    op.execute("DROP FUNCTION IF EXISTS block_audit_mutation")
    op.execute("DROP FUNCTION IF EXISTS compute_audit_hash")
    op.drop_table("audit_events_default")
    op.drop_table("audit_events_2026_05")
    op.drop_table("audit_events")
    op.drop_table("refresh_tokens")
    op.drop_table("users")
    op.drop_table("workspaces")
    op.execute("DROP FUNCTION IF EXISTS uuidv7")
