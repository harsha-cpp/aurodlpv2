from __future__ import annotations

import pytest

from aurodlpv2_backend.extension_clients.security import (
    ExtensionTokenError,
    issue_extension_token,
    parse_extension_token,
    verify_extension_secret,
)


@pytest.mark.unit
def test_extension_token_round_trip_and_wrong_secret_rejection() -> None:
    issued = issue_extension_token()
    client_id, secret = parse_extension_token(issued.raw_token)

    assert client_id == issued.client_id
    assert verify_extension_secret(secret, issued.token_hash)
    assert not verify_extension_secret(f"{secret}changed", issued.token_hash)
    assert secret.encode() not in issued.token_hash


@pytest.mark.unit
@pytest.mark.parametrize(
    "raw_token",
    [
        "",
        "bearer token",
        "auro_ext_invalid.secret",
        "auro_ext_00000000-0000-0000-0000-000000000000",
    ],
)
def test_extension_token_parser_rejects_malformed_values(raw_token: str) -> None:
    with pytest.raises(ExtensionTokenError):
        parse_extension_token(raw_token)
