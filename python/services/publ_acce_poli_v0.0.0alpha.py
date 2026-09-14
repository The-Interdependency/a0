# 61:19 3:3 2:1
# === MODULE_BUILD ===
# id: a0_public_provider_policy
#   module_name: public provider policy
#   module_kind: service
#   summary: Keeps public free-tier inference on a bounded, configurable set of economical providers and lanes.
#   owner: Erin Spencer
#   public_surface: PublicAccessDenied, enforce_public_provider_policy, enforce_public_fleet_policy, public_provider_allowlist
#   internal_surface: _positive_int_env, _DEFAULT_PUBLIC_PROVIDERS
#   auth_boundary: read
#   storage_boundary: none
#   network_boundary: none
#   user_data_boundary: none
#   admin_only: false
#   tests: tests/test_publ_acce_poli_v0.0.0alpha.py
#   rollout: default_enabled for free tier; environment-configurable provider allowlist and lane cap
#   rollback: Stop calling enforce_public_provider_policy; no persistent state is written.
# === END MODULE_BUILD ===
"""Cost and fan-out boundary for the donation-funded public tier."""

from __future__ import annotations

import os
from collections.abc import Iterable


class PublicAccessDenied(PermissionError):
    """A free-tier request exceeds the configured public inference boundary."""


_DEFAULT_PUBLIC_PROVIDERS = (
    "deepseek",
    "openai",
    "openai-nano",
    "gemini",
    "gemini-lite",
    "claude-haiku",
    "grok",
    "grok-fast-nr",
    "grok-code",
)


def _positive_int_env(name: str, fallback: int) -> int:
    try:
        value = int(os.environ.get(name, ""))
    except ValueError:
        return fallback
    return value if value > 0 else fallback


def public_provider_allowlist() -> frozenset[str]:
    raw = os.environ.get("PUBLIC_PROVIDER_ALLOWLIST", "")
    values = tuple(part.strip() for part in raw.split(",") if part.strip())
    return frozenset(values or _DEFAULT_PUBLIC_PROVIDERS)


def enforce_public_provider_policy(
    tier: str,
    orchestration_mode: str,
    provider_ids: Iterable[str],
) -> None:
    if tier != "free":
        return

    providers = tuple(str(pid).strip() for pid in provider_ids if str(pid).strip())
    if not providers:
        raise PublicAccessDenied("No public inference provider was selected")

    allowed = public_provider_allowlist()
    blocked = [provider for provider in providers if provider not in allowed]
    if blocked:
        raise PublicAccessDenied(
            "That model is not available in the donation-funded public tier"
        )

    max_lanes = _positive_int_env("PUBLIC_MAX_PROVIDER_LANES", 2)
    if orchestration_mode != "single" and len(providers) > max_lanes:
        raise PublicAccessDenied(
            f"Public multi-provider runs are limited to {max_lanes} lanes"
        )


def enforce_public_fleet_policy(tier: str, contestants: Iterable[object]) -> None:
    providers: list[str] = []
    for raw in contestants:
        contestant = raw if hasattr(raw, "get") else {}
        orch = contestant.get("orchestration_mode") or "single"  # type: ignore[union-attr]
        if orch == "single":
            providers.append(contestant["provider_id"])  # type: ignore[index]
        else:
            providers.extend(
                list(contestant.get("providers") or [])  # type: ignore[union-attr]
                or [contestant["provider_id"]]  # type: ignore[index]
            )
    enforce_public_provider_policy(
        tier, "fan_out" if len(providers) > 1 else "single", providers
    )
# 61:19 3:3 2:1
