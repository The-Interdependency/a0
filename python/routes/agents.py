# 160:9
import time
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from ..storage import storage
from ..agents.zfae import (
    ZFAE_AGENT_DEF, compose_name, sub_agent_name,
    is_deprecated, DEPRECATED_NAMES,
)
from ..services.energy_registry import energy_registry
from ..engine import PCNAEngine, InstanceMerge

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

_sub_agents: dict[str, PCNAEngine] = {}
_sub_counter = 0


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
    for idx, (sa_name, sa_engine) in enumerate(_sub_agents.items()):
        agents.append({
            "name": sa_name,
            "slot": f"zeta{idx}",
            "status": "active",
            "is_persistent": False,
            "energy_provider": active_provider,
            "uptime_s": round(time.time() - sa_engine.created_at, 1),
        })
    return agents


@router.get("/agents/energy-providers")
async def list_energy_providers():
    return energy_registry.list_providers()


@router.post("/agents/energy-providers/active")
async def set_active_provider(body: SetProviderRequest):
    if not await energy_registry.set_active_provider_persistent(body.provider_id):
        raise HTTPException(status_code=400, detail="unknown provider")
    return {"active": body.provider_id, "agent_name": compose_name(body.provider_id)}


@router.post("/agents/spawn")
async def spawn_sub_agent(body: SpawnRequest):
    from ..main import get_pcna
    global _sub_counter
    parent = get_pcna()
    child, result = InstanceMerge.fork(parent)
    _sub_counter += 1
    provider = body.provider or energy_registry.get_active_provider()
    name = sub_agent_name(_sub_counter, provider)
    _sub_agents[name] = child
    result["sub_agent_name"] = name
    return result


@router.post("/agents/{agent_name}/merge")
async def merge_sub_agent(agent_name: str):
    from ..main import get_pcna
    if agent_name not in _sub_agents:
        raise HTTPException(status_code=404, detail="sub-agent not found")
    child = _sub_agents.pop(agent_name)
    result = InstanceMerge.absorb(get_pcna(), child)
    result["retired_agent"] = agent_name
    return result


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
# 160:9
