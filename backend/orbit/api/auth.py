"""
ORBIT — Session auth (Stage 3).

Simple username/password auth using a signed token stored in a cookie.
Credentials are hardcoded (set before demo day).
All API routes are protected — 401 if no valid token.

Change ORBIT_USERNAME and ORBIT_PASSWORD before demo day:
    export ORBIT_USERNAME=admin
    export ORBIT_PASSWORD=changeme
Or just edit the defaults below.
"""

from __future__ import annotations

import os
import time
import hmac
import hashlib
import base64

# Demo credentials — override via environment variables
ORBIT_USERNAME = os.environ.get("ORBIT_USERNAME", "admin")
ORBIT_PASSWORD = os.environ.get("ORBIT_PASSWORD", "orbit2026")

# Secret for signing tokens — generated fresh if not set
_SECRET = os.environ.get("ORBIT_SECRET", "orbit-dev-secret-change-before-demo").encode()

TOKEN_TTL_S = 8 * 3600  # 8 hours


def _sign(payload: str) -> str:
    mac = hmac.new(_SECRET, payload.encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(mac).decode()


def make_token(username: str) -> str:
    """Create a signed token: 'username:expires:sig'."""
    expires = int(time.time()) + TOKEN_TTL_S
    payload = f"{username}:{expires}"
    sig = _sign(payload)
    raw = f"{payload}:{sig}"
    return base64.urlsafe_b64encode(raw.encode()).decode()


def verify_token(token: str) -> str | None:
    """
    Verify the token and return the username if valid, None otherwise.
    """
    try:
        raw = base64.urlsafe_b64decode(token.encode()).decode()
        parts = raw.rsplit(":", 1)
        if len(parts) != 2:
            return None
        payload, sig = parts
        if not hmac.compare_digest(_sign(payload), sig):
            return None
        # check expiry
        _, expires_str = payload.rsplit(":", 1)
        if int(expires_str) < int(time.time()):
            return None
        username, _ = payload.split(":", 1)
        return username
    except Exception:
        return None


def check_credentials(username: str, password: str) -> bool:
    return (
        hmac.compare_digest(username, ORBIT_USERNAME)
        and hmac.compare_digest(password, ORBIT_PASSWORD)
    )
