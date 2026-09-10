# 55:30 0:0 1:0
"""Read standalone a0 model adapters from the canonical provider registry."""
from __future__ import annotations

# === MODULE_BUILD ===
# id: a0_provider_registry
#   module_name: provider_registry
#   module_kind: service
#   summary: Resolves explicit or auto-selected OpenAI-compatible standalone a0 providers from python/config/providers.json.
#   owner: Erin Spencer
#   public_surface: load_provider_registry, resolve_openai_compatible_provider
#   internal_surface: _is_openai_compatible
#   auth_boundary: none
#   storage_boundary: read
#   network_boundary: none
#   user_data_boundary: none
#   admin_only: false
#   tests: tests/test_aone_open_comp_adap_v0.0.0alpha.py
#   rollout: default_enabled
#   rollback: Remove this module and restore router selection to Claude/local only.
#   requires: none
#   since: 2026-09-07
#   unresolved: none
# === END MODULE_BUILD ===

# === CONTRACTS ===
# id: a0_provider_selection
#   given: optional A0_PROVIDER, canonical provider registry data, and process credentials
#   then: an explicit compatible provider resolves or fails closed, deprecated provider aliases resolve to their canonical provider, and an unset choice may auto-select only a configured a0_default provider
#   class: correctness
#   since: 2026-09-07
# === END CONTRACTS ===

import json
import os
from pathlib import Path
from typing import Any

_PROVIDERS_PATH = Path(__file__).resolve().parents[1] / "python" / "config" / "providers.json"


def load_provider_registry() -> dict[str, dict[str, Any]]:
    with _PROVIDERS_PATH.open("r", encoding="utf-8") as handle:
        document = json.load(handle)
    return document["providers"]


def _is_openai_compatible(spec: dict[str, Any]) -> bool:
    return spec.get("adapter") == "openai-compatible" or spec.get("vendor") == "openai"


def _resolve_alias(
    providers: dict[str, dict[str, Any]],
    provider_id: str,
) -> tuple[str, dict[str, Any]]:
    """Resolve one registry-declared provider alias without provider literals."""
    spec = providers[provider_id]
    canonical_id = str(spec.get("deprecated_alias_for") or "").strip()
    if not canonical_id:
        return provider_id, spec
    canonical = providers.get(canonical_id)
    if canonical is None:
        raise ValueError(
            f"A0_PROVIDER {provider_id!r} aliases missing provider {canonical_id!r}"
        )
    if canonical.get("deprecated_alias_for"):
        raise ValueError(
            f"A0_PROVIDER {provider_id!r} has a chained provider alias"
        )
    return canonical_id, canonical


def resolve_openai_compatible_provider(
    provider_id: str | None = None,
) -> tuple[str, dict[str, Any]] | None:
    """Resolve an explicit provider or the first configured a0_default entry."""
    providers = load_provider_registry()
    explicit = (provider_id or os.environ.get("A0_PROVIDER", "")).strip()
    if explicit:
        spec = providers.get(explicit)
        if spec is None:
            raise ValueError(f"Unknown A0_PROVIDER: {explicit!r}")
        canonical_id, spec = _resolve_alias(providers, explicit)
        if not _is_openai_compatible(spec):
            raise ValueError(
                f"A0_PROVIDER {explicit!r} does not use the openai-compatible adapter"
            )
        return canonical_id, spec

    for candidate, spec in providers.items():
        api_key_env = str(spec.get("api_key_env") or "")
        if (
            spec.get("a0_default")
            and _is_openai_compatible(spec)
            and api_key_env
            and os.environ.get(api_key_env)
        ):
            return candidate, spec
    return None
# 55:30 0:0 1:0
