# 28:21 0:0 0:1
"""memory_flush — persist active memory seeds to checkpoint."""

# === MODULE_BUILD ===
# id: a0_service_tools_memory_flush
#   module_name: memory_flush
#   module_kind: service
#   summary: memory_flush tool — persists the active PCNA memory seeds to checkpoint on demand.
#   owner: Erin Spencer
#   public_surface: SCHEMA, handle
#   internal_surface: none
#   auth_boundary: none
#   storage_boundary: write
#   network_boundary: none
#   user_data_boundary: none
#   admin_only: false
#   tests: hmmm
#   rollout: default_enabled
#   rollback: Revert this file; removes the memory_flush tool from the registry.
#   requires: a0_engine_pcna
#   since: 2026-06-02
#   unresolved: none
# === END MODULE_BUILD ===

import json

SCHEMA = {
    "type": "function",
    "function": {
        "name": "memory_flush",
        "description": (
            "Flush active memory seeds to checkpoint. "
            "Call this when important context should be persisted for future sessions."
        ),
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
    "tier": "free",
    "approval_scope": None,
    "enabled": True,
    "category": "memory",
    "cost_hint": "low",
    "side_effects": ["filesystem"],
    "version": 1,
}


async def handle(**_) -> str:
    from ...main import get_pcna as _get
    pcna = _get()
    await pcna.save_checkpoint()
    return json.dumps({
        "flushed": True,
        "checkpoint_key": pcna._checkpoint_key,
        "infer_count": pcna.infer_count,
    })
# 28:21 0:0 0:1
