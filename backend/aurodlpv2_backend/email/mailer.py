from __future__ import annotations

from email.message import EmailMessage
from typing import Protocol, runtime_checkable

import structlog

from aurodlpv2_backend.settings import Settings, get_settings

logger = structlog.get_logger(__name__)


@runtime_checkable
class Mailer(Protocol):
    async def send(self, *, to: str, subject: str, body: str) -> None: ...


class MailerError(RuntimeError):
    pass


class ConsoleMailer:
    async def send(self, *, to: str, subject: str, body: str) -> None:
        logger.info("mail.console", to=to, subject=subject, body=body)


class SmtpMailer:
    def __init__(self, settings: Settings) -> None:
        self._host = settings.smtp_host
        self._port = settings.smtp_port
        self._user = settings.smtp_user
        password = settings.smtp_password
        self._password = password.get_secret_value() if password is not None else None
        self._from = settings.smtp_from
        self._tls = settings.smtp_tls

    async def send(self, *, to: str, subject: str, body: str) -> None:
        import aiosmtplib  # noqa: PLC0415 - deferred so console-only installs need no SMTP client

        message = EmailMessage()
        message["From"] = self._from
        message["To"] = to
        message["Subject"] = subject
        message.set_content(body)
        try:
            await aiosmtplib.send(
                message,
                hostname=self._host,
                port=self._port,
                username=self._user,
                password=self._password,
                start_tls=self._tls,
            )
        except Exception as exc:
            logger.warning("mail.smtp_failed", to=to, subject=subject)
            raise MailerError("mail delivery failed") from exc


def build_mailer(settings: Settings | None = None) -> Mailer:
    resolved = settings or get_settings()
    if resolved.mailer_backend == "smtp":
        return SmtpMailer(resolved)
    return ConsoleMailer()


_mailer: Mailer | None = None


def get_mailer() -> Mailer:
    global _mailer  # noqa: PLW0603 - process-wide singleton by design
    if _mailer is None:
        _mailer = build_mailer()
    return _mailer


def set_mailer(mailer: Mailer | None) -> None:
    global _mailer  # noqa: PLW0603
    _mailer = mailer


async def send_quietly(mailer: Mailer, *, to: str, subject: str, body: str) -> bool:
    try:
        await mailer.send(to=to, subject=subject, body=body)
    except Exception:
        logger.warning("mail.send_failed", subject=subject)
        return False
    return True
