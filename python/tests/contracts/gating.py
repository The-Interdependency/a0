# 129:49
"""Gating contract — enforces the two-tier write-access model.

Doctrine: every write route (POST/PATCH/PUT/DELETE) under python/routes/
must satisfy ONE of the following:

  (a) The handler body calls a recognized owner/admin gate within the
      first ~80 lines of its source. Recognized gates:
        - require_admin( ... )                  [canonical, from gating.py]
        - is_admin( ... )                       [canonical check]
        - _is_admin(                            [legacy per-file helpers]
        - _require_owner_or_admin(
        - _require_owner_of_(
        - _assert_conv_owner(
        - _assert_owner(
        - require_owner_of(
        - INTERNAL_API_SECRET                   [internal-secret-gated]
        - x-internal-secret                     [internal-secret header]
        - stripe.Webhook.construct_event        [stripe HMAC verification]

  (b) The (file, METHOD, path) is on the explicit allowlist in
      python/services/gating_allowlist.py with a written justification.

Routes failing both are ungated mutation surfaces — adding such a route
fails this contract loudly. This is exactly the trip-wire the user asked
for after the "two tiers, owner vs everyone" reframe.
"""

from __future__ import annotations

import re
from pathlib import Path

_ROUTES_DIR = Path(__file__).resolve().parents[2] / "routes"

_DECORATOR_RE = re.compile(
    r'@router\.(post|patch|put|delete)\(\s*"([^"]+)"',
    re.IGNORECASE,
)

_GATE_PATTERNS = [
    # Canonical helpers (from python/services/gating.py)
    "require_admin(",
    "is_admin(",
    "require_owner_of(",
    # Legacy per-file admin checks (still valid; treat as gated)
    "_is_admin(",
    "_check_admin(",
    "caller_is_admin",
    "_require_owner_or_admin(",
    "_require_owner_of_(",
    "_require_ws(",
    # Owner-of-resource helpers
    "_assert_conv_owner(",
    "_assert_owner(",
    "_require_owned_conv(",
    "_get_owned_benchmark(",
    "AND owner_id = :uid",
    "AND user_id = :uid",
    "owner_id = :uid",
    # External-auth gates
    "INTERNAL_API_SECRET",
    "x-internal-secret",
    "stripe.Webhook.construct_event",
]

_HANDLER_LOOKAHEAD_LINES = 80


def _scan_route_file(path: Path) -> list[dict]:
    """Return one dict per write route in the file: {method, path, gated}."""
    src = path.read_text()
    lines = src.splitlines()
    out: list[dict] = []
    for m in _DECORATOR_RE.finditer(src):
        method = m.group(1).upper()
        route_path = m.group(2)
        # Find which line the decorator is on
        line_no = src[: m.start()].count("\n")
        # Look at the next ~80 lines for a gate pattern
        window = "\n".join(lines[line_no : line_no + _HANDLER_LOOKAHEAD_LINES])
        gated = any(pat in window for pat in _GATE_PATTERNS)
        out.append({"method": method, "path": route_path, "gated": gated})
    return out


def test_every_write_route_is_gated_or_allowlisted() -> None:
    """Walk every write route; each must be gated OR allowlisted."""
    from python.services.gating_allowlist import is_allowlisted, OWNER_OR_PUBLIC_WRITES

    assert _ROUTES_DIR.is_dir(), f"routes dir missing: {_ROUTES_DIR}"

    failures: list[str] = []
    total = 0
    gated_count = 0
    allowlisted_count = 0

    for py in sorted(_ROUTES_DIR.glob("*.py")):
        if py.name.startswith("_"):
            continue
        for entry in _scan_route_file(py):
            total += 1
            if entry["gated"]:
                gated_count += 1
                continue
            if is_allowlisted(py.name, entry["method"], entry["path"]):
                allowlisted_count += 1
                continue
            failures.append(
                f"  {py.name}: {entry['method']} {entry['path']} "
                f"— ungated and not on allowlist"
            )

    if failures:
        msg = (
            f"\n{len(failures)} write route(s) lack admin gate AND are not on "
            f"the allowlist. Either add a gate via "
            f"python/services/gating.py::require_admin, or add a justified "
            f"entry to python/services/gating_allowlist.py.\n\n"
            + "\n".join(failures)
            + f"\n\nTotals: {total} write routes; "
            f"{gated_count} gated; {allowlisted_count} allowlisted; "
            f"{len(failures)} ungated."
        )
        raise AssertionError(msg)


def test_allowlist_entries_correspond_to_real_routes() -> None:
    """Every allowlist entry must correspond to a real route in the codebase.

    Catches the failure mode where someone allowlists a route, then the route
    is renamed/deleted, and the allowlist entry silently drifts. Stale
    allowlist entries are how gating gaps creep back in.
    """
    from python.services.gating_allowlist import OWNER_OR_PUBLIC_WRITES

    real: set[tuple[str, str, str]] = set()
    for py in sorted(_ROUTES_DIR.glob("*.py")):
        if py.name.startswith("_"):
            continue
        for entry in _scan_route_file(py):
            real.add((py.name, entry["method"], entry["path"]))

    stale: list[str] = []
    for e in OWNER_OR_PUBLIC_WRITES:
        if (e.file, e.method, e.path) not in real:
            stale.append(f"  {e.file}: {e.method} {e.path} ({e.why!r})")

    if stale:
        raise AssertionError(
            f"\n{len(stale)} stale allowlist entry/entries — route no longer "
            f"exists at the listed (file, method, path):\n" + "\n".join(stale)
        )


def test_instrument_mutation_files_are_never_allowlisted() -> None:
    """Files containing instrument-level mutation routes can NEVER use the
    allowlist escape hatch — they must be owner-gated via require_admin.

    This is the trip-wire that catches the failure mode the architect found:
    someone "allowlists" a route in agents.py / pcna_api.py / edcm.py with a
    plausible-sounding justification ("per-user", "scoped to caller") even
    though the route mutates shared instrument state. The doctrine is hard:
    if it can change the instrument, only the owner may call it.
    """
    from python.services.gating_allowlist import (
        FORBIDDEN_ALLOWLIST_FILES,
        OWNER_OR_PUBLIC_WRITES,
    )

    violations: list[str] = []
    for e in OWNER_OR_PUBLIC_WRITES:
        if e.file in FORBIDDEN_ALLOWLIST_FILES:
            violations.append(
                f"  {e.file}: {e.method} {e.path} ({e.why!r}) — file is "
                f"instrument-mutation, must be owner-gated, not allowlisted"
            )

    if violations:
        raise AssertionError(
            f"\n{len(violations)} forbidden allowlist entry/entries — these "
            f"files contain instrument-mutation routes and must use "
            f"require_admin gating, not the allowlist:\n"
            + "\n".join(violations)
        )


def test_instrument_mutation_files_have_all_writes_gated() -> None:
    """Belt-and-suspenders: every write route inside a FORBIDDEN_ALLOWLIST_FILE
    must visibly call a recognized gate. Catches the failure mode where the
    file as a whole is "forbidden from allowlist" but a specific route inside
    silently lacks any gate at all (would still be caught by the
    every-write-route-is-gated-or-allowlisted contract, but this gives a
    sharper, file-scoped failure message)."""
    from python.services.gating_allowlist import FORBIDDEN_ALLOWLIST_FILES

    failures: list[str] = []
    for py in sorted(_ROUTES_DIR.glob("*.py")):
        if py.name not in FORBIDDEN_ALLOWLIST_FILES:
            continue
        for entry in _scan_route_file(py):
            if not entry["gated"]:
                failures.append(
                    f"  {py.name}: {entry['method']} {entry['path']} "
                    f"— instrument-mutation file, route lacks require_admin"
                )

    if failures:
        raise AssertionError(
            f"\n{len(failures)} ungated write route(s) inside "
            f"instrument-mutation file(s):\n" + "\n".join(failures)
        )
# 129:49
