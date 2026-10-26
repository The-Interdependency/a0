# 20:30 0:0 3:1
"""UCNSPool — intern table for UCNSObject. Encode-once-refer-many."""
from __future__ import annotations

# === MODULE_BUILD ===
# id: a0_engine_ucns_kit_pool
#   module_name: pool
#   module_kind: engine
#   summary: UCNSPool — intern table for UCNSObjects (encode-once-refer-many); identical objects by canonical key share a single instance.
#   owner: Erin Spencer
#   public_surface: UCNSPool
#   internal_surface: none
#   auth_boundary: none
#   storage_boundary: none
#   network_boundary: none
#   user_data_boundary: none
#   admin_only: false
#   tests: hmmm
#   rollout: default_enabled
#   rollback: Revert this file; intern table is in-memory only.
#   requires: none
#   since: 2026-06-02
#   unresolved: none
# === END MODULE_BUILD ===


class UCNSPool:
    """
    Intern table for UCNSObjects.
    Identical objects (by canonical key) share one instance.
    """

    def __init__(self) -> None:
        self._table: dict[tuple, object] = {}

    def intern(self, obj) -> object:
        """Return the canonical instance for obj, storing it if new."""
        key = self._key(obj)
        if key not in self._table:
            self._table[key] = obj
        return self._table[key]

    def encode_text(self, text: str) -> list:
        """Tokenize text, intern closed-class UCNSObjects, pass None through."""
        from .encoder import text_to_ucns
        return [
            self.intern(o) if o is not None else None
            for o in text_to_ucns(text)
        ]

    def __len__(self) -> int:
        return len(self._table)

    @staticmethod
    def _key(obj) -> tuple:
        # hmmm: canonical key for UCNSObject not yet specified.
        # Using (n_dec, n_min, anchors_pos, faces_pos) pending review;
        # breaks when anchor payloads are recursive UCNSObjects (depth > 0).
        return (obj.n_dec, obj.n_min, obj.anchors_pos, obj.faces_pos)
# 20:30 0:0 3:1
