"""Outbound mail for invites, password resets and email verification."""

from __future__ import annotations

from aurodlpv2_backend.email.mailer import (
    ConsoleMailer,
    Mailer,
    MailerError,
    SmtpMailer,
    build_mailer,
    get_mailer,
    send_quietly,
    set_mailer,
)

__all__ = [
    "ConsoleMailer",
    "Mailer",
    "MailerError",
    "SmtpMailer",
    "build_mailer",
    "get_mailer",
    "send_quietly",
    "set_mailer",
]
