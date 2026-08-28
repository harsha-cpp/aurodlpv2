from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any, cast
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import Request

from aurodlpv2_backend.auth.api import refresh
from aurodlpv2_backend.auth.jwt import issue_refresh_token
from aurodlpv2_backend.db.models import Organization, OrgMember, RefreshToken
from aurodlpv2_backend.settings import get_settings
from aurodlpv2_backend.utils.uuid import uuid7


class _FakeSession:
    """Just enough AsyncSession for the refresh handler and audit writer."""

    def __init__(self, record: RefreshToken, member: OrgMember, org: Organization) -> None:
        self.record = record
        self.member = member
        self.org = org
        self.added: list[object] = []
        self.commits = 0
        self.executed: list[object] = []

    async def get(self, model: object, _id: object) -> object | None:
        if model is RefreshToken:
            return self.record
        if model is OrgMember:
            return self.member
        if model is Organization:
            return self.org
        return None

    async def scalar(self, _statement: object) -> object | None:
        # No MFA row and no previous audit event.
        return None

    async def execute(self, statement: object, _params: object = None) -> None:
        self.executed.append(statement)

    def add(self, item: object) -> None:
        self.added.append(item)

    async def commit(self) -> None:
        self.commits += 1


def _member(org_id: UUID) -> OrgMember:
    return OrgMember(
        id=uuid4(),
        org_id=org_id,
        email="dr@hospital.in",
        name="Dr Sharma",
        role="owner",
        status="active",
    )


def _org() -> Organization:
    return Organization(
        id=uuid4(), name="City Hospital", slug="city-hospital", org_code="AUR-X", plan="free"
    )


def _request(raw_token: str) -> Request:
    return Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/api/v1/auth/refresh",
            "query_string": b"",
            "headers": [
                (b"cookie", f"aurodlpv2_refresh={raw_token}".encode()),
                (b"user-agent", b"Chrome/131"),
            ],
            "client": ("203.0.113.10", 123),
            "server": ("testserver", 80),
            "scheme": "http",
        }
    )


def _setup(
    *, rotated_at: datetime | None = None, revoked_at: datetime | None = None
) -> tuple[str, _FakeSession, RefreshToken]:
    issued = issue_refresh_token(ttl_days=30)
    org = _org()
    member = _member(org.id)
    record = RefreshToken(
        id=issued.id,
        member_id=member.id,
        family_id=uuid7(),
        token_hash=issued.token_hash,
        expires_at=datetime.now(UTC) + timedelta(days=30),
        rotated_at=rotated_at,
        revoked_at=revoked_at,
    )
    return issued.raw_token, _FakeSession(record, member, org), record


def _as_session(session: _FakeSession) -> AsyncSession:
    return cast(AsyncSession, cast(Any, session))


@pytest.mark.unit
async def test_refresh_rotates_and_keeps_the_family() -> None:
    raw_token, session, record = _setup()

    result = await refresh(Response(), _request(raw_token), _as_session(session))

    assert result.access_token
    assert record.rotated_at is not None
    successors = [item for item in session.added if isinstance(item, RefreshToken)]
    assert len(successors) == 1
    # Same family, so revoking a stolen lineage still catches the successor.
    assert successors[0].family_id == record.family_id
    assert successors[0].user_agent == "Chrome/131"
    assert successors[0].ip_address == "203.0.113.10"


@pytest.mark.unit
async def test_concurrent_refresh_inside_the_grace_window_does_not_rotate_again() -> None:
    """Two tabs refreshing at once must not sign each other out."""
    raw_token, session, _record = _setup(rotated_at=datetime.now(UTC))

    result = await refresh(Response(), _request(raw_token), _as_session(session))

    assert result.access_token
    assert [item for item in session.added if isinstance(item, RefreshToken)] == []


@pytest.mark.unit
async def test_replay_after_the_grace_window_revokes_the_family() -> None:
    grace = get_settings().refresh_rotation_grace_seconds
    raw_token, session, _record = _setup(
        rotated_at=datetime.now(UTC) - timedelta(seconds=grace + 60)
    )

    with pytest.raises(HTTPException) as exc_info:
        await refresh(Response(), _request(raw_token), _as_session(session))

    assert exc_info.value.status_code == 401
    # The bulk revoke plus the advisory lock taken by the audit writer.
    assert len(session.executed) >= 1
    assert [item for item in session.added if isinstance(item, RefreshToken)] == []


@pytest.mark.unit
async def test_revoked_token_is_rejected_without_minting_anything() -> None:
    raw_token, session, _record = _setup(revoked_at=datetime.now(UTC))

    with pytest.raises(HTTPException) as exc_info:
        await refresh(Response(), _request(raw_token), _as_session(session))

    assert exc_info.value.status_code == 401
    assert session.added == []
    assert session.commits == 0
