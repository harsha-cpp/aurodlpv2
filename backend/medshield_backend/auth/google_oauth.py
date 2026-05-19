"""Google ID-token verification."""

from __future__ import annotations

import asyncio
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from typing import cast

from google.auth.transport.requests import Request
from google.oauth2 import id_token as google_id_token

from medshield_backend.settings import Settings, get_settings


class GoogleTokenError(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class GoogleIdentity:
    email: str
    sub: str
    hd: str
    name: str | None = None
    picture: str | None = None


GoogleVerifier = Callable[[str, object, str | None], Mapping[object, object]]


async def verify_google_id_token(id_token: str, settings: Settings | None = None) -> GoogleIdentity:
    resolved_settings = settings or get_settings()
    audience = (
        resolved_settings.google_client_ids[0]
        if len(resolved_settings.google_client_ids) == 1
        else None
    )
    request: object = Request()
    verifier_obj: object = vars(google_id_token)["verify_oauth2_token"]
    verifier = cast(GoogleVerifier, verifier_obj)
    decoded = await asyncio.to_thread(
        verifier,
        id_token,
        request,
        audience,
    )
    return google_identity_from_payload(
        decoded,
        allowed_hd_domains=resolved_settings.allowed_hd_domains,
        google_client_ids=resolved_settings.google_client_ids,
    )


def google_identity_from_payload(
    payload: Mapping[object, object],
    *,
    allowed_hd_domains: Sequence[str],
    google_client_ids: Sequence[str],
) -> GoogleIdentity:
    audience = _optional_str(payload.get("aud"))
    if google_client_ids and audience not in set(google_client_ids):
        raise GoogleTokenError("invalid Google token audience")

    email = _required_str(payload.get("email"), "email").lower()
    if payload.get("email_verified") is not True:
        raise GoogleTokenError("Google email is not verified")

    hd = _required_str(payload.get("hd"), "hd").lower()
    allowed_domains = {domain.lower() for domain in allowed_hd_domains}
    if allowed_domains and hd not in allowed_domains:
        raise GoogleTokenError("Google hosted domain is not allowed")

    email_domain = email.rsplit("@", maxsplit=1)[-1]
    if email_domain != hd:
        raise GoogleTokenError("Google hosted domain does not match email")

    return GoogleIdentity(
        email=email,
        sub=_required_str(payload.get("sub"), "sub"),
        hd=hd,
        name=_optional_str(payload.get("name")),
        picture=_optional_str(payload.get("picture")),
    )


def _required_str(value: object, claim: str) -> str:
    if not isinstance(value, str) or not value:
        raise GoogleTokenError(f"missing Google {claim} claim")
    return value


def _optional_str(value: object) -> str | None:
    return value if isinstance(value, str) and value else None
