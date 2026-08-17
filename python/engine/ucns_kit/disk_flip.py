# 17:30
"""
disk_flip — provisional dual operation on UCNSObject.

hmmm: spec law "disk_flip(open-mark) = close-mark" not yet verified
      against ucns_v04.multiply. Provisional: swap n_dec and n_min.
      Provisional status propagates to any consumer of this module.
"""
from __future__ import annotations

# === MODULE_BUILD ===
# id: a0_engine_ucns_kit_disk_flip
#   module_name: disk_flip
#   module_kind: engine
#   summary: disk_flip — provisional dual operation on a UCNSObject that swaps n_dec and n_min (open-mark/close-mark duality), pending verification against ucns_v04.multiply.
#   owner: Erin Spencer
#   public_surface: disk_flip
#   internal_surface: none
#   auth_boundary: none
#   storage_boundary: none
#   network_boundary: none
#   user_data_boundary: none
#   admin_only: false
#   tests: hmmm
#   rollout: default_enabled
#   rollback: Revert this file; provisional dual op with no persistent effect.
#   requires: none
#   since: 2026-06-02
#   unresolved: Spec law disk_flip(open-mark)=close-mark not yet verified against ucns_v04.multiply; provisional status propagates to consumers.
# === END MODULE_BUILD ===

try:
    from ucns_v04 import UCNSObject
    _EDCMBONE_AVAILABLE = True
except ImportError:
    _EDCMBONE_AVAILABLE = False


def disk_flip(obj) -> object:
    """
    Return the disk-dual of obj.

    Provisional: swap n_dec and n_min; pass anchors_pos and faces_pos through.
    """
    if not _EDCMBONE_AVAILABLE:
        raise RuntimeError(
            "retired local UCNS placement is unavailable"
        )
    return UCNSObject(
        n_dec=obj.n_min,
        n_min=obj.n_dec,
        anchors_pos=obj.anchors_pos,
        faces_pos=obj.faces_pos,
    )
# 17:30
