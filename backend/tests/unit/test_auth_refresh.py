from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import cast
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import Request

from aurodlpv2_backend.auth.api import refresh
from aurodlpv2_backend.auth.jwt import issue_refresh_token
from aurodlpv2_backend.db.models import Organization, OrgMember, RefreshToken


class _FakeSession:
    def __init__(
        self,
        record: RefreshToken,
        *,
        member: OrgMember | None = None,
        organization: Organization | None = None,
    ) -> None:
        self.record = record
        self.member = member
        self.organization = organization
        self.added: list[object] = []
        self.executed: list[object] = []
        self.commits = 0

    async def get(
        self,
        model: object,
        item_id: object,
        **_kwargs: object,
    ) -> object | None:
        if model is RefreshToken and item_id == self.record.id:
            return self.record
        if model is OrgMember and self.member is not None and item_id == self.member.id:
            return self.member
        if (
            model is Organization
            and self.organization is not None
            and item_id == self.organization.id
        ):
            return self.organization
        return None

    def add(self, item: object) -> None:
        self.added.append(item)

    async def execute(self, statement: object) -> None:
        self.executed.append(statement)

    async def commit(self) -> None:
        self.commits += 1


def _request_with_refresh_cookie(raw_token: str, *, csrf: bool = True) -> Request:
    headers = [(b"cookie", f"aurodlpv2_refresh={raw_token}".encode())]
    if csrf:
        headers.append((b"x-auro-csrf", b"1"))
    return Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/api/v1/auth/refresh",
            "query_string": b"",
            "headers": headers,
            "client": ("testclient", 123),
            "server": ("testserver", 80),
            "scheme": "http",
        }
    )


def _db_session(session: _FakeSession) -> AsyncSession:
    return cast(AsyncSession, session)


def _active_session() -> tuple[str, RefreshToken, _FakeSession]:
    issued = issue_refresh_token(ttl_days=30)
    family_id = uuid4()
    org_id = uuid4()
    member_id = uuid4()
    record = RefreshToken(
        id=issued.id,
        member_id=member_id,
        token_hash=issued.token_hash,
        family_id=family_id,
        expires_at=datetime.now(UTC) + timedelta(days=30),
    )
    member = OrgMember(
        id=member_id,
        org_id=org_id,
        email="owner@example.test",
        role="owner",
        status="active",
    )
    organization = Organization(
        id=org_id,
        name="Example Health",
        slug="example-health",
        org_code="AUR-EXAMPLE",
        plan="trial",
    )
    return (
        issued.raw_token,
        record,
        _FakeSession(
            record,
            member=member,
            organization=organization,
        ),
    )


@pytest.mark.unit
async def test_refresh_requires_non_simple_csrf_header() -> None:
    raw_token, _record, session = _active_session()

    with pytest.raises(HTTPException) as exc_info:
        await refresh(
            Response(),
            _request_with_refresh_cookie(raw_token, csrf=False),
            _db_session(session),
        )

    assert exc_info.value.status_code == 403
    assert session.commits == 0


@pytest.mark.unit
async def test_refresh_rotates_token_and_marks_parent_used() -> None:
    raw_token, record, session = _active_session()
    response = Response()

    result = await refresh(
        response,
        _request_with_refresh_cookie(raw_token),
        _db_session(session),
    )

    assert result.member.email == "owner@example.test"
    assert record.used_at is not None
    assert record.revoked_at is not None
    assert session.commits == 1
    assert len(session.added) == 1
    child = session.added[0]
    assert isinstance(child, RefreshToken)
    assert child.family_id == record.family_id
    assert child.rotated_from_id == record.id
    assert "aurodlpv2_refresh=" in response.headers["set-cookie"]
    assert str(child.id) in response.headers["set-cookie"]


@pytest.mark.unit
async def test_replayed_refresh_token_revokes_its_family() -> None:
    raw_token, record, session = _active_session()
    record.used_at = datetime.now(UTC)
    record.revoked_at = datetime.now(UTC)
    response = Response()

    with pytest.raises(HTTPException) as exc_info:
        await refresh(
            response,
            _request_with_refresh_cookie(raw_token),
            _db_session(session),
        )

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "refresh token reuse detected"
    assert session.added == []
    assert len(session.executed) == 1
    assert session.commits == 1
    assert response.headers["set-cookie"].startswith("aurodlpv2_refresh=")


@pytest.mark.unit
async def test_wrong_refresh_secret_does_not_revoke_family() -> None:
    raw_token, _record, session = _active_session()
    token_id = UUID(raw_token.partition(".")[0])
    response = Response()

    with pytest.raises(HTTPException) as exc_info:
        await refresh(
            response,
            _request_with_refresh_cookie(f"{token_id}.wrong-secret"),
            _db_session(session),
        )

    assert exc_info.value.status_code == 401
    assert session.executed == []
    assert session.commits == 0
    assert session.added == []


@pytest.mark.unit
async def test_expired_refresh_token_is_revoked() -> None:
    raw_token, record, session = _active_session()
    record.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    response = Response()

    with pytest.raises(HTTPException) as exc_info:
        await refresh(
            response,
            _request_with_refresh_cookie(raw_token),
            _db_session(session),
        )

    assert exc_info.value.status_code == 401
    assert record.revoked_at is not None
    assert session.commits == 1
    assert session.added == []
