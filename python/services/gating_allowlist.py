# 51:30
"""Explicit allowlist of write routes that do NOT require admin gating.

The two-tier write-access model says: anything that alters the research
instrument is owner-only. Two categories of routes legitimately do not need
the admin gate:

  1. Per-user CRUD — the caller can only mutate their own data, and the
     handler enforces ownership via `caller_uid` / `require_owner_of` /
     equivalent owner check on the resource row.

  2. Externally-authenticated webhooks — gated by an HMAC signature
     (e.g. Stripe webhook verifies the `stripe-signature` header against
     STRIPE_WEBHOOK_SECRET). The signature IS the gate; admin role is
     irrelevant because the caller is Stripe, not a human.

  3. Public/anonymous entrypoints — explicitly designed to accept traffic
     from unauthenticated visitors (e.g. guest chat preview, login).

If you add a new write route, either gate it with `require_admin` from
`python/services/gating.py`, OR add a `(file, METHOD, path, justification)`
tuple here. The gating contract test enforces this — adding an ungated,
unallowlisted write route will fail CI.

Format: each entry is (filename, METHOD, path, justification).
"""

from typing import NamedTuple


class AllowEntry(NamedTuple):
    file: str
    method: str
    path: str
    why: str


# Filename basenames that contain ONLY system-mutating routes — these may
# never appear on the allowlist (any write route in these files must be
# owner-gated via require_admin). The contract enforces this.
FORBIDDEN_ALLOWLIST_FILES: frozenset[str] = frozenset({
    "agents.py",       # sub-agent spawn/merge alters shared PCNA
    "bandits.py",      # bandit reward writes shared learning state
    "edcm.py",         # EDCM weights are instrument-level
    "heartbeat_api.py",
    "memory.py",       # memory mutations are instrument-level
    "pcna_api.py",     # PCNA propagation/nudge/flush — instrument core
    "sigma_api.py",
    "system.py",       # system toggles
})


OWNER_OR_PUBLIC_WRITES: list[AllowEntry] = [
    # === Webhooks (HMAC-signature gated) ===
    AllowEntry("billing.py", "POST", "/webhook", "Stripe webhook — STRIPE_WEBHOOK_SECRET HMAC is the gate"),
    AllowEntry("billing.py", "POST", "/internal/promote-ws", "Internal — gated by INTERNAL_API_SECRET header"),

    # === Public / unauthenticated entrypoints ===
    AllowEntry("guest.py", "POST", "/chat", "Guest preview chat — explicitly anonymous"),
    AllowEntry("cli.py", "POST", "/chat", "CLI chat entrypoint — owner-of-resource check on conv_id inside handler"),
    AllowEntry("billing.py", "POST", "/donate", "Anonymous donations are explicitly accepted — the reframe says anyone, logged in or not, can support the instrument"),

    # === Per-user CRUD on caller's own data (uid header + ownership check) ===
    AllowEntry("approval_scopes.py", "POST", "/approval-scopes", "User grants scope to themselves; uid from header"),
    AllowEntry("approval_scopes.py", "DELETE", "/approval-scopes/{scope}", "User revokes their own scope; uid from header"),
    AllowEntry("focus.py", "PUT", "/conversations/{conv_id}/boost", "Owner-of-conv check via _assert_conv_owner"),
    AllowEntry("focus.py", "DELETE", "/conversations/{conv_id}/boost", "Owner-of-conv check via _assert_conv_owner"),
    AllowEntry("focus.py", "POST", "/conversations/{conv_id}/focus", "Owner-of-conv check via _assert_conv_owner"),
    AllowEntry("focus.py", "POST", "/subagent", "Caller spawns sub-agent for their own conv; ownership checked via _assert_conv_owner"),
    AllowEntry("transcripts.py", "POST", "/upload", "Caller uploads to their own quota; uid from header + quota check"),
    AllowEntry("transcripts.py", "POST", "/reports/{report_id}/explain", "Owner-only EDCMbone explainer; ownership checked via get_transcript_report join, billed against caller's own credits"),
    AllowEntry("billing.py", "POST", "/explainer-checkout", "Caller buys their own explainer pack; uid from header"),
    AllowEntry("openai_api.py", "POST", "/hmmm", "Per-user uncertainty signal recorded against caller uid"),
    AllowEntry("billing.py", "POST", "/portal", "Caller opens their own Stripe customer portal"),
    AllowEntry("forge.py", "POST", "/duel", "Stub returning 501 — caller-initiated; no shared state"),
    AllowEntry("forge.py", "POST", "/instantiate", "Forge agent INSERT binds owner_id = uid; per-user"),
    AllowEntry("preferences.py", "PATCH", "/preferences", "Per-user preferences upsert; uid required"),
]


def is_allowlisted(filename: str, method: str, path: str) -> bool:
    """Return True iff the (file, method, path) is on the allowlist.

    Filename is just the basename (e.g. 'billing.py'), method is uppercase,
    path is the @router.{method}(path) literal — no normalization.
    """
    method = method.upper()
    for e in OWNER_OR_PUBLIC_WRITES:
        if e.file == filename and e.method == method and e.path == path:
            return True
    return False


def allowlist_summary() -> dict:
    """Compact summary for the gating audit report."""
    by_file: dict[str, int] = {}
    for e in OWNER_OR_PUBLIC_WRITES:
        by_file[e.file] = by_file.get(e.file, 0) + 1
    return {
        "total": len(OWNER_OR_PUBLIC_WRITES),
        "by_file": dict(sorted(by_file.items())),
    }
# 51:30
