from __future__ import annotations

from urllib.parse import quote

Message = tuple[str, str]


def _link(base_url: str, path: str, token: str) -> str:
    return f"{base_url.rstrip('/')}{path}?token={quote(token, safe='')}"


def invite_email(*, base_url: str, org_name: str, inviter_email: str, token: str) -> Message:
    subject = f"You have been invited to {org_name} on Auro Healthcare DLP"
    body = (
        f"{inviter_email} invited you to join {org_name} on Auro Healthcare DLP.\n\n"
        f"Accept the invitation and set your password:\n"
        f"{_link(base_url, '/accept-invite', token)}\n\n"
        "This link expires in 7 days. If you were not expecting this invitation, "
        "ignore this message and tell your administrator.\n"
    )
    return subject, body


def password_reset_email(*, base_url: str, token: str, ttl_seconds: int) -> Message:
    subject = "Reset your Auro Healthcare DLP password"
    body = (
        "A password reset was requested for this address.\n\n"
        f"Reset your password:\n{_link(base_url, '/reset-password', token)}\n\n"
        f"This link works once and expires in {ttl_seconds // 60} minutes. "
        "If you did not request a reset, no action is needed - your password "
        "has not changed.\n"
    )
    return subject, body


def email_verification_email(*, base_url: str, token: str, ttl_hours: int) -> Message:
    subject = "Verify your Auro Healthcare DLP email address"
    body = (
        "Confirm this address so it can receive security alerts for your "
        "Auro Healthcare DLP account.\n\n"
        f"Verify your email:\n{_link(base_url, '/verify-email', token)}\n\n"
        f"This link expires in {ttl_hours} hours.\n"
    )
    return subject, body
