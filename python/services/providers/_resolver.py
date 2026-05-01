# 40:30
"""resolve_model_for_role — env > seed > spec primary.

Purpose: every provider module asks one question on every call:
"given the role I'm being asked to fulfil, which concrete model id should
I send to the API?" This module is the only allowed answer.

Resolution order (highest precedence first):
  1. Env var `<PROVIDER>_MODEL_<ROLE>` (uppercase, e.g. CLAUDE_MODEL_CONDUCT,
     OPENAI_MODEL_PERFORM, GROK_MODEL_PRACTICE). Env wins so an operator can
     pin a model without touching DB or code.
  2. Persisted seed `route_config.model_assignments[role]` for that provider
     (the admin UI's writable surface — see routes/energy.py).
  3. Provider spec primary (`BUILTIN_PROVIDERS[provider_id]["model"]`) which
     comes from python/config/providers.json. This is the doctrine baseline.

Raises ValueError if none of the three yields a model id — no silent
fallback to any default, since silent fallbacks burn user trust harder
than failing loudly with a real exception.
"""
from __future__ import annotations

import os

from sqlalchemy import text as sa_text

from ...database import get_session
from ..energy_registry import BUILTIN_PROVIDERS

# Env-var prefix per provider id. Keep in sync with providers.json. The
# OPENAI_MODEL_<ROLE> set is also consumed by openai_router._MODEL_ENV_MAP
# for backward-compat with policy-based routing on the openai path.
_PROVIDER_ENV_PREFIX: dict[str, str] = {
    "openai": "OPENAI_MODEL_",
    "openai-5.5": "OPENAI_5_5_MODEL_",
    "openai-5.5-pro": "OPENAI_5_5_PRO_MODEL_",
    "grok": "GROK_MODEL_",
    "gemini": "GEMINI_MODEL_",
    "gemini3": "GEMINI3_MODEL_",
    "claude": "CLAUDE_MODEL_",
}


async def resolve_model_for_role(provider_id: str, role: str) -> str:
    """Resolve to a concrete model id, raising on failure.

    Args:
      provider_id: one of openai, grok, gemini, gemini3, claude
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
    # 2. Seed model_assignments
    async with get_session() as session:
        row = (await session.execute(
            sa_text("SELECT route_config FROM ws_modules WHERE slug = :slug"),
            {"slug": f"provider_{provider_id}"},
        )).mappings().first()
    if row and isinstance(row["route_config"], dict):
        ma = row["route_config"].get("model_assignments") or {}
        if isinstance(ma.get(role_norm), str) and ma[role_norm].strip():
            return ma[role_norm].strip()
    # 3. Spec primary (providers.json baseline)
    spec = BUILTIN_PROVIDERS.get(provider_id, {})
    primary = (spec.get("model") or "").strip()
    if primary:
        return primary
    raise ValueError(
        f"No model resolvable for provider={provider_id!r} role={role_norm!r} "
        f"(checked env {prefix or '?'}{role_norm.upper()}, seed model_assignments, "
        f"and providers.json primary)"
    )
# 40:30
