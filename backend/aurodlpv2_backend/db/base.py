"""SQLAlchemy 2.0 declarative base.

Models live in ``aurodlpv2_backend.db.models``. Alembic autogenerate uses
``Base.metadata``.
"""

from __future__ import annotations

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass
