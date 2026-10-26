# 213:38 5:8 1:7
"""The Forge — character-sheet style agent instantiation.

Self-updating tool/model docs DB:
  - GET /forge/tools introspects TOOL_SCHEMAS_CHAT every call → always fresh.
  - GET /forge/models delegates to list_models_for_user from model_catalog.

Personality + RPG fields are stored on agent_instances; combat/levelling
endpoints stubbed (return 501) so DB shape is locked but UI ships.
"""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from typing import Optional
from sqlalchemy import text as sa_text

from ..database import get_session
from ..services.energy_registry import active_provider
from ..services.tool_executor import TOOL_SCHEMAS_CHAT
from ._admin_gate import require_admin
from .forge_archetypes import ARCHETYPES, TOOL_CATEGORIES

# DOC module: forge
# DOC label: Forge
# DOC description: Character-sheet style agent creation. Pick a template archetype, swap in a model, check tools, set personality. Self-updating tool/model registry feeds the form.
# DOC tier: free
# DOC role: route
# DOC endpoint: GET /api/v1/forge/templates | List built-in archetype templates
# DOC endpoint: GET /api/v1/forge/tools | Live tool catalog (auto-introspected from TOOL_SCHEMAS_CHAT)
# DOC endpoint: GET /api/v1/forge/models | Live model catalog (delegated to model_catalog.list_models_for_user)
# DOC endpoint: GET /api/v1/forge/agents | List the caller's forged agents
# DOC endpoint: POST /api/v1/forge/instantiate | Create an agent from a template + customizations
# DOC endpoint: PATCH /api/v1/forge/agents/{id} | Update name, model, tools, personality
# DOC endpoint: DELETE /api/v1/forge/agents/{id} | Remove a forged agent
# DOC endpoint: POST /api/v1/forge/duel | (stub) Start an agent-vs-agent match
# DOC notes: Stubs return 501 for combat/levelling — DB columns are live so UI can wire later.


router = APIRouter(prefix="/api/v1/forge", tags=["forge"])


class InstantiateRequest(BaseModel):
    template_id: str
    name: str = Field(min_length=1, max_length=80)
    model_id: Optional[str] = None
    enabled_tools: Optional[list[str]] = None
    system_prompt_override: Optional[str] = None
    personality_override: Optional[dict] = None
    avatar_url: Optional[str] = None
    backstory: Optional[str] = None


class UpdateAgentRequest(BaseModel):
    name: Optional[str] = None
    model_id: Optional[str] = None
    enabled_tools: Optional[list[str]] = None
    system_prompt: Optional[str] = None
    personality: Optional[dict] = None
    avatar_url: Optional[str] = None
    backstory: Optional[str] = None


def _archetype(template_id: str) -> dict:
    for a in ARCHETYPES:
        if a["id"] == template_id:
            return a
    raise HTTPException(404, f"Unknown archetype: {template_id}")


def _user_id(request: Request) -> str:
    uid = request.headers.get("x-user-id") or request.headers.get("X-User-Id")
    if not uid:
        raise HTTPException(401, "Sign in required to use the Forge.")
    return uid


def _valid_tools() -> set[str]:
    return {s["function"]["name"] for s in TOOL_SCHEMAS_CHAT}


def _validate_tools(tools: list[str]) -> list[str]:
    valid = _valid_tools()
    bad = [t for t in tools if t not in valid]
    if bad:
        raise HTTPException(400, f"Unknown tools: {', '.join(bad)}")
    return tools


def _validate_model(model_id: str) -> dict:
    """Resolve `model_id` to its provider spec via the catalog resolver.

    Delegates to model_catalog.resolve_model_id so the search rules
    (provider id, primary model, preset role maps) live in one place.
    Raises 400 instead of letting ValueError propagate.
    """
    from ..services.model_catalog import resolve_model_id
    try:
        _pid, spec = resolve_model_id(model_id)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return spec


@router.get("/templates")
async def list_templates() -> dict:
    return {"templates": ARCHETYPES}


@router.get("/tools")
async def list_tools() -> dict:
    """Self-updating: introspects TOOL_SCHEMAS_CHAT every call."""
    out = []
    for spec in TOOL_SCHEMAS_CHAT:
        fn = spec.get("function", {})
        name = fn.get("name", "")
        out.append({
            "name": name,
            "description": fn.get("description", ""),
            "category": TOOL_CATEGORIES.get(name, "Other"),
            "params": list((fn.get("parameters") or {}).get("properties", {}).keys()),
        })
    return {"tools": out, "count": len(out)}


@router.get("/models")
async def list_models(request: Request) -> dict:
    """Delegates to list_models_for_user from model_catalog.

    Returns user_tier alongside the providers/models list so the UI can
    disable entries whose `min_tier` exceeds the caller's tier without a
    second round-trip.
    """
    uid = request.headers.get("x-user-id") or request.headers.get("X-User-Id")
    from ..services.model_catalog import list_models_for_user
    return await list_models_for_user(uid)


@router.get("/agents")
async def list_agents(request: Request) -> dict:
    uid = _user_id(request)
    async with get_session() as session:
        rows = (await session.execute(sa_text(
            "SELECT id, name, archetype, model_id, provider, enabled_tools, "
            "system_prompt, personality, avatar_url, backstory, level, xp, hp, "
            "wins, losses, draws, stats, status, parent_id, merged_at, created_at "
            "FROM agent_instances WHERE owner_id = :uid AND is_template = false "
            "ORDER BY created_at DESC"
        ), {"uid": uid})).mappings().all()
    return {"agents": [dict(r) for r in rows]}


@router.post("/instantiate")
async def instantiate(request: Request, body: InstantiateRequest) -> dict:
    uid = _user_id(request)
    arche = _archetype(body.template_id)
    tools = _validate_tools(body.enabled_tools if body.enabled_tools is not None else arche["suggested_tools"])
    prompt = body.system_prompt_override or arche["system_prompt"]
    personality = body.personality_override or arche["personality"]
    model_id = body.model_id
    if not model_id:
        try:
            model_id = await active_provider()
        except RuntimeError as e:
            raise HTTPException(status_code=503, detail=str(e))
    provider_info = _validate_model(model_id)
    provider = provider_info.get("vendor", model_id)
    stats = arche["stats"]

    async with get_session() as session:
        dupe = (await session.execute(sa_text(
            "SELECT 1 FROM agent_instances WHERE owner_id = :uid AND name = :name LIMIT 1"
        ), {"uid": uid, "name": body.name})).first()
        if dupe:
            raise HTTPException(409, f"You already have an agent named '{body.name}'.")
        result = await session.execute(sa_text(
            "INSERT INTO agent_instances "
            "(name, slot, directives, tools, status, archetype, model_id, provider, "
            " enabled_tools, system_prompt, personality, owner_id, is_template, "
            " level, xp, hp, wins, losses, draws, stats, loadout, avatar_url, backstory) "
            "VALUES (:name, 'forge', '', :tools_j, 'idle', :arche, :model_id, :provider, "
            " :tools_j, :prompt, :pers_j, :uid, false, "
            " 1, 0, 100, 0, 0, 0, :stats_j, '[]'::jsonb, :avatar, :backstory) "
            "RETURNING id, name, archetype, model_id, provider, enabled_tools, system_prompt, "
            "personality, avatar_url, backstory, level, xp, hp, stats, created_at"
        ), {
            "name": body.name,
            "tools_j": _jsonb(tools),
            "arche": body.template_id,
            "model_id": model_id,
            "provider": provider,
            "prompt": prompt,
            "pers_j": _jsonb(personality),
            "uid": uid,
            "stats_j": _jsonb(stats),
            "avatar": body.avatar_url,
            "backstory": body.backstory,
        })
        row = result.mappings().first()
        await session.commit()
    return {"agent": dict(row)}


@router.patch("/agents/{agent_id}")
async def update_agent(agent_id: int, request: Request, body: UpdateAgentRequest) -> dict:
    uid = _user_id(request)
    sets = []
    params: dict = {"id": agent_id, "uid": uid}
    if body.name is not None:
        sets.append("name = :name"); params["name"] = body.name
    if body.model_id is not None:
        info = _validate_model(body.model_id)
        sets.append("model_id = :model_id, provider = :provider")
        params["model_id"] = body.model_id
        params["provider"] = info.get("vendor", body.model_id)
    if body.enabled_tools is not None:
        sets.append("enabled_tools = :tools_j, tools = :tools_j")
        params["tools_j"] = _jsonb(_validate_tools(body.enabled_tools))
    if body.system_prompt is not None:
        sets.append("system_prompt = :prompt"); params["prompt"] = body.system_prompt
    if body.personality is not None:
        sets.append("personality = :pers_j"); params["pers_j"] = _jsonb(body.personality)
    if body.avatar_url is not None:
        sets.append("avatar_url = :avatar"); params["avatar"] = body.avatar_url
    if body.backstory is not None:
        sets.append("backstory = :backstory"); params["backstory"] = body.backstory
    if not sets:
        raise HTTPException(400, "No fields to update")
    async with get_session() as session:
        result = await session.execute(sa_text(
            f"UPDATE agent_instances SET {', '.join(sets)} "
            "WHERE id = :id AND owner_id = :uid AND is_template = false "
            "RETURNING id, name, archetype, model_id, provider, enabled_tools, "
            "system_prompt, personality, avatar_url, backstory, level, xp, hp, stats"
        ), params)
        row = result.mappings().first()
        if not row:
            raise HTTPException(404, "Agent not found")
        await session.commit()
    return {"agent": dict(row)}


@router.delete("/agents/{agent_id}")
async def delete_agent(agent_id: int, request: Request) -> dict:
    uid = _user_id(request)
    async with get_session() as session:
        result = await session.execute(sa_text(
            "DELETE FROM agent_instances WHERE id = :id AND owner_id = :uid "
            "AND is_template = false RETURNING id"
        ), {"id": agent_id, "uid": uid})
        row = result.first()
        if not row:
            raise HTTPException(404, "Agent not found")
        await session.commit()
    return {"deleted": agent_id}


@router.post("/agents/{agent_id}/start-chat")
async def start_chat(agent_id: int, request: Request) -> dict:
    """Create a new conversation pinned to this Forge agent.

    Pinning means: every send_message in this conversation auto-injects the
    agent's system_prompt as the persona slot and uses the agent's model_id
    unless explicitly overridden.
    """
    uid = _user_id(request)
    async with get_session() as session:
        arow = (await session.execute(sa_text(
            "SELECT id, name, model_id FROM agent_instances "
            "WHERE id = :id AND owner_id = :uid AND is_template = false"
        ), {"id": agent_id, "uid": uid})).mappings().first()
        if not arow:
            raise HTTPException(404, "Agent not found")
    _forge_model = arow["model_id"]
    if not _forge_model:
        try:
            _forge_model = await active_provider()
        except RuntimeError as e:
            raise HTTPException(status_code=503, detail=str(e))
    from ..storage import storage
    conv = await storage.create_conversation({
        "title": f"⚔ {arow['name']}",
        "model": _forge_model,
        "agent_id": agent_id,
    }, owner_user_id=uid)
    return {"conversation": conv}


@router.post("/duel")
async def duel_stub(request: Request) -> dict:
    """RPG-style agent vs agent — DB shape live, logic deferred."""
    await require_admin(request)
    raise HTTPException(501, "Agent-vs-agent dueling is stubbed; ring is set up but the bell hasn't rung.")


def _jsonb(value) -> str:
    import json
    return json.dumps(value) if value is not None else "null"
# 213:38 5:8 1:7
