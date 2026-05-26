# 321:53 0:7 1:9
# DOC module: focus
# DOC label: Focus
# DOC description: Model focus management. Provides context boost injection per conversation, focus regain directives, per-conversation tool selection, and system prompt preview.
# DOC tier: free
# DOC role: route
# DOC endpoint: GET /api/v1/conversations/{id}/boost | Get the context boost for a conversation
# DOC endpoint: PUT /api/v1/conversations/{id}/boost | Set context boost text injected into the system prompt
# DOC endpoint: DELETE /api/v1/conversations/{id}/boost | Clear the context boost
# DOC endpoint: POST /api/v1/conversations/{id}/focus | Inject a focus-regain directive into the conversation
# DOC endpoint: GET /api/v1/conversations/{id}/context-preview | Return the assembled system prompt for this conversation (read-only inspector)
# DOC endpoint: GET /api/v1/conversations/{id}/tools | List all tools with enabled/disabled status for this conversation
# DOC endpoint: PATCH /api/v1/conversations/{id}/tools | Update the per-conversation enabled tool set

from typing import Optional
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import text
from ..database import engine
from ..storage import storage

router = APIRouter(prefix="/api/v1", tags=["focus"])

_FOCUS_DIRECTIVE = (
    "## Focus Regain\n"
    "You are being asked to regain focus. Stop, take stock, and do the following:\n"
    "1. In one sentence, state the primary goal of this conversation.\n"
    "2. Identify the last concrete action you completed.\n"
    "3. State the single next step you will take.\n"
    "Then continue systematically from that next step. Do not re-explain prior work."
)

# ─── Context Boost ────────────────────────────────────────────────────────────

def _uid(request: Request) -> Optional[str]:
    return request.headers.get("x-user-id") or None


async def _assert_conv_owner(conv_id: int, uid: Optional[str]) -> dict:
    conv = await storage.get_conversation(conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if uid and conv.get("user_id") and conv["user_id"] != uid:
        raise HTTPException(status_code=403, detail="Not your conversation")
    return conv


@router.get("/conversations/{conv_id}/boost")
async def get_boost(conv_id: int, request: Request):
    uid = _uid(request)
    conv = await _assert_conv_owner(conv_id, uid)
    return {"conversation_id": conv_id, "context_boost": conv.get("context_boost") or ""}


class BoostBody(BaseModel):
    text: str


@router.put("/conversations/{conv_id}/boost")
async def set_boost(conv_id: int, body: BoostBody, request: Request):
    uid = _uid(request)
    if not uid:
        raise HTTPException(status_code=401, detail="Authentication required")
    await _assert_conv_owner(conv_id, uid)
    async with engine.begin() as conn:
        await conn.execute(
            text("UPDATE conversations SET context_boost = :boost WHERE id = :id"),
            {"boost": body.text.strip(), "id": conv_id},
        )
    return {"ok": True, "conversation_id": conv_id, "context_boost": body.text.strip()}


@router.delete("/conversations/{conv_id}/boost")
async def clear_boost(conv_id: int, request: Request):
    uid = _uid(request)
    if not uid:
        raise HTTPException(status_code=401, detail="Authentication required")
    await _assert_conv_owner(conv_id, uid)
    async with engine.begin() as conn:
        await conn.execute(
            text("UPDATE conversations SET context_boost = NULL WHERE id = :id"),
            {"id": conv_id},
        )
    return {"ok": True, "conversation_id": conv_id, "context_boost": ""}


# ─── Focus Regain ─────────────────────────────────────────────────────────────

@router.post("/conversations/{conv_id}/focus")
async def regain_focus(conv_id: int, request: Request):
    uid = _uid(request)
    if not uid:
        raise HTTPException(status_code=401, detail="Authentication required")
    conv = await _assert_conv_owner(conv_id, uid)

    from ..services.inference import call_provider
    from ..services.energy_registry import active_provider
    from ..services.prompt_assembly import build_system_prompt

    tier = "free"
    if uid:
        async with engine.connect() as conn:
            row = await conn.execute(
                text("SELECT subscription_tier FROM users WHERE id = :id"), {"id": uid}
            )
            rec = row.mappings().first()
            if rec:
                tier = rec["subscription_tier"]

    prior_msgs = await storage.get_messages(conv_id)
    history = [
        {"role": m["role"], "content": m["content"]}
        for m in prior_msgs
        if m["role"] in ("user", "assistant")
    ]
    history.append({"role": "user", "content": "[SYSTEM: Focus regain requested by user]"})

    system_prompt = await build_system_prompt(tier)
    focus_system = (system_prompt or "") + "\n\n" + _FOCUS_DIRECTIVE

    # Resolve via the catalog so persisted message.model provenance always
    # matches the provider call_model will actually dispatch to (catches
    # the case where conv.get("model") is a real model name like
    # "gpt-5-mini" rather than a provider id).
    _candidate = conv.get("model")
    if not _candidate:
        try:
            _candidate = await active_provider()
        except RuntimeError as _e:
            raise HTTPException(status_code=503, detail=str(_e))
    from ..services.model_catalog import resolve_model_id as _rmi
    try:
        provider_id, _ = await _rmi(_candidate)
    except ValueError:
        provider_id = _candidate

    user_msg = await storage.create_message({
        "conversation_id": conv_id,
        "role": "user",
        "content": "🎯 Regain focus",
        "model": provider_id,
        "metadata": {"focus_regain": True, "tier": tier},
    })

    # Route through the canonical adapter. The chat-level tier gate doesn't
    # cover focus, so let call_fn enforce it (provider_id here is always a
    # builtin id since we derived from active_provider, so resolution is
    # cheap). use_tools=False — focus is a one-shot, not an agentic turn.
    from ..services.call_fn import call_model
    content, usage = await call_model(
        provider_id,
        history,
        user_id=uid,
        system_prompt=focus_system,
        use_tools=False,
    )

    assistant_msg = await storage.create_message({
        "conversation_id": conv_id,
        "role": "assistant",
        "content": content,
        "model": provider_id,
        "metadata": {"focus_regain": True, "tier": tier, "usage": usage},
    })

    return {
        "user_message": user_msg,
        "assistant_message": assistant_msg,
        "conversation_id": conv_id,
    }


# ─── Context Preview ────────────────────────────────────────────────────────

@router.get("/conversations/{conv_id}/context-preview")
async def get_context_preview(conv_id: int, request: Request):
    """Return the assembled system prompt exactly as the model will receive it.

    This is a read-only inspector — returns the full string plus the list of
    active memory seed titles so the UI can summarize what's in scope.
    Only authenticated users can call this (guest chat is unaffected).
    """
    uid = _uid(request)
    if not uid:
        raise HTTPException(status_code=401, detail="Authentication required")
    conv = await _assert_conv_owner(conv_id, uid)

    from ..database import engine
    from sqlalchemy import text as _text
    tier = "free"
    async with engine.connect() as conn:
        row = await conn.execute(
            _text("SELECT subscription_tier FROM users WHERE id = :id"), {"id": uid}
        )
        rec = row.mappings().first()
        if rec:
            tier = rec["subscription_tier"]

    # Load agent persona if the conversation is Forge-pinned.
    agent_persona: str | None = None
    agent_id = conv.get("agent_id")
    if agent_id:
        try:
            async with engine.connect() as conn:
                row = await conn.execute(
                    _text("SELECT system_prompt FROM agent_instances WHERE id = :id"),
                    {"id": agent_id},
                )
                rec = row.mappings().first()
                if rec:
                    agent_persona = rec["system_prompt"]
        except Exception:
            pass

    from ..services.prompt_assembly import build_system_prompt, _prepend_doctrine

    base_prompt = await build_system_prompt(tier, agent_persona=agent_persona)

    # Inject context_boost exactly as the send path does (chat.py), so the
    # preview matches what the model actually receives.
    boost = (conv.get("context_boost") or "").strip()
    if boost and base_prompt is not None:
        base_prompt = base_prompt + f"\n\n## Context Boost\n{boost}"
    elif boost:
        base_prompt = f"## Context Boost\n{boost}"

    full_prompt = _prepend_doctrine(base_prompt) or ""

    # Collect active seed titles for the UI summary strip.
    seeds = await storage.get_memory_seeds()
    active_seed_titles = [
        s.get("label", f"Seed {s.get('seed_index', '?')}")
        for s in seeds
        if s.get("enabled") and (s.get("summary") or "").strip()
    ]

    return {
        "conversation_id": conv_id,
        "system_prompt": full_prompt,
        "char_count": len(full_prompt),
        "active_seed_titles": active_seed_titles,
    }


# ─── Per-conversation tool selection ────────────────────────────────────────

class ToolsBody(BaseModel):
    enabled_tools: Optional[list[str]]  # None = all tools on


@router.get("/conversations/{conv_id}/tools")
async def get_conv_tools(conv_id: int, request: Request):
    """List all tools with their enabled/disabled status for this conversation.

    enabled_tools = null on the conversation → all tools are enabled (default).
    """
    uid = _uid(request)
    if not uid:
        raise HTTPException(status_code=401, detail="Authentication required")
    conv = await _assert_conv_owner(conv_id, uid)

    from ..services.tool_executor import TOOL_SCHEMAS_CHAT
    from ..services.tools import registry as _registry

    reg = _registry()
    enabled_tools: list[str] | None = conv.get("enabled_tools")
    enabled_set: set[str] | None = set(enabled_tools) if isinstance(enabled_tools, list) else None

    tool_list = []
    for schema in TOOL_SCHEMAS_CHAT:
        fn = schema.get("function", {})
        name = fn.get("name", "")
        # Look up metadata from the registry for tier/category info.
        spec = reg.get(name)
        tool_list.append({
            "name": name,
            "description": (fn.get("description") or "")[:160],
            "tier": spec.tier if spec else "free",
            "category": spec.category if spec else "misc",
            "enabled": enabled_set is None or name in enabled_set,
        })

    return {
        "conversation_id": conv_id,
        "enabled_tools": enabled_tools,
        "tools": tool_list,
    }


@router.patch("/conversations/{conv_id}/tools")
async def patch_conv_tools(conv_id: int, body: ToolsBody, request: Request):
    """Update the per-conversation enabled tool set.

    Pass enabled_tools=null to reset to "all tools on".
    Pass enabled_tools=[] to disable all tools.
    Pass enabled_tools=["web_search", ...] to enable only those tools.
    """
    uid = _uid(request)
    if not uid:
        raise HTTPException(status_code=401, detail="Authentication required")
    await _assert_conv_owner(conv_id, uid)

    # Validate tool names against the known registry to prevent data drift.
    if body.enabled_tools is not None:
        from ..services.tool_executor import TOOL_SCHEMAS_CHAT
        known = {s["function"]["name"] for s in TOOL_SCHEMAS_CHAT}
        unknown = [n for n in body.enabled_tools if n not in known]
        if unknown:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown tool name(s): {', '.join(unknown)}",
            )
        # Deduplicate and sort for stable storage.
        body = body.model_copy(update={"enabled_tools": sorted(set(body.enabled_tools))})

    import json as _json
    new_val = _json.dumps(body.enabled_tools) if body.enabled_tools is not None else None

    async with engine.begin() as conn:
        await conn.execute(
            text(
                "UPDATE conversations SET enabled_tools = :val::jsonb WHERE id = :id"
            ),
            {"val": new_val, "id": conv_id},
        )

    return {
        "ok": True,
        "conversation_id": conv_id,
        "enabled_tools": body.enabled_tools,
    }


# ─── Inference settings ───────────────────────────────────────────────────────

_VALID_INF_MODES = {"agentic", "direct", "swarm"}


class InferenceSettingsBody(BaseModel):
    max_tool_rounds: Optional[int] = None
    inference_mode: Optional[str] = None


@router.get("/conversations/{conv_id}/inference-settings")
async def get_inference_settings(conv_id: int, request: Request):
    """Return per-conversation inference settings (max_tool_rounds, inference_mode)."""
    uid = _uid(request)
    if not uid:
        raise HTTPException(status_code=401, detail="Authentication required")
    conv = await _assert_conv_owner(conv_id, uid)
    return {
        "conversation_id": conv_id,
        "max_tool_rounds": conv.get("max_tool_rounds"),
        "inference_mode": conv.get("inference_mode") or "agentic",
    }


@router.patch("/conversations/{conv_id}/inference-settings")
async def patch_inference_settings(
    conv_id: int, body: InferenceSettingsBody, request: Request
):
    """Update max_tool_rounds and/or inference_mode for a conversation."""
    uid = _uid(request)
    if not uid:
        raise HTTPException(status_code=401, detail="Authentication required")
    await _assert_conv_owner(conv_id, uid)

    _ALLOWED = {"max_tool_rounds", "inference_mode"}
    updates: dict = {}
    if body.max_tool_rounds is not None:
        if not (1 <= body.max_tool_rounds <= 20):
            raise HTTPException(
                status_code=400, detail="max_tool_rounds must be between 1 and 20"
            )
        updates["max_tool_rounds"] = body.max_tool_rounds
    if body.inference_mode is not None:
        if body.inference_mode not in _VALID_INF_MODES:
            raise HTTPException(
                status_code=400,
                detail=f"inference_mode must be one of: {', '.join(sorted(_VALID_INF_MODES))}",
            )
        updates["inference_mode"] = body.inference_mode
    if not updates:
        raise HTTPException(status_code=400, detail="No valid fields to update")

    set_clauses = ", ".join(f"{k} = :{k}" for k in updates if k in _ALLOWED)
    params = {k: v for k, v in updates.items() if k in _ALLOWED}
    params["id"] = conv_id
    async with engine.begin() as conn:
        await conn.execute(
            text(f"UPDATE conversations SET {set_clauses} WHERE id = :id"),
            params,
        )
    return {"ok": True, "conversation_id": conv_id, **updates}


# ─── Prompt sections ──────────────────────────────────────────────────────────

@router.get("/conversations/{conv_id}/prompt-sections")
async def get_prompt_sections(conv_id: int, request: Request):
    """Return the assembled system prompt split into stable and volatile sections.

    The split mirrors the two Anthropic cache_control breakpoints so the UI
    can explain what's safe to edit mid-conversation without busting the cache.
    has_messages is True once the conversation has at least one real message.
    """
    uid = _uid(request)
    if not uid:
        raise HTTPException(status_code=401, detail="Authentication required")
    conv = await _assert_conv_owner(conv_id, uid)

    from ..services.prompt_assembly import build_prompt_sections

    tier = "free"
    async with engine.connect() as conn:
        row = (await conn.execute(
            text("SELECT subscription_tier FROM users WHERE id = :id"), {"id": uid}
        )).mappings().first()
        if row:
            tier = row["subscription_tier"]

    msg_count = None
    async with engine.connect() as conn:
        msg_count = (await conn.execute(
            text("SELECT COUNT(*) FROM messages WHERE conversation_id = :id"),
            {"id": conv_id},
        )).scalar()
    has_messages = bool(msg_count and msg_count > 0)

    agent_persona: Optional[str] = None
    agent_id = conv.get("agent_id")
    if agent_id:
        try:
            async with engine.connect() as conn:
                rec = (await conn.execute(
                    text("SELECT system_prompt FROM agent_instances WHERE id = :id"),
                    {"id": agent_id},
                )).mappings().first()
                if rec:
                    agent_persona = rec["system_prompt"]
        except Exception:
            pass

    sections = await build_prompt_sections(
        tier,
        agent_persona=agent_persona,
        context_boost=conv.get("context_boost"),
    )
    sections["has_messages"] = has_messages
    sections["conversation_id"] = conv_id
    return sections
# 321:53 0:7 1:9
