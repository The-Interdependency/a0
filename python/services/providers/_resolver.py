# 30:45 0:0 5:1
"""resolve_model_for_role — env > spec primary.

Purpose: every provider module asks one question on every call:
"given the role I'm being asked to fulfil, which concrete model id should
I send to the API?" This module is the only allowed answer.

Resolution order (highest precedence first):
  1. Env var `<PROVIDER>_MODEL_<ROLE>` (uppercase, e.g. CLAUDE_MODEL_CONDUCT,
     OPENAI_MODEL_PERFORM, GROK_MODEL_PRACTICE). Env wins so an operator can
     pin a model without touching DB or code.
  2. Provider spec primary (`BUILTIN_PROVIDERS[provider_id]["model"]`) which
     comes from python/config/providers.json. This is the doctrine baseline.

Raises ValueError if neither yields a model id — no silent fallback.
"""
from __future__ import annotations

# === MODULE_BUILD ===
# id: a0_service_providers_resolver
#   module_name: _resolver
#   module_kind: service
#   summary: resolve_model_for_role — the single answer to "given a role, which concrete model id should this provider send?", resolving env-var override first then the provider spec primary from providers.json.
#   owner: Erin Spencer
#   public_surface: resolve_model_for_role
#   internal_surface: _PROVIDER_ENV_PREFIX
#   auth_boundary: none
#   storage_boundary: none
#   network_boundary: none
#   user_data_boundary: none
#   admin_only: false
#   tests: hmmm
#   rollout: default_enabled
#   rollback: Revert this file; provider model resolution reverts to prior env/spec precedence.
#   requires: a0_service_energy_registry
#   since: 2026-06-02
#   unresolved: none
# === END MODULE_BUILD ===

import os

from ..energy_registry import BUILTIN_PROVIDERS

# Env-var prefix per provider id. Keep in sync with providers.json. The
# OPENAI_MODEL_<ROLE> set is also consumed by openai_router._MODEL_ENV_MAP
# for backward-compat with policy-based routing on the openai path.
_PROVIDER_ENV_PREFIX: dict[str, str] = {
    "openai": "OPENAI_MODEL_",
    "openai-5.5": "OPENAI_5_5_MODEL_",
    "openai-5.5-pro": "OPENAI_5_5_PRO_MODEL_",
    "grok": "GROK_MODEL_",
    "deepseek": "DEEPSEEK_MODEL_",
    "deepseek-pro": "DEEPSEEK_PRO_MODEL_",
    "gemini": "GEMINI_MODEL_",
    "gemini3": "GEMINI3_MODEL_",
    "claude": "CLAUDE_MODEL_",
}


async def resolve_model_for_role(provider_id: str, role: str) -> str:
    """Resolve to a concrete model id, raising on failure.

    Args:
      provider_id: one of openai, grok, deepseek, gemini, gemini3, claude
      role: one of conduct, perform, practice, record, derive

    Raises:
      ValueError: when no env var, seed assignment, or spec primary yields
                  a non-empty model id for the (provider, role) pair.
    """
    role_norm = role.lower().strip()
    # 1. Env override
    prefix = _PROVIDER_ENV_PREFIX.get(provider_id)
    if prefix:
        env_key = f"{prefix}{role_norm.upper()}"
        val = os.environ.get(env_key, "").strip()
        if val:
            return val
    # 2. Spec primary (providers.json baseline)
    spec = BUILTIN_PROVIDERS.get(provider_id, {})
    primary = (spec.get("model") or "").strip()
    if primary:
        return primary
    raise ValueError(
        f"No model resolvable for provider={provider_id!r} role={role_norm!r} "
        f"(checked env {prefix or '?'}{role_norm.upper()} and providers.json primary)"
    )
# 30:45 0:0 5:1
