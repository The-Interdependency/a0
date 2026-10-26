# 10:33 0:0 2:0
"""Per-slot in-flight turn counter.

Tracks how many main-chat inference turns are currently routed through
the conduct slot.  chat.py calls conduct_turn_enter() / conduct_turn_exit()
around each turn that resolved its provider via active_provider().
instances_api.py checks conduct_is_active() before reassigning the conduct
slot and returns 409 Conflict when a turn is in flight.

Thread-safety: this module runs inside the single asyncio event loop of
the FastAPI/uvicorn process.  CPython's GIL makes integer increments atomic;
no asyncio.Lock is required for a plain counter.
"""

# === MODULE_BUILD ===
# id: a0_service_slot_locks
#   module_name: slot_locks
#   module_kind: service
#   summary: Per-slot in-flight turn counter — tracks how many main-chat turns are routed through the conduct slot so instance reassignment can return 409 Conflict while a turn is in flight.
#   owner: Erin Spencer
#   public_surface: conduct_turn_enter, conduct_turn_exit, conduct_is_active
#   internal_surface: none
#   auth_boundary: none
#   storage_boundary: none
#   network_boundary: none
#   user_data_boundary: none
#   admin_only: false
#   tests: hmmm
#   rollout: default_enabled
#   rollback: Revert this file; conduct-slot in-flight guarding reverts to prior behavior.
#   requires: none
#   since: 2026-06-02
#   unresolved: none
# === END MODULE_BUILD ===

_conduct_turns: int = 0


def conduct_turn_enter() -> None:
    """Signal that a conduct-slot chat turn has started."""
    global _conduct_turns
    _conduct_turns += 1


def conduct_turn_exit() -> None:
    """Signal that a conduct-slot chat turn has finished."""
    global _conduct_turns
    if _conduct_turns > 0:
        _conduct_turns -= 1


def conduct_is_active() -> bool:
    """Return True while at least one conduct-slot turn is in flight."""
    return _conduct_turns > 0
# 10:33 0:0 2:0
