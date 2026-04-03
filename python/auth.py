import os
import time
import logging
from typing import Optional

import httpx
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired
from jose import jwt, jwk
from jose.exceptions import JWTError
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

logger = logging.getLogger(__name__)

REPLIT_PUBKEYS_URL = "https://replit.com/pubkeys"
SESSION_COOKIE = "a0p_session"
SESSION_MAX_AGE = 60 * 60 * 24 * 7  # 7 days

_jwks_cache: list = []
_jwks_fetched_at: float = 0
_JWKS_TTL = 3600  # re-fetch keys every hour


def _get_secret() -> str:
    s = os.environ.get("SESSION_SECRET", "")
    if not s:
        raise RuntimeError("SESSION_SECRET env var is required")
    return s


async def _fetch_jwks(force: bool = False) -> list:
    global _jwks_cache, _jwks_fetched_at
    if not force and _jwks_cache and (time.time() - _jwks_fetched_at) < _JWKS_TTL:
        return _jwks_cache
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(REPLIT_PUBKEYS_URL)
            resp.raise_for_status()
            data = resp.json()
        keys = data.get("keys", data) if isinstance(data, dict) else data
        if isinstance(keys, list):
            _jwks_cache = keys
            _jwks_fetched_at = time.time()
            logger.info("[auth] Fetched %d Replit public key(s)", len(keys))
        return _jwks_cache
    except Exception as exc:
        logger.warning("[auth] Could not fetch Replit pubkeys: %s", exc)
        return _jwks_cache


async def verify_replit_token(token: str) -> dict:
    """
    Validate a Replit auth_with_repl_site JWT.
    Returns user info dict: {id, email, firstName, profileImageUrl}.
    Raises ValueError on invalid token.
    """
    try:
        header = jwt.get_unverified_header(token)
    except JWTError as exc:
        raise ValueError(f"Invalid JWT header: {exc}") from exc

    kid = header.get("kid", "")
    alg = header.get("alg", "RS256")

    keys = await _fetch_jwks()
    key_data = next((k for k in keys if k.get("kid") == kid), None)

    if not key_data:
        keys = await _fetch_jwks(force=True)
        key_data = next((k for k in keys if k.get("kid") == kid), None)

    if not key_data:
        raise ValueError(f"Unknown keyID: {kid}")

    try:
        pub_key = jwk.construct(key_data, algorithm=alg)
        claims = jwt.decode(
            token, pub_key,
            algorithms=[alg],
            options={"verify_aud": False},
        )
    except JWTError as exc:
        raise ValueError(f"JWT verification failed: {exc}") from exc

    user_id = str(claims.get("sub") or claims.get("id") or "")
    if not user_id:
        raise ValueError("JWT missing sub claim")

    raw_name = claims.get("name") or ""
    first_name = raw_name.split(" ")[0] if raw_name else "Operator"

    return {
        "id": user_id,
        "email": claims.get("email"),
        "firstName": first_name,
        "lastName": None,
        "profileImageUrl": claims.get("profile_image") or claims.get("profileImage"),
    }


def make_session_cookie(user_info: dict) -> str:
    s = URLSafeTimedSerializer(_get_secret())
    return s.dumps(user_info, salt="a0p-auth-v1")


def read_session_cookie(cookie_value: str) -> Optional[dict]:
    try:
        s = URLSafeTimedSerializer(_get_secret())
        return s.loads(cookie_value, salt="a0p-auth-v1", max_age=SESSION_MAX_AGE)
    except (BadSignature, SignatureExpired):
        return None


class ReplitAuthMiddleware(BaseHTTPMiddleware):
    """
    Transparently inject Replit-style auth headers from a signed session cookie
    when the native Replit headers (dev-mode) are absent (i.e. production).
    """

    async def dispatch(self, request: Request, call_next):
        if not request.headers.get("x-replit-user-id"):
            session_cookie = request.cookies.get(SESSION_COOKIE)
            if session_cookie:
                user = read_session_cookie(session_cookie)
                if user:
                    extra = [
                        (b"x-replit-user-id", str(user.get("id", "")).encode()),
                        (b"x-replit-user-email", (user.get("email") or "").encode()),
                        (b"x-replit-user-name", (user.get("firstName") or "Operator").encode()),
                        (b"x-replit-user-profile-image",
                         (user.get("profileImageUrl") or "").encode()),
                    ]
                    request.scope["headers"] = list(request.scope.get("headers", [])) + extra
        return await call_next(request)
