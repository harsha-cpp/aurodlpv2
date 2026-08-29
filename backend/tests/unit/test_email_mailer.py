from __future__ import annotations

import pytest
from pydantic import SecretStr

from aurodlpv2_backend.email.mailer import (
    ConsoleMailer,
    MailerError,
    SmtpMailer,
    build_mailer,
    send_quietly,
)
from aurodlpv2_backend.email.templates import (
    email_verification_email,
    invite_email,
    password_reset_email,
)
from aurodlpv2_backend.settings import Settings


class _ExplodingMailer:
    async def send(self, *, to: str, subject: str, body: str) -> None:
        raise MailerError(f"no route to {to} for {subject}: {body}")


class _RecordingMailer:
    def __init__(self) -> None:
        self.sent: list[tuple[str, str, str]] = []

    async def send(self, *, to: str, subject: str, body: str) -> None:
        self.sent.append((to, subject, body))


@pytest.mark.unit
def test_invite_body_carries_a_usable_link() -> None:
    subject, body = invite_email(
        base_url="https://dlp.example.org/",
        org_name="City Hospital",
        inviter_email="admin@hospital.in",
        token="tok-123",
    )

    assert "City Hospital" in subject
    assert "https://dlp.example.org/accept-invite?token=tok-123" in body
    assert "admin@hospital.in" in body


@pytest.mark.unit
def test_reset_link_token_is_url_encoded() -> None:
    _subject, body = password_reset_email(
        base_url="https://dlp.example.org", token="a+b/c=", ttl_seconds=3600
    )

    assert "token=a%2Bb%2Fc%3D" in body
    assert "60 minutes" in body


@pytest.mark.unit
def test_verification_body_states_the_expiry() -> None:
    _subject, body = email_verification_email(
        base_url="https://dlp.example.org", token="tok", ttl_hours=24
    )

    assert "/verify-email?token=tok" in body
    assert "24 hours" in body


@pytest.mark.unit
def test_console_backend_is_the_default_and_smtp_is_opt_in() -> None:
    assert isinstance(build_mailer(Settings()), ConsoleMailer)
    assert isinstance(
        build_mailer(Settings(mailer_backend="smtp", smtp_password=SecretStr("x"))), SmtpMailer
    )


@pytest.mark.unit
async def test_send_quietly_reports_failure_without_raising() -> None:
    assert await send_quietly(_ExplodingMailer(), to="x@y.z", subject="s", body="b") is False


@pytest.mark.unit
async def test_send_quietly_reports_success() -> None:
    mailer = _RecordingMailer()

    assert await send_quietly(mailer, to="x@y.z", subject="s", body="b") is True
    assert mailer.sent == [("x@y.z", "s", "b")]
