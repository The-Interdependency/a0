# 92:52
# N:M
"""Canonical in-memory sub-agent registry (Task #122).

Owns the `_sub_agents` dict that maps a sub-agent name → (PCNAEngine, meta).
Both `routes/agents.py` (the HTTP spawn/merge endpoints) and
`services/spawn_executor.py` (the queue worker) now go through these
helpers so we can prove there is exactly one live registry per process.
The duplicate dict that used to live in `routes/agents.py` is gone; that
module re-exports `_sub_agents` and the helpers below from this module
for one release so any external callers keep working.

A module-level `threading.Lock` guards mutations because the registry is
touched from both async route handlers and from sync spawn/merge calls
that fire inside async tasks. The lock is held only for the dict
operation itself; PCNA work happens outside the lock.

Each meta entry tracks `parent_run_id` and `run_id` so:
  * `count_live_for_parent` can implement the per-tier
    `max_concurrent_live` cap (spawn_caps.py).
  * `registry_snapshot` lets the no-orphan contract reconcile in-memory
    children against `agent_runs` rows in the DB.

# === CONTRACTS ===
# id: agent_lifecycle_registry_is_singleton
#   given: a fresh process boot
#   then:  routes.agents._sub_agents is the SAME object as
#          services.agent_lifecycle._sub_agents (re-export shim
#          guarantees a single canonical registry)
#   class: correctness
#   call:  python.tests.contracts.spawn_executor.test_registry_is_singleton
#
# id: agent_lifecycle_count_live_for_parent_filters
#   given: two registry entries under different parent_run_ids
#   then:  count_live_for_parent returns 1 for each parent and 0 for an
#          unrelated parent — the concurrent-live cap depends on this
#   class: correctness
#   call:  python.tests.contracts.spawn_executor.test_count_live_for_parent_filters
# === END CONTRACTS ===
"""
from __future__ import annotations

import threading
import time
from typing import Optional

from ..agents.zfae import sub_agent_name
from ..engine import PCNAEngine, InstanceMerge
from .energy_registry import energy_registry

_lock = threading.Lock()
_sub_agents: dict[str, tuple[PCNAEngine, dict]] = {}
_counter = 0


def spawn_sub_agent(
    parent: PCNAEngine,
    provider: str | None = None,
    *,
    parent_run_id: Optional[str] = None,
    run_id: Optional[str] = None,
) -> dict:
    """Fork a child PCNA from `parent` and register it under a fresh name.

    `parent_run_id` / `run_id` are stored in metadata so the
    concurrent-live cap and the no-orphan contract can reconcile the
    registry against `agent_runs` rows. Both default to None so the HTTP
    /agents/spawn admin endpoint (which has no run row) keeps working.
    """
    global _counter
    child, fork_result = InstanceMerge.fork(parent)
    p = provider or energy_registry.get_active_provider()
    with _lock:
        _counter += 1
        idx = _counter
        name = sub_agent_name(idx, p)
        _sub_agents[name] = (child, {
            "name": name,
            "provider": p,
            "spawned_at": time.time(),
            "parent_id": parent.theta.instance_id,
            "parent_run_id": parent_run_id,
            "run_id": run_id,
        })
    return {
        "sub_agent_name": name,
        "instance_id": child.theta.instance_id,
        "phi_coherence": round(child.phi.ring_coherence, 4),
        "psi_coherence": round(child.psi.ring_coherence, 4),
        "omega_coherence": round(child.omega.ring_coherence, 4),
        **fork_result,
    }


def merge_sub_agent(parent: PCNAEngine, name: str) -> dict:
    """Pop the named child off the registry and absorb it into `parent`."""
    with _lock:
        entry = _sub_agents.pop(name, None)
    if entry is None:
        return {"error": "sub-agent not found", "name": name}
    child, meta = entry
    result = InstanceMerge.absorb(parent, child)
    result["retired_agent"] = name
    result["uptime_s"] = round(time.time() - meta["spawned_at"], 1)
    return result


def list_sub_agents() -> list[dict]:
    with _lock:
        items = list(_sub_agents.items())
    out = []
    for name, (engine, meta) in items:
        out.append({
            "name": name,
            "instance_id": engine.theta.instance_id,
            "provider": meta.get("provider"),
            "uptime_s": round(time.time() - meta["spawned_at"], 1),
            "phi_coherence": round(engine.phi.ring_coherence, 4),
            "psi_coherence": round(engine.psi.ring_coherence, 4),
            "omega_coherence": round(engine.omega.ring_coherence, 4),
            "infer_count": engine.infer_count,
            "parent_run_id": meta.get("parent_run_id"),
            "run_id": meta.get("run_id"),
        })
    return out


def get_sub_agent_engine(name: str) -> PCNAEngine | None:
    with _lock:
        entry = _sub_agents.get(name)
    return entry[0] if entry else None


def count_live_for_parent(parent_run_id: Optional[str]) -> int:
    """How many live registry entries were spawned under `parent_run_id`.

    Returns 0 for a falsy parent_run_id (root spawns from the admin
    endpoint don't count toward any parent's concurrent-live cap).
    """
    if not parent_run_id:
        return 0
    with _lock:
        return sum(
            1 for _name, (_e, m) in _sub_agents.items()
            if m.get("parent_run_id") == parent_run_id
        )


def registry_snapshot() -> list[dict]:
    """Light read-only snapshot for the no-orphan invariant check.

    Only exposes the identifiers needed to match against `agent_runs`
    rows; PCNA references stay inside the registry so callers cannot
    accidentally hold them past the merge.
    """
    with _lock:
        items = list(_sub_agents.items())
    return [
        {
            "name": name,
            "run_id": meta.get("run_id"),
            "parent_run_id": meta.get("parent_run_id"),
            "provider": meta.get("provider"),
        }
        for name, (_e, meta) in items
    ]
# N:M
# 92:52
