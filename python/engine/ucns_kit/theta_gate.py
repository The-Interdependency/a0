# 20:34 0:0 1:0
"""
theta_gate — capability-gated view of a UCNSObject.

Granted capability → full object returned.
Ungrouped/missing capability → class-only view (anchors and faces cleared).

hmmm: capability taxonomy not yet defined.
      Current allowlist is empty — all capabilities ungrouped by default
      until taxonomy is pinned.
"""
from __future__ import annotations

# === MODULE_BUILD ===
# id: a0_engine_ucns_kit_theta_gate
#   module_name: theta_gate
#   module_kind: engine
#   summary: theta_gate — returns a capability-gated view of a UCNSObject; granted capability yields the full object, ungranted yields a class-only view with anchors/faces cleared.
#   owner: Erin Spencer
#   public_surface: gate
#   internal_surface: none
#   auth_boundary: hmmm
#   storage_boundary: none
#   network_boundary: none
#   user_data_boundary: none
#   admin_only: false
#   tests: hmmm
#   rollout: default_enabled
#   rollback: Revert this file; gate is a pure view filter with no persistent effect.
#   requires: none
#   since: 2026-06-02
#   unresolved: capability taxonomy not yet defined; allowlist is empty so all capabilities are ungrouped by default until pinned.
# === END MODULE_BUILD ===

try:
    from ucns_v04 import UCNSObject
    _EDCMBONE_AVAILABLE = True
except ImportError:
    _EDCMBONE_AVAILABLE = False

# hmmm: capability allowlist not yet specified.
_GRANTED_CAPABILITIES: frozenset[str] = frozenset()


def gate(obj, capability: str) -> object:
    """
    Return a capability-filtered view of obj.

    If capability is in the granted set: return full obj.
    Otherwise: return class-only view with anchors_pos=() and faces_pos=().
    """
    if not _EDCMBONE_AVAILABLE:
        raise RuntimeError(
            "retired local UCNS placement is unavailable"
        )
    if capability in _GRANTED_CAPABILITIES:
        return obj
    return UCNSObject(
        n_dec=obj.n_dec,
        n_min=obj.n_min,
        anchors_pos=(),
        faces_pos=(),
    )
# 20:34 0:0 1:0
