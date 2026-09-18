# 12:19 0:0 11:2
# DOC module: _admin_gate
# DOC label: Admin Gate
# DOC description: Shared write-gate for instrument-wide mutation endpoints.
# DOC tier: admin
# DOC role: service
"""Shared admin / operator gate for routes that mutate global instrument
state (memory seeds, PCNA channels, sigma watches, system toggles, agents, deals).

Authority comes from the stored role injected by Express or an operator-configured
immutable ADMIN_USER_ID. Signup email text and admin_emails rows confer no access.

Use:
    from ._admin_gate import require_admin
    @router.post("/whatever")
    async def handler(req: Request, ...):
        await require_admin(req)
        ...

The contract test python/tests/contracts/route_gating.py treats a Call to
`require_admin` (or `_require_admin`) as proof of gating.
"""
from __future__ import annotations
import os
from fastapi import HTTPException, Request

_ADMIN_USER_ID = os.environ.get("ADMIN_USER_ID", "")


async def require_admin(request: Request) -> None:
    """Raise 403 unless the caller is admin (by immutable user_id or authenticated role)."""
    uid = (request.headers.get("x-user-id") or "").strip()
    role = (request.headers.get("x-user-role") or "user").strip().lower()
    if role == "admin":
        return
    if _ADMIN_USER_ID and uid == _ADMIN_USER_ID:
        return
    raise HTTPException(status_code=403, detail="Admin only")
# 12:19 0:0 11:2
