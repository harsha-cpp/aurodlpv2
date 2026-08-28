from __future__ import annotations

import pytest

from aurodlpv2_backend.auth.passwords import (
    MIN_PASSWORD_LENGTH,
    PasswordPolicyError,
    hash_password,
    validate_password,
    verify_password,
)


@pytest.mark.unit
def test_password_shorter_than_minimum_is_rejected() -> None:
    with pytest.raises(PasswordPolicyError):
        validate_password("a" * (MIN_PASSWORD_LENGTH - 1))


@pytest.mark.unit
@pytest.mark.parametrize(
    "password",
    ["passwordpassword", "qwertyuiop123", "letmein2025", "hyderabad123", "medanta123"],
)
def test_common_passwords_are_rejected_even_when_long(password: str) -> None:
    with pytest.raises(PasswordPolicyError):
        validate_password(password)


@pytest.mark.unit
def test_deny_list_matches_through_separators() -> None:
    """Long enough, not literally on the list, but collapses onto an entry."""
    with pytest.raises(PasswordPolicyError):
        validate_password("letmein-2025")


@pytest.mark.unit
@pytest.mark.parametrize("password", ["password123456", "1234qwerty1234", "Passw0rd!2026"])
def test_padding_a_famous_password_to_length_is_still_rejected(password: str) -> None:
    """The obvious way to satisfy a 12-character rule is to pad "password"."""
    with pytest.raises(PasswordPolicyError):
        validate_password(password)


@pytest.mark.unit
@pytest.mark.parametrize("password", ["aaaaaaaaaaaaaa", "abababababab"])
def test_long_but_near_empty_passwords_are_rejected(password: str) -> None:
    """No deny-list catches every repetition; count distinct characters instead."""
    with pytest.raises(PasswordPolicyError):
        validate_password(password)


@pytest.mark.unit
def test_all_digit_passwords_are_rejected() -> None:
    """Twelve digits is a phone number or a date of birth."""
    with pytest.raises(PasswordPolicyError):
        validate_password("981234567890")


@pytest.mark.unit
def test_password_containing_email_local_part_is_rejected() -> None:
    with pytest.raises(PasswordPolicyError):
        validate_password("drsharma-clinic-2026", email="drsharma@hospital.in")


@pytest.mark.unit
def test_short_local_part_does_not_ban_everything() -> None:
    validate_password("purple-monsoon-ladder", email="hi@hospital.in")


@pytest.mark.unit
def test_acceptable_password_passes() -> None:
    validate_password("purple-monsoon-ladder", email="drsharma@hospital.in")


@pytest.mark.unit
def test_hash_round_trips_and_rejects_wrong_password() -> None:
    hashed = hash_password("purple-monsoon-ladder")

    assert verify_password("purple-monsoon-ladder", hashed) is True
    assert verify_password("purple-monsoon-ladde", hashed) is False
