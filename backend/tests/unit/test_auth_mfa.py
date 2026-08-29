from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pyotp
import pytest
from pydantic import SecretStr

from aurodlpv2_backend.auth.jwt import issue_access_token
from aurodlpv2_backend.auth.mfa import (
    CHALLENGE_TTL_SECONDS,
    MfaError,
    consume_backup_code,
    decode_challenge_token,
    decrypt_secret,
    encrypt_secret,
    generate_backup_codes,
    generate_secret,
    hash_backup_code,
    issue_challenge_token,
    provisioning_uri,
    verify_totp,
)
from aurodlpv2_backend.settings import Settings

_KEY_A = Settings(mfa_encryption_key=SecretStr("key-a-key-a-key-a-key-a-key-a-32"))
_KEY_B = Settings(mfa_encryption_key=SecretStr("key-b-key-b-key-b-key-b-key-b-32"))


@pytest.mark.unit
def test_secret_round_trips_through_encryption() -> None:
    secret = generate_secret()

    blob = encrypt_secret(secret, settings=_KEY_A)

    assert secret.encode("utf-8") not in blob
    assert decrypt_secret(blob, settings=_KEY_A) == secret


@pytest.mark.unit
def test_ciphertext_differs_per_call_for_the_same_secret() -> None:
    secret = generate_secret()

    assert encrypt_secret(secret, settings=_KEY_A) != encrypt_secret(secret, settings=_KEY_A)


@pytest.mark.unit
def test_wrong_key_cannot_decrypt() -> None:
    blob = encrypt_secret(generate_secret(), settings=_KEY_A)

    with pytest.raises(MfaError):
        decrypt_secret(blob, settings=_KEY_B)


@pytest.mark.unit
def test_truncated_blob_is_reported_not_crashed() -> None:
    with pytest.raises(MfaError):
        decrypt_secret(b"short", settings=_KEY_A)


@pytest.mark.unit
def test_current_totp_code_verifies_and_a_wrong_one_does_not() -> None:
    secret = generate_secret()

    assert verify_totp(secret, pyotp.TOTP(secret).now()) is True
    assert verify_totp(secret, "000000") is False
    assert verify_totp(secret, "not-a-code") is False


@pytest.mark.unit
def test_provisioning_uri_carries_the_issuer_and_account() -> None:
    uri = provisioning_uri(generate_secret(), email="dr@hospital.in", issuer="Auro")

    assert uri.startswith("otpauth://totp/")
    assert "issuer=Auro" in uri


@pytest.mark.unit
def test_backup_code_is_single_use() -> None:
    codes = generate_backup_codes(3)
    hashed = [hash_backup_code(code) for code in codes]

    remaining = consume_backup_code(hashed, codes[1])

    assert remaining is not None
    assert len(remaining) == 2
    assert consume_backup_code(remaining, codes[1]) is None


@pytest.mark.unit
def test_backup_code_ignores_formatting_the_user_typed() -> None:
    codes = generate_backup_codes(1)
    hashed = [hash_backup_code(code) for code in codes]

    assert consume_backup_code(hashed, f" {codes[0].upper()} ") == []


@pytest.mark.unit
def test_challenge_token_round_trips() -> None:
    member_id, org_id = uuid4(), uuid4()

    challenge = decode_challenge_token(issue_challenge_token(member_id, org_id))

    assert challenge.member_id == member_id
    assert challenge.org_id == org_id


@pytest.mark.unit
def test_expired_challenge_token_is_rejected() -> None:
    issued_at = datetime.now(UTC) - timedelta(seconds=CHALLENGE_TTL_SECONDS + 60)
    token = issue_challenge_token(uuid4(), uuid4(), now=issued_at)

    with pytest.raises(MfaError):
        decode_challenge_token(token)


@pytest.mark.unit
def test_access_token_is_not_accepted_as_a_challenge() -> None:
    access = issue_access_token(str(uuid4()), str(uuid4()), "owner")

    with pytest.raises(MfaError):
        decode_challenge_token(access)
