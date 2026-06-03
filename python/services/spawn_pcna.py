# 53:40 0:0 1:3
"""spawn_pcna — provider resolution and PCNA helpers for the spawn executor.

Owns: resolve_provider (active/explicit), snapshot_pcna, try_get_primary_pcna,
and retire_fork_quietly. All functions are pure helpers — no DB writes.
"""
from __future__ import annotations

# === MODULE_BUILD ===
# id: a0_service_spawn_pcna
#   module_name: spawn_pcna
#   module_kind: service
#   summary: Provider-resolution and PCNA helpers for the spawn executor — resolve_provider (active/explicit), snapshot_pcna, try_get_primary_pcna, and retire_fork_quietly; all pure helpers with no DB writes.
#   owner: Erin Spencer
#   public_surface: none
#   internal_surface: _resolve_provider, _snapshot_pcna, _try_get_primary_pcna, _retire_fork_quietly
#   auth_boundary: none
#   storage_boundary: none
#   network_boundary: internal
#   user_data_boundary: none
#   admin_only: false
#   tests: hmmm
#   rollout: default_enabled
#   rollback: Revert this file; spawn provider/PCNA helpers revert to prior behavior.
#   requires: a0_service_energy_registry
#   since: 2026-06-02
#   unresolved: none
# === END MODULE_BUILD ===

import json
from typing import Any, Optional

from .energy_registry import active_provider as _energy_active_provider

_SENTINEL_ACTIVE = "active"


async def _resolve_provider(
    providers: Any,
    *,
    parent_pcna: Any = None,
) -> str:
    """Resolve the providers field to a provider_id string.

    "active"  → active_provider() (conduct slot in model_instances).
    Explicit  → returned as-is.
    Malformed → raises ValueError (no silent fallback).
    """
    if isinstance(providers, str):
        try:
            providers = json.loads(providers)
        except json.JSONDecodeError as exc:
            raise ValueError(f"providers field not valid JSON: {exc}") from exc
    if not isinstance(providers, list) or not providers:
        raise ValueError("providers list is empty or wrong shape")
    pid = str(providers[0]).strip()
    if not pid:
        raise ValueError("first provider entry is empty")
    if pid == _SENTINEL_ACTIVE:
        try:
            return await _energy_active_provider()
        except RuntimeError as e:
            raise ValueError(str(e)) from e
    return pid


def _snapshot_pcna(p: Any) -> dict:
    """Capture the four observable PCNA quantities used as merge deltas.

    Cheap — reads four floats off in-memory ring state. Call before and
    after absorb to compute the learning gain.
    """
    return {
        "phi": round(float(p.phi.ring_coherence), 6),
        "psi": round(float(p.psi.ring_coherence), 6),
        "omega": round(float(p.omega.ring_coherence), 6),
        "theta_circles": int(p.theta.circle_count.mean()),
    }


def _try_get_primary_pcna() -> tuple[Any, Optional[str]]:
    """Return (primary_pcna_or_None, error_reason_or_None).

    Lazy import from python.main (where the singleton lives) so this module
    stays importable during early bootstrap. The two-value return surfaces
    WHY the PCNA was unreachable — a real bug never masquerades as a benign
    'primary unavailable' skip.
    """
    try:
        from ..main import get_pcna
    except Exception as exc:
        return None, f"import_failed: {type(exc).__name__}: {exc}"[:200]
    try:
        p = get_pcna()
    except Exception as exc:
        return None, f"call_failed: {type(exc).__name__}: {exc}"[:200]
    if p is None:
        return None, "get_pcna_returned_none"
    return p, None


def _retire_fork_quietly(parent_pcna: Any, sub_name: str) -> None:
    """Best-effort PCNA fork cleanup for failure paths. Never raises."""
    if not sub_name or parent_pcna is None:
        return
    try:
        from .agent_lifecycle import merge_sub_agent
        merge_sub_agent(parent_pcna, sub_name)
    except Exception:
        pass
# 53:40 0:0 1:3
