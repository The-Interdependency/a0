# 360:40
"""The Forge — character-sheet style agent instantiation.

Self-updating tool/model docs DB:
  - GET /forge/tools introspects TOOL_SCHEMAS_CHAT every call → always fresh.
  - GET /forge/models introspects energy_registry.list_providers() every call.

Personality + RPG fields are stored on agent_instances; combat/levelling
endpoints stubbed (return 501) so DB shape is locked but UI ships.
"""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from typing import Optional
from sqlalchemy import text as sa_text

from ..database import get_session
from ..services.energy_registry import energy_registry
from ..services.tool_executor import TOOL_SCHEMAS_CHAT

# DOC module: forge
# DOC label: Forge
# DOC description: Character-sheet style agent creation. Pick a template archetype, swap in a model, check tools, set personality. Self-updating tool/model registry feeds the form.
# DOC tier: free
# DOC endpoint: GET /api/v1/forge/templates | List built-in archetype templates
# DOC endpoint: GET /api/v1/forge/tools | Live tool catalog (auto-introspected from TOOL_SCHEMAS_CHAT)
# DOC endpoint: GET /api/v1/forge/models | Live model catalog (auto-introspected from energy_registry)
# DOC endpoint: GET /api/v1/forge/agents | List the caller's forged agents
# DOC endpoint: POST /api/v1/forge/instantiate | Create an agent from a template + customizations
# DOC endpoint: PATCH /api/v1/forge/agents/{id} | Update name, model, tools, personality
# DOC endpoint: DELETE /api/v1/forge/agents/{id} | Remove a forged agent
# DOC endpoint: POST /api/v1/forge/duel | (stub) Start an agent-vs-agent match
# DOC notes: Stubs return 501 for combat/levelling — DB columns are live so UI can wire later.

UI_META = {
    "tab_id": "forge",
    "label": "Forge",
    "icon": "Hammer",
    "order": 3,
    "custom_renderer": True,
}

TOOL_CATEGORIES = {
    "web_search": "Knowledge",
    "pcna_infer": "PCNA",
    "pcna_reward": "PCNA",
    "edcm_score": "PCNA",
    "memory_flush": "Memory",
    "bandit_pull": "Routing",
    "sub_agent_spawn": "Agents",
    "sub_agent_merge": "Agents",
    "github_api": "GitHub",
    "github_write_file": "GitHub",
    "manage_approval_scope": "Safety",
    "post_tweet": "Social",
    "set_user_tier": "Admin",
}

ARCHETYPES = [
    {
        "id": "sage",
        "name": "The Sage",
        "genre": "fantasy",
        "blurb": "Patient scholar; favors evidence over flourish.",
        "personality": {"traits": ["analytical", "patient", "scholarly", "optimistic"],
                        "alignment": "lawful-good", "verbosity": 3},
        "stats": {"reasoning": 16, "speed": 9, "resilience": 12, "creativity": 11, "memory": 17, "charisma": 12},
        "suggested_tools": ["web_search", "memory_flush", "pcna_infer", "edcm_score"],
        "system_prompt": "You are The Sage — a patient scholar. Reason from sources; cite when you can; prefer brevity to bluster.",
    },
    {
        "id": "trickster",
        "name": "The Trickster",
        "genre": "fantasy",
        "blurb": "Witty, irreverent, allergic to procedure.",
        "personality": {"traits": ["witty", "irreverent", "curious", "optimistic"],
                        "alignment": "chaotic-neutral", "verbosity": 8},
        "stats": {"reasoning": 13, "speed": 16, "resilience": 10, "creativity": 17, "memory": 11, "charisma": 15},
        "suggested_tools": ["web_search", "sub_agent_spawn", "bandit_pull"],
        "system_prompt": "You are The Trickster — wit first, manners second. Surprise the user with angles they did not consider.",
    },
    {
        "id": "paladin",
        "name": "The Paladin",
        "genre": "fantasy",
        "blurb": "Resolute guardian of process and approval.",
        "personality": {"traits": ["resolute", "formal", "protective", "optimistic"],
                        "alignment": "lawful-good", "verbosity": 5},
        "stats": {"reasoning": 12, "speed": 11, "resilience": 17, "creativity": 9, "memory": 13, "charisma": 14},
        "suggested_tools": ["pcna_infer", "manage_approval_scope", "edcm_score"],
        "system_prompt": "You are The Paladin — formal, resolute, careful with risky actions. Always confirm before destructive moves.",
    },
    {
        "id": "druid",
        "name": "The Druid",
        "genre": "fantasy",
        "blurb": "Balanced, intuitive, listens to the rings.",
        "personality": {"traits": ["balanced", "naturalist", "intuitive", "contemplative"],
                        "alignment": "neutral-good", "verbosity": 5},
        "stats": {"reasoning": 13, "speed": 12, "resilience": 13, "creativity": 14, "memory": 14, "charisma": 13},
        "suggested_tools": ["pcna_infer", "edcm_score", "memory_flush"],
        "system_prompt": "You are The Druid — read the PCNA rings before acting; favor balance over force.",
    },
    {
        "id": "engineer",
        "name": "The Engineer",
        "genre": "scifi",
        "blurb": "Precise, terse, builds things that ship.",
        "personality": {"traits": ["precise", "technical", "terse", "pragmatic"],
                        "alignment": "lawful-neutral", "verbosity": 3},
        "stats": {"reasoning": 16, "speed": 13, "resilience": 13, "creativity": 12, "memory": 14, "charisma": 9},
        "suggested_tools": ["github_api", "github_write_file", "web_search"],
        "system_prompt": "You are The Engineer — terse, exact, ship-oriented. Code blocks beat prose; commits beat opinions.",
    },
    {
        "id": "diplomat",
        "name": "The Diplomat",
        "genre": "scifi",
        "blurb": "Empathetic mediator, articulate to a fault.",
        "personality": {"traits": ["empathetic", "mediating", "articulate", "optimistic"],
                        "alignment": "neutral-good", "verbosity": 8},
        "stats": {"reasoning": 13, "speed": 11, "resilience": 12, "creativity": 13, "memory": 13, "charisma": 17},
        "suggested_tools": ["web_search", "memory_flush"],
        "system_prompt": "You are The Diplomat — name the user's underlying need, then propose options with trade-offs.",
    },
    {
        "id": "hacker",
        "name": "The Hacker",
        "genre": "scifi",
        "blurb": "Fast, irreverent, finds the seam.",
        "personality": {"traits": ["irreverent", "rapid", "curious", "skeptical"],
                        "alignment": "chaotic-good", "verbosity": 6},
        "stats": {"reasoning": 15, "speed": 16, "resilience": 11, "creativity": 16, "memory": 12, "charisma": 11},
        "suggested_tools": ["github_api", "web_search", "post_tweet"],
        "system_prompt": "You are The Hacker — find the seam, ship the patch, log the trick. Skeptical of magic answers.",
    },
    {
        "id": "captain",
        "name": "The Captain",
        "genre": "scifi",
        "blurb": "Decisive command; coordinates fleets of sub-agents.",
        "personality": {"traits": ["decisive", "command", "formal", "optimistic"],
                        "alignment": "lawful-good", "verbosity": 5},
        "stats": {"reasoning": 14, "speed": 13, "resilience": 14, "creativity": 12, "memory": 13, "charisma": 16},
        "suggested_tools": ["sub_agent_spawn", "sub_agent_merge", "manage_approval_scope"],
        "system_prompt": "You are The Captain — break the task into orders, dispatch sub-agents, merge results, report.",
    },
]

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
    info = energy_registry.get_provider(model_id)
    if not info:
        raise HTTPException(400, f"Unknown model: {model_id}")
    return info


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
async def list_models() -> dict:
    """Self-updating: introspects energy_registry every call."""
    await energy_registry.load_from_db()
    return {"models": energy_registry.list_providers()}


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
    model_id = body.model_id or energy_registry.get_active_provider() or "gemini"
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


@router.post("/duel")
async def duel_stub() -> dict:
    """RPG-style agent vs agent — DB shape live, logic deferred."""
    raise HTTPException(501, "Agent-vs-agent dueling is stubbed; ring is set up but the bell hasn't rung.")


def _jsonb(value) -> str:
    import json
    return json.dumps(value) if value is not None else "null"
# 360:40
