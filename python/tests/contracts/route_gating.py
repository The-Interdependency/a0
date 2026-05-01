# 158:51
"""Strict static gating audit — every write endpoint in python/routes/
must call a recognised auth helper (admin / ownership / per-user / API
key resolution / HMAC verification) inside the handler body or signature,
or appear in the small ALLOWLIST of intentionally-public surfaces.

The scanner walks the source tree with `ast` and looks for *Call nodes
whose function name is a known gating helper*, or for FastAPI Depends()
parameters in the handler signature. Substring/comment matches do NOT
count — the contract treats only real call sites as proof of gating.

Allowlist entries point at endpoints that are deliberately public, with
gating that the static scanner cannot see (HMAC signature inside Stripe
webhook handler, INTERNAL_API_SECRET header check, or no per-user state
to gate). Each entry carries a justification.
"""
from __future__ import annotations
import ast
from pathlib import Path

WRITE_METHODS = {"post", "patch", "delete", "put"}

# Names whose Call site (anywhere inside the handler body) counts as
# proof that the route is gated. Each one is a real auth helper that
# raises 401/403 on failure or returns the caller identity.
GATING_CALL_NAMES = {
    # Admin / role gates (cross-module + per-module variants).
    "require_admin",            # python/routes/_admin_gate.require_admin
    "_require_admin",           # python/routes/energy._require_admin
    "_check_admin",             # python/routes/billing._check_admin
    "_admin_only",              # python/routes/chat._admin_only
    "_is_admin",                # python/routes/{artifacts,tools,contexts}._is_admin
    # Per-user identity (raises 401 when missing / 403 on mismatch).
    "_caller_uid",              # python/routes/chat._caller_uid
    "_require_uid",             # python/routes/artifacts._require_uid
    "_user_id",                 # python/routes/forge._user_id
    "_uid",                     # python/routes/{contexts,liminals,zfae_api}._uid
    # Owner enforcement.
    "_require_owner_or_admin",  # python/routes/tools._require_owner_or_admin
    "_owner_404",               # python/routes/runs / approvals
    # Tier-gated wrappers for genuinely user-scoped, non-code-altering
    # surfaces. (NOTE: helpers like `_require_ws` are intentionally NOT
    # listed here — Task #110 forbids ws/pro tiers from satisfying the
    # gate on shared / global / code-altering routes. Those handlers
    # must call `require_admin` directly so that this contract — which
    # is purely static — cannot be quietly weakened by editing a wrapper
    # function body. `_require_scope_grant_access` IS listed because the
    # underlying mutation is per-user state in `approval_scopes` and the
    # tier policy is enforced server-side in `check_scope_grant_tier`.)
    "_require_scope_grant_access",  # approval_scopes — per-user state, tier-gated
    # API-key / OAuth resolution (returns the user; handler raises 401 on None).
    "resolve_cli_key",          # python/routes/cli — Bearer a0k_… resolution
    # HMAC / internal-token surfaces.
    "construct_event",          # stripe.Webhook.construct_event (HMAC verify)
    "verify_webhook_signature", # generic name for HMAC verifiers
}

# (route_path, method) -> reason. Only DELIBERATELY PUBLIC entries.
# Every entry must explain *why* it is safe to leave unauthenticated.
ALLOWLIST: dict[tuple[str, str], str] = {
    ("/api/v1/guest/chat", "post"):
        "Public guest chat surface; rate-limited elsewhere, no per-user "
        "state writes — guest sessions are explicitly scoped.",
    ("/api/v1/billing/webhook", "post"):
        "Stripe webhook; gated inside the handler by HMAC signature "
        "verification (stripe.Webhook.construct_event).",
    ("/api/v1/billing/internal/promote-ws", "post"):
        "Internal promotion endpoint; gated by INTERNAL_API_SECRET via "
        "the x-a0p-internal header check inside the handler.",
}


def _call_callee_name(node: ast.Call) -> str | None:
    """Best-effort: return the name of the function being called.

    Handles:  foo(...) -> 'foo'
              mod.foo(...) -> 'foo'
              a.b.foo(...) -> 'foo'
    """
    fn = node.func
    if isinstance(fn, ast.Name):
        return fn.id
    if isinstance(fn, ast.Attribute):
        return fn.attr
    return None


def _has_gating_call(func: ast.FunctionDef | ast.AsyncFunctionDef) -> bool:
    """True if the handler body contains a Call to any name in GATING_CALL_NAMES."""
    for node in ast.walk(func):
        if isinstance(node, ast.Call):
            name = _call_callee_name(node)
            if name and name in GATING_CALL_NAMES:
                return True
    return False


def _has_depends_param(func: ast.FunctionDef | ast.AsyncFunctionDef) -> bool:
    """True if any function argument has a default of Depends(...).

    FastAPI dependency-injection auth shows up as e.g.
        async def handler(user = Depends(get_current_user)): ...
    """
    args = func.args
    defaults: list[ast.expr] = list(args.defaults) + [
        d for d in args.kw_defaults if d is not None
    ]
    for default in defaults:
        if isinstance(default, ast.Call):
            name = _call_callee_name(default)
            if name == "Depends":
                return True
    return False


def _decorator_route(dec: ast.expr) -> tuple[str, str] | None:
    """If `dec` is `@router.<method>(<path>, ...)`, return (path, method)."""
    if not isinstance(dec, ast.Call):
        return None
    func = dec.func
    if not isinstance(func, ast.Attribute):
        return None
    if not isinstance(func.value, ast.Name) or func.value.id != "router":
        return None
    method = func.attr.lower()
    if method not in WRITE_METHODS:
        return None
    if not dec.args:
        return None
    first = dec.args[0]
    if not isinstance(first, ast.Constant) or not isinstance(first.value, str):
        return None
    return first.value, method


def _router_prefix(tree: ast.Module) -> str:
    """Best-effort extraction of `APIRouter(prefix=...)` from a module."""
    for node in ast.walk(tree):
        if not isinstance(node, ast.Assign):
            continue
        if not isinstance(node.value, ast.Call):
            continue
        callee = node.value.func
        if isinstance(callee, ast.Name) and callee.id == "APIRouter":
            for kw in node.value.keywords:
                if kw.arg == "prefix" and isinstance(kw.value, ast.Constant):
                    return str(kw.value.value)
    return ""


def _scan_module(path: Path) -> list[dict]:
    """Return a list of {path, method, gated, reason} per write route."""
    text = path.read_text(encoding="utf-8")
    try:
        tree = ast.parse(text)
    except SyntaxError as e:
        return [{
            "file": str(path),
            "method": "?",
            "path": f"<unparseable: {e}>",
            "func": "?",
            "gated": False,
            "allowlisted": False,
            "allow_reason": None,
        }]
    prefix = _router_prefix(tree)
    out: list[dict] = []
    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        for dec in node.decorator_list:
            route = _decorator_route(dec)
            if route is None:
                continue
            sub_path, method = route
            full_path = f"{prefix}{sub_path}" if prefix else sub_path
            gated = _has_gating_call(node) or _has_depends_param(node)
            allow = ALLOWLIST.get((full_path, method))
            try:
                rel_file = str(path.relative_to(Path.cwd()))
            except ValueError:
                rel_file = path.name
            out.append({
                "file": rel_file,
                "method": method,
                "path": full_path,
                "func": node.name,
                "gated": gated,
                "allowlisted": bool(allow),
                "allow_reason": allow,
            })
    return out


async def test_every_write_route_is_gated() -> None:
    """Walk python/routes/, collect every POST/PATCH/DELETE/PUT, assert
    each calls an auth helper (or has a Depends() parameter), or appears
    in the deliberately-public ALLOWLIST."""
    routes_dir = Path(__file__).resolve().parents[2] / "routes"
    assert routes_dir.is_dir(), f"routes dir missing: {routes_dir}"

    findings: list[dict] = []
    for py in sorted(routes_dir.glob("*.py")):
        if py.name.startswith("__"):
            continue
        # billing_helpers.py is now a legacy shim with no @router routes;
        # skipping it keeps the audit focused on actual mounted endpoints.
        if py.name in {"billing_helpers.py", "_admin_gate.py"}:
            continue
        findings.extend(_scan_module(py))

    assert findings, "no write routes found — scanner is broken"

    ungated = [f for f in findings if not f["gated"] and not f["allowlisted"]]
    if ungated:
        lines = [
            f"  - {f['method'].upper():6s} {f['path']}  "
            f"({f['file']}::{f['func']})"
            for f in ungated
        ]
        raise AssertionError(
            "the following write endpoints are ungated and not in the "
            "ALLOWLIST — call require_admin(), _caller_uid(), _require_uid(), "
            "_check_admin(), resolve_cli_key(), construct_event(), or add a "
            "Depends(...) auth dependency. Or, if the route is deliberately "
            "public, add an ALLOWLIST entry with a justification:\n"
            + "\n".join(lines)
        )

    # Sanity: every allowlist entry must still resolve to a real route.
    seen = {(f["path"], f["method"]) for f in findings}
    stale = [k for k in ALLOWLIST if k not in seen]
    assert not stale, (
        f"stale ALLOWLIST entries (route no longer exists): {stale}"
    )
# 158:51
