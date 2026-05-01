# 292:41
import time
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional

from ..storage import storage
from ..agents.zfae import (
    ZFAE_AGENT_DEF, compose_name, sub_agent_name,
    is_deprecated, DEPRECATED_NAMES,
)
from ..services.energy_registry import energy_registry
from ..engine import PCNAEngine, InstanceMerge
from ..services.agent_lifecycle import (
    # Task #122 — re-export the canonical registry from agent_lifecycle so
    # there is exactly one in-memory `_sub_agents` per process. The dict
    # used to live here too; we keep the name as a shim for one release
    # in case anything outside the repo imports it.
    _sub_agents,
    spawn_sub_agent as _lifecycle_spawn,
    merge_sub_agent as _lifecycle_merge,
    list_sub_agents as _lifecycle_list,
)
from ._admin_gate import require_admin

# DOC module: agents
# DOC label: Agents
# DOC description: Manages agent instances, energy providers, and spawning. Controls which AI provider is active and allows merging named agent configurations.
# DOC tier: free
# DOC endpoint: GET /api/v1/agents | List all agent instances
# DOC endpoint: GET /api/v1/agents/energy-providers | List available AI energy providers
# DOC endpoint: POST /api/v1/agents/energy-providers/active | Set the active energy provider
# DOC endpoint: POST /api/v1/agents/spawn | Spawn a new agent instance
# DOC endpoint: POST /api/v1/agents/{name}/merge | Merge a named agent configuration

UI_META = {
    "tab_id": "agents",
    "label": "Agents",
    "icon": "Bot",
    "order": 2,
    "sections": [
        {
            "id": "instances",
            "label": "Agent Instances",
            "endpoint": "/api/v1/agents",
            "fields": [
                {"key": "name", "type": "text", "label": "Name"},
                {"key": "status", "type": "badge", "label": "Status"},
                {"key": "slot", "type": "badge", "label": "Slot"},
                {"key": "last_tick_at", "type": "text", "label": "Last Tick"},
            ],
        },
        {
            "id": "energy_providers",
            "label": "Energy Providers",
            "endpoint": "/api/v1/agents/energy-providers",
            "fields": [
                {"key": "id", "type": "text", "label": "ID"},
                {"key": "label", "type": "text", "label": "Label"},
                {"key": "available", "type": "badge", "label": "Available"},
                {"key": "active", "type": "badge", "label": "Active"},
            ],
        },
    ],
}

DATA_SCHEMA = {
    "endpoints": [
        {"method": "GET", "path": "/api/v1/agents"},
        {"method": "GET", "path": "/api/v1/agents/{name}"},
        {"method": "POST", "path": "/api/v1/agents/spawn"},
        {"method": "GET", "path": "/api/v1/agents/energy-providers"},
        {"method": "POST", "path": "/api/v1/agents/energy-providers/active"},
    ],
}

router = APIRouter(prefix="/api/v1", tags=["agents"])

# Note: `_sub_agents` is imported above from agent_lifecycle. Local
# `_sub_counter` is no longer needed — the lifecycle module owns naming.


class SpawnRequest(BaseModel):
    provider: Optional[str] = None


class SetProviderRequest(BaseModel):
    provider_id: str


async def ensure_primary_agent(pcna: PCNAEngine):
    from ..database import get_session
    from sqlalchemy import text

    agent_name = compose_name(energy_registry.get_active_provider())

    try:
        async with get_session() as session:
            result = await session.execute(text("SELECT name FROM agent_instances"))
            all_agents = [r[0] for r in result.fetchall()]
    except Exception:
        all_agents = []

    deprecated_found = [n for n in all_agents if is_deprecated(n)]
    if deprecated_found:
        try:
            async with get_session() as session:
                for name in deprecated_found:
                    await session.execute(
                        text("DELETE FROM agent_instances WHERE name = :n"),
                        {"n": name},
                    )
                print(f"[boot] Cleaned {len(deprecated_found)} deprecated agent rows")
        except Exception as e:
            print(f"[boot] Deprecated cleanup failed: {e}")

    primary_exists = agent_name in all_agents
    if not primary_exists:
        try:
            async with get_session() as session:
                await session.execute(
                    text(
                        "INSERT INTO agent_instances (name, slot, status, is_persistent) "
                        "VALUES (:name, :slot, 'active', true) "
                        "ON CONFLICT (name) DO UPDATE SET status = 'active'"
                    ),
                    {"name": agent_name, "slot": ZFAE_AGENT_DEF["slot"]},
                )
                print(f"[boot] Primary agent row ensured: {agent_name}")
        except Exception as e:
            print(f"[boot] Primary agent row creation skipped (table may not exist): {e}")


@router.get("/agents")
async def list_agents():
    active_provider = energy_registry.get_active_provider()
    primary_name = compose_name(active_provider)
    agents = [
        {
            "name": primary_name,
            "slot": ZFAE_AGENT_DEF["slot"],
            "status": "active",
            "is_persistent": True,
            "tools": ZFAE_AGENT_DEF["tools"],
            "sentinel_seeds": ZFAE_AGENT_DEF["sentinel_seed_indices"],
            "energy_provider": active_provider,
        }
    ]
    for idx, sa in enumerate(_lifecycle_list()):
        agents.append({
            "name": sa["name"],
            "slot": f"zeta{idx}",
            "status": "active",
            "is_persistent": False,
            "energy_provider": sa.get("provider") or active_provider,
            "uptime_s": sa["uptime_s"],
        })
    return agents


@router.get("/agents/energy-providers")
async def list_energy_providers():
    """List providers + per-provider enable/disable state from the seed.

    `enabled` defaults to True when the field is absent in route_config so
    existing seed rows behave as before. `disabled_models` is the per-model
    deny list (empty when unset). Both are surfaced here so the chat input
    can hide killed providers without a separate fetch.
    """
    base = energy_registry.list_providers()
    # Read each provider's seed once. _get_seed_module is cheap and we only
    # have a handful of providers, so the N round-trips are fine.
    from .energy import _get_seed_module
    for entry in base:
        seed = await _get_seed_module(entry["id"])
        rc = (seed or {}).get("route_config") or {}
        entry["enabled"] = bool(rc.get("enabled", True))
        dm = rc.get("disabled_models") or []
        entry["disabled_models"] = list(dm) if isinstance(dm, list) else []
    return base


@router.post("/agents/energy-providers/active")
async def set_active_provider(request: Request, body: SetProviderRequest):
    await require_admin(request)
    if not await energy_registry.set_active_provider_persistent(body.provider_id):
        raise HTTPException(status_code=400, detail="unknown provider")
    return {"active": body.provider_id, "agent_name": compose_name(body.provider_id)}


@router.post("/agents/spawn")
async def spawn_sub_agent(request: Request, body: SpawnRequest):
    """Admin-only manual spawn — has no run row, so no parent_run_id."""
    await require_admin(request)
    from ..main import get_pcna
    parent = get_pcna()
    provider = body.provider or energy_registry.get_active_provider()
    return _lifecycle_spawn(parent, provider=provider)


@router.post("/agents/{agent_name}/merge")
async def merge_sub_agent(agent_name: str, request: Request):
    await require_admin(request)
    from ..main import get_pcna
    result = _lifecycle_merge(get_pcna(), agent_name)
    if isinstance(result, dict) and result.get("error") == "sub-agent not found":
        raise HTTPException(status_code=404, detail="sub-agent not found")
    return result


@router.get("/agents/learning_summary")
async def learning_summary(limit: int = 200):
    """Aggregate alpha echo's learning gains from sub-agent merges.

    Reads recent 'merge' events written by spawn_executor and rolls up:
      * total merges counted
      * cumulative phi/psi/omega coherence deltas (the four ring metrics)
      * per-provider breakdown (which providers' work has compounded most)
      * the live primary-PCNA snapshot so the user can compare
        "alpha echo right now" against the cumulative gain it absorbed

    Also surfaces a separate `paid_explainer` rollup of recent
    'explainer_call' events — these are paid one-shot model calls, not
    pcna merges, and are kept in their own section so the merge counter
    stays honest. No schema change; pure aggregation over agent_logs rows.
    """
    from sqlalchemy import text as _sa_text
    from ..database import get_session
    from ..main import get_pcna
    if limit < 1 or limit > 1000:
        raise HTTPException(status_code=400, detail="limit must be 1..1000")
    rows = []
    explainer_rows = []
    async with get_session() as s:
        r = await s.execute(_sa_text(
            "SELECT payload, ts FROM agent_logs "
            "WHERE event = 'merge' ORDER BY ts DESC LIMIT :lim"
        ), {"lim": limit})
        rows = r.mappings().all()
        r2 = await s.execute(_sa_text(
            "SELECT payload, ts FROM agent_logs "
            "WHERE event = 'explainer_call' ORDER BY ts DESC LIMIT :lim"
        ), {"lim": limit})
        explainer_rows = r2.mappings().all()
    def _num(v, caster):
        """Coerce v to int/float defensively; return 0 for malformed input."""
        try:
            return caster(v) if v is not None else caster(0)
        except (TypeError, ValueError):
            return caster(0)

    cum = {
        "merges": 0,
        "phi_delta_sum": 0.0,
        "psi_delta_sum": 0.0,
        "omega_delta_sum": 0.0,
        "theta_circles_delta_sum": 0,
    }
    by_provider: dict[str, dict] = {}
    most_recent = None
    malformed_skipped = 0
    for row in rows:
        p = row["payload"]
        if not isinstance(p, dict):
            malformed_skipped += 1
            continue
        d = p.get("delta")
        if not isinstance(d, dict):
            d = {}
        cum["merges"] += 1
        cum["phi_delta_sum"] += _num(d.get("phi_delta"), float)
        cum["psi_delta_sum"] += _num(d.get("psi_delta"), float)
        cum["omega_delta_sum"] += _num(d.get("omega_delta"), float)
        cum["theta_circles_delta_sum"] += _num(d.get("theta_circles_delta"), int)
        prov = str(p.get("provider") or "unknown")
        bp = by_provider.setdefault(prov, {
            "merges": 0,
            "phi_delta_sum": 0.0,
            "psi_delta_sum": 0.0,
            "omega_delta_sum": 0.0,
        })
        bp["merges"] += 1
        bp["phi_delta_sum"] += _num(d.get("phi_delta"), float)
        bp["psi_delta_sum"] += _num(d.get("psi_delta"), float)
        bp["omega_delta_sum"] += _num(d.get("omega_delta"), float)
        if most_recent is None:
            most_recent = {"ts": str(row["ts"]), **p}
    cum["phi_delta_sum"] = round(cum["phi_delta_sum"], 6)
    cum["psi_delta_sum"] = round(cum["psi_delta_sum"], 6)
    cum["omega_delta_sum"] = round(cum["omega_delta_sum"], 6)
    for bp in by_provider.values():
        bp["phi_delta_sum"] = round(bp["phi_delta_sum"], 6)
        bp["psi_delta_sum"] = round(bp["psi_delta_sum"], 6)
        bp["omega_delta_sum"] = round(bp["omega_delta_sum"], 6)
    # Live primary snapshot — explicit error surfaces the failure rather
    # than collapsing into a silent None that hides a real bug.
    primary = None
    primary_error = None
    try:
        p = get_pcna()
        primary = {
            "phi_coherence": round(float(p.phi.ring_coherence), 6),
            "psi_coherence": round(float(p.psi.ring_coherence), 6),
            "omega_coherence": round(float(p.omega.ring_coherence), 6),
            "theta_circles": int(p.theta.circle_count.mean()),
            "infer_count": int(getattr(p, "infer_count", 0)),
            "instance_id": p.theta.instance_id,
        }
    except Exception as exc:
        primary_error = f"{type(exc).__name__}: {exc}"[:200]
    # Paid-explainer rollup — separate from `cumulative` and `by_provider`
    # above so the merge counter isn't inflated by paid one-shot calls.
    paid = {
        "calls": 0,
        "total_prompt_tokens": 0,
        "total_completion_tokens": 0,
        "total_cost_cents": 0,
        "by_provider": {},
        "most_recent": None,
    }
    for row in explainer_rows:
        p = row["payload"]
        if not isinstance(p, dict):
            continue
        paid["calls"] += 1
        pt = _num(p.get("prompt_tokens"), int)
        ct = _num(p.get("completion_tokens"), int)
        cc = _num(p.get("cost_cents"), int)
        paid["total_prompt_tokens"] += pt
        paid["total_completion_tokens"] += ct
        paid["total_cost_cents"] += cc
        prov = str(p.get("provider") or "unknown")
        bp = paid["by_provider"].setdefault(prov, {
            "calls": 0,
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "cost_cents": 0,
        })
        bp["calls"] += 1
        bp["prompt_tokens"] += pt
        bp["completion_tokens"] += ct
        bp["cost_cents"] += cc
        if paid["most_recent"] is None:
            paid["most_recent"] = {"ts": str(row["ts"]), **p}
    return {
        "window_size": len(rows),
        "malformed_skipped": malformed_skipped,
        "cumulative": cum,
        "by_provider": by_provider,
        "primary_pcna_now": primary,
        "primary_pcna_error": primary_error,
        "most_recent_merge": most_recent,
        "paid_explainer": paid,
    }


from ..services.editable_registry import editable_registry, EditableField
editable_registry.register(EditableField(
    key="active_energy_provider",
    label="Active Energy Provider",
    description="Which LLM powers the agent. Changes take effect on the next inference.",
    control_type="select",
    module="agents",
    get_endpoint="/api/v1/agents/energy-providers",
    patch_endpoint="/api/v1/agents/energy-providers/active",
    query_key="/api/v1/agents/energy-providers",
    options=["grok", "gemini", "claude"],
))
# 292:41
