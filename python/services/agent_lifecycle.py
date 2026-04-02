import time
from ..engine import PCNAEngine, InstanceMerge
from ..agents.zfae import compose_name, sub_agent_name
from ..services.energy_registry import energy_registry

_sub_agents: dict[str, tuple[PCNAEngine, dict]] = {}
_counter = 0


def spawn_sub_agent(parent: PCNAEngine, provider: str | None = None) -> dict:
    global _counter
    child, fork_result = InstanceMerge.fork(parent)
    _counter += 1
    p = provider or energy_registry.get_active_provider()
    name = sub_agent_name(_counter, p)
    _sub_agents[name] = (child, {
        "name": name,
        "provider": p,
        "spawned_at": time.time(),
        "parent_id": parent.guardian.instance_id,
    })
    return {
        "sub_agent_name": name,
        "instance_id": child.guardian.instance_id,
        "phi_coherence": round(child.phi.ring_coherence, 4),
        "psi_coherence": round(child.psi.ring_coherence, 4),
        "omega_coherence": round(child.omega.ring_coherence, 4),
        **fork_result,
    }


def merge_sub_agent(parent: PCNAEngine, name: str) -> dict:
    if name not in _sub_agents:
        return {"error": "sub-agent not found", "name": name}
    child, meta = _sub_agents.pop(name)
    result = InstanceMerge.absorb(parent, child)
    result["retired_agent"] = name
    result["uptime_s"] = round(time.time() - meta["spawned_at"], 1)
    return result


def list_sub_agents() -> list[dict]:
    result = []
    for name, (engine, meta) in _sub_agents.items():
        result.append({
            "name": name,
            "instance_id": engine.guardian.instance_id,
            "provider": meta.get("provider"),
            "uptime_s": round(time.time() - meta["spawned_at"], 1),
            "phi_coherence": round(engine.phi.ring_coherence, 4),
            "psi_coherence": round(engine.psi.ring_coherence, 4),
            "omega_coherence": round(engine.omega.ring_coherence, 4),
            "infer_count": engine.infer_count,
        })
    return result


def get_sub_agent_engine(name: str) -> PCNAEngine | None:
    entry = _sub_agents.get(name)
    return entry[0] if entry else None
