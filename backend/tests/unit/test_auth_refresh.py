from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from fastapi import HTTPException, Response
from starlette.requests import Request

from blade_backend.auth.api import refresh
from blade_backend.auth.jwt import issue_refresh_token
from blade_backend.db.models import RefreshToken


class _FakeSession:
    def __init__(self, record: RefreshToken) -> None:
        self.record = record
        self.added: list[object] = []
        self.commits = 0

    async def get(self, model: object, _id: object) -> object | None:
        if model is RefreshToken:
            return self.record
        return None

    def add(self, item: object) -> None:
        self.added.append(item)

    async def commit(self) -> None:
        self.commits += 1


def _request_with_refresh_cookie(raw_token: str) -> Request:
    return Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/api/v1/auth/refresh",
            "query_string": b"",
            "headers": [(b"cookie", f"blade_refresh={raw_token}".encode())],
            "client": ("testclient", 123),
            "server": ("testserver", 80),
            "scheme": "http",
        }
    )


@pytest.mark.unit
async def test_replayed_refresh_token_does_not_mint_descendant() -> None:
    issued = issue_refresh_token(ttl_days=30)
    record = RefreshToken(
        id=issued.id,
        member_id=uuid4(),
        token_hash=issued.token_hash,
        expires_at=datetime.now(UTC) + timedelta(days=30),
        revoked_at=datetime.now(UTC),
    )
    session = _FakeSession(record)

    with pytest.raises(HTTPException) as exc_info:
        await refresh(Response(), _request_with_refresh_cookie(issued.raw_token), session)  # type: ignore[arg-type]

    assert exc_info.value.status_code == 401
    assert session.added == []
    assert session.commits == 0
