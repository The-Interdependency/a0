# 25:69
"""Canonical access-control helpers for a0p.

Two-tier write-access model — owner (Erin + invitees with `role == 'admin'`)
vs everyone else. Anything that alters the instrument's code, configuration,
shared learning state, or system-level toggles must be gated by `require_admin`.
Per-user CRUD on caller's own data is NOT subject to the admin gate — those
routes are listed explicitly in `gating_allowlist.py` and verified by the
gating contract test.

Doctrine: this is the ONLY place that defines what "owner" means at the HTTP
header level. If you find another implementation in routes/, replace it with
a call to `is_admin` / `require_admin` here. Multiple implementations of the
same gate are how silent regressions happen.
"""

from fastapi import HTTPException, Request


def is_admin(request: Request) -> bool:
    """Return True iff the caller's role header is 'admin'.

    The `x-user-role` header is set by the upstream auth proxy after it has
    authenticated the user against the users table. A header alone is not
    trust-by-itself — it is trusted because the proxy is the only thing in
    front of this server.
    """
    return (request.headers.get("x-user-role") or "").strip().lower() == "admin"


def caller_uid(request: Request) -> str | None:
    """Return the caller's user_id, or None if unauthenticated.

    Useful for owner-of-resource checks where the resource has a `user_id` field.
    """
    uid = (request.headers.get("x-user-id") or "").strip()
    return uid or None


def require_admin(request: Request) -> str:
    """Raise 403 unless the caller is admin. Returns the caller's uid.

    Doctrine: every system-level write route (anything that mutates shared
    learning state, config, code/modules, or instrument toggles) must call
    this at the top of its handler, OR the route must be explicitly listed
    in `gating_allowlist.py::OWNER_OR_PUBLIC_WRITES` with a justification.
    """
    if not is_admin(request):
        raise HTTPException(
            status_code=403,
            detail="This action alters the research instrument and is restricted to the owner.",
        )
    uid = caller_uid(request)
    if not uid:
        # Admin role with no uid is malformed — auth proxy bug.
        raise HTTPException(status_code=401, detail="Admin role without user id")
    return uid


def require_owner_of(request: Request, resource_user_id: str | None) -> str:
    """Raise 403 unless the caller owns the resource (or is admin).

    Used for per-user CRUD where the resource has a `user_id` foreign key.
    Admins can act on any user's resource; everyone else can only act on
    resources they own.
    """
    uid = caller_uid(request)
    if not uid:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if is_admin(request):
        return uid
    if resource_user_id and resource_user_id != uid:
        raise HTTPException(status_code=403, detail="Not the owner of this resource")
    return uid


# === CONTRACTS ===
# id: gating_every_write_route_is_admin_or_allowlisted
#   given: every @router.{post,patch,put,delete} in python/routes/
#   then:  the handler body within ~80 lines either calls a recognized
#          owner/admin gate (require_admin, _is_admin, _require_ws,
#          _require_owned_conv, etc.) OR the (file, METHOD, path) is
#          on the explicit allowlist in
#          python/services/gating_allowlist.py
#   class: security
#   call:  python.tests.contracts.gating.test_every_write_route_is_gated_or_allowlisted
#
# id: gating_allowlist_entries_are_real_routes
#   given: every entry in OWNER_OR_PUBLIC_WRITES
#   then:  the (file, method, path) corresponds to a real
#          @router.{method}(path) in the codebase (no stale entries
#          pointing at deleted/renamed routes)
#   class: security
#   call:  python.tests.contracts.gating.test_allowlist_entries_correspond_to_real_routes
#
# id: gating_instrument_files_never_allowlisted
#   given: FORBIDDEN_ALLOWLIST_FILES (agents.py, bandits.py, edcm.py,
#          memory.py, pcna_api.py, sigma_api.py, system.py, heartbeat_api.py)
#   then:  no entry in OWNER_OR_PUBLIC_WRITES references any of these files
#          — instrument-mutation routes must be owner-gated, never allowlisted
#   class: security
#   call:  python.tests.contracts.gating.test_instrument_mutation_files_are_never_allowlisted
#
# id: gating_instrument_files_all_writes_gated
#   given: every @router.{post,patch,put,delete} inside a
#          FORBIDDEN_ALLOWLIST_FILE
#   then:  the handler body visibly calls require_admin (or another
#          recognized gate). File-scoped sharper failure than the global
#          contract — pinpoints instrument files that regress.
#   class: security
#   call:  python.tests.contracts.gating.test_instrument_mutation_files_have_all_writes_gated
# === END CONTRACTS ===
# 25:69
