# 29:22
# DOC module: _admin_gate
# DOC label: Admin Gate
# DOC description: Shared write-gate for instrument-wide mutation endpoints.
"""Shared admin / operator gate for routes that mutate global instrument
state (memory seeds, PCNA channels, sigma watches, system toggles, agents,
bandits, deals, discovery drafts).

Two-tier write model from replit.md:
  1. ADMIN — set via ADMIN_USER_ID, ADMIN_EMAIL env vars, or x-user-role: admin.
     Also accepted: any email present in the admin_emails table.
  2. OPERATOR — interdependentway.org operator. Surfaced via the same
     mechanism today (admin email rows). When the operator role
     diverges, add an `operator_emails` table and a second branch here.

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
from sqlalchemy import text as _sql

_ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "")
_ADMIN_USER_ID = os.environ.get("ADMIN_USER_ID", "")


async def require_admin(request: Request) -> None:
    """Raise 403 unless the caller is admin (by user_id, email, or role header)."""
    uid = (request.headers.get("x-user-id") or "").strip()
    email = (request.headers.get("x-user-email") or "").strip().lower()
    role = (request.headers.get("x-user-role") or "user").strip().lower()
    if role == "admin":
        return
    if _ADMIN_USER_ID and uid == _ADMIN_USER_ID:
        return
    if _ADMIN_EMAIL and email == _ADMIN_EMAIL.strip().lower():
        return
    if email:
        try:
            from ..database import get_session
            async with get_session() as sess:
                row = (await sess.execute(
                    _sql("SELECT 1 FROM admin_emails WHERE email = :e"),
                    {"e": email},
                )).first()
                if row:
                    return
        except Exception:
            pass
    raise HTTPException(status_code=403, detail="Admin only")
# 29:22
