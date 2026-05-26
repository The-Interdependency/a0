<<<<<<< HEAD
# 637:187 2:7 2:16
=======
# 641:171
>>>>>>> origin/pr/32
import time
import traceback
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional

from ..storage import storage
<<<<<<< HEAD
from ..services.energy_registry import active_provider, BUILTIN_PROVIDERS, cache_breakdown, estimate_cost
from ..services.inference import call_provider
from ..services.prompt_assembly import build_system_prompt
=======
from ..services.stripe_service import get_tier_context_name
from ..services.energy_registry import energy_registry
from ..services.turn_model_resolution import resolve_turn_model
from ..services.inference import call_energy_provider
>>>>>>> origin/pr/32
from ..services.bg_tasks import spawn as _spawn_bg

# In-memory pending gate store: conv_id → {gate_id, history, system_prompt, provider_id, uid, ts}
# Used to replay a blocked action when the user grants a scope.
# Entries are evicted after _PENDING_GATE_TTL_SECS to keep the map bounded.
_pending_gates: dict[int, dict] = {}
_PENDING_GATE_TTL_SECS = 15 * 60  # 15 min
_PENDING_GATE_SWEEP_INTERVAL_SECS = 60  # background loop cadence


def _sweep_pending_gates() -> None:
    """Evict pending-gate entries older than the TTL."""
    if not _pending_gates:
        return
    now = time.monotonic()
    stale = [cid for cid, e in _pending_gates.items() if now - e.get("ts", 0) > _PENDING_GATE_TTL_SECS]
    for cid in stale:
        _pending_gates.pop(cid, None)


async def pending_gate_sweep_loop() -> None:
    """Periodic sweep so expired gates are evicted on a quiet system, not just
    when a new gate is stored. Runs forever until cancelled by bg_tasks.cancel_all
    on FastAPI shutdown.
    """
    import asyncio
    while True:
        try:
            await asyncio.sleep(_PENDING_GATE_SWEEP_INTERVAL_SECS)
            _sweep_pending_gates()
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            # Don't let a transient error kill the loop — just log and continue.
            print(f"[chat] pending-gate sweep iteration failed: {exc}")


def _store_pending_gate(conv_id: int, entry: dict) -> None:
    entry["ts"] = time.monotonic()
    _pending_gates[conv_id] = entry
    _sweep_pending_gates()


def _attach_cost_usd(usage: dict | None, provider_id: str | None) -> None:
    """Mutate `usage` to add a `cost_usd` field for the single-mode path.

    Multi-model orchestration already populates `cost_usd` via
    `_aggregate_voice_usage`, but the single-mode reply previously had no
    cost figure attached — so the conversation-wide running total had no
    way to sum single-mode turns. We compute it here from the provider
    pricing table and the cache breakdown so the running-total badge can
    sum every assistant message uniformly.

    No-ops if usage is missing/empty, cost is already populated, or the
    provider id isn't a known billing provider (e.g. "system" replies).
    """
    if not usage or not isinstance(usage, dict):
        return
    if usage.get("cost_usd") is not None:
        return
    if not provider_id or provider_id == "system":
        return
    if not BUILTIN_PROVIDERS.get(provider_id):
        return
    try:
        cb = cache_breakdown(usage)
        cost = estimate_cost(
            provider_id,
            cb.get("fresh_input", 0),
            cb.get("output", 0),
            cb.get("cache_read", 0),
            cb.get("cache_write", 0),
        )
        usage["cost_usd"] = round(float(cost), 6)
    except Exception as exc:
        # Surface the failure instead of silently swallowing — empty cost in the
        # UI is indistinguishable from "free model", which masks pricing config bugs.
        print(f"[chat._attach_cost_usd] cost estimate failed for {provider_id}: {exc}")
        usage["cost_usd"] = None
        usage["cost_error"] = str(exc)

# DOC module: chat
# DOC label: Chat
# DOC description: Manages conversations and messages between users and the agent. Supports streaming replies, conversation history, and per-conversation metadata.
# DOC tier: free
# DOC role: route
# DOC endpoint: GET /api/v1/conversations | List all conversations for the current user
# DOC endpoint: POST /api/v1/conversations | Create a new conversation
# DOC endpoint: GET /api/v1/conversations/{id} | Get a single conversation
# DOC endpoint: PATCH /api/v1/conversations/{id} | Update conversation metadata
# DOC endpoint: DELETE /api/v1/conversations/{id} | Delete a conversation
# DOC endpoint: GET /api/v1/conversations/{id}/messages | List messages in a conversation
# DOC endpoint: POST /api/v1/conversations/{id}/messages | Send a message and receive a reply


DATA_SCHEMA = {
    "endpoints": [
        {"method": "GET", "path": "/api/v1/conversations"},
        {"method": "POST", "path": "/api/v1/conversations"},
        {"method": "GET", "path": "/api/v1/conversations/{id}"},
        {"method": "PATCH", "path": "/api/v1/conversations/{id}"},
        {"method": "DELETE", "path": "/api/v1/conversations/{id}"},
        {"method": "GET", "path": "/api/v1/conversations/{id}/messages"},
        {"method": "POST", "path": "/api/v1/conversations/{id}/messages"},
    ],
}

router = APIRouter(prefix="/api/v1", tags=["chat"])


class CreateConversation(BaseModel):
    title: str = "New Chat"
    # null → resolve from current active_provider at creation. No silent
    # default to "gemini" — the global active_provider is the single source
    # of truth (set via POST /api/agents/active-provider).
    model: Optional[str] = None
    agent_id: Optional[int] = None
    # Note: userId from body is now ignored — owner is always the authenticated caller.


class UpdateConversation(BaseModel):
    title: str


class SendMessage(BaseModel):
    content: str
    model: Optional[str] = None
    agent_id: Optional[int] = None
    attachment_ids: list[int] = []
    orchestration_mode: Optional[str] = None  # single|fan_out|council|daisy_chain|...
    cut_mode: Optional[str] = None  # off|soft|hard
    providers: Optional[list[str]] = None  # used when mode != single
    # Client UUID per send; multi-model path publishes lifecycle events to
    # /api/v1/orchestration/{client_run_id}/stream for live token meters.
    client_run_id: Optional[str] = None


def _caller_uid(request: Request) -> Optional[str]:
    return request.headers.get("x-user-id") or None


async def _load_conduct_slot() -> tuple[str, str]:
    """Load (model_id, swarm_context) directly from the conduct slot instance.

    Mirrors how instances_api loads forge agent rows — the conduct slot is the
    character sheet; its swarm_context is the presence that wraps the provider.
    Raises RuntimeError("No instantiation selected") when no row exists.
    """
    from sqlalchemy import text as _sa_text
    from ..database import get_session
    async with get_session() as _s:
        _row = (await _s.execute(_sa_text(
            "SELECT model_id, swarm_context FROM model_instances"
            " WHERE role_slot = 'conduct' LIMIT 1"
        ))).mappings().first()
    if not _row:
        raise RuntimeError("No instantiation selected")
    _mid = (_row["model_id"] or "").strip()
    if not _mid:
        raise RuntimeError("No instantiation selected")
    return _mid, (_row["swarm_context"] or "").strip()


async def _require_owned_conv(conv_id: int, uid: Optional[str]) -> dict:
    """Fetch conversation; 404 if missing or not owned by caller.

    Strict: requires an authenticated uid AND exact owner match.
    Returns 404 (not 403) on any mismatch to avoid existence disclosure.
    """
    if not uid:
        raise HTTPException(status_code=404, detail="conversation not found")
    conv = await storage.get_conversation(conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="conversation not found")
    owner = conv.get("user_id")
    if owner != uid:
        raise HTTPException(status_code=404, detail="conversation not found")
    return conv


@router.get("/conversations")
async def list_conversations(
    request: Request,
    agent_id: int | None = None,
    archived: bool | None = None,
):
    """List conversations.

    Defaults to a0-only (excludes any conversation pinned to a Forge agent).
    Pass ?agent_id=<id> to fetch only conversations pinned to that agent —
    used by the Forge tab's inline chat surface.
    """
    uid = _caller_uid(request)
    if not uid:
        raise HTTPException(status_code=401, detail="authentication required")
    # archived defaults to False so the main sidebar list never includes
    # archived chats. The "Archived" toggle in the UI passes ?archived=true
    # to fetch the other half. Pass ?archived= explicitly (omit value) to
    # opt out of the filter and get everything.
    archived_filter: bool | None = False if archived is None else archived
    return await storage.get_conversations(
        user_id=uid, agent_id=agent_id, archived=archived_filter,
    )


@router.post("/conversations")
async def create_conversation(body: CreateConversation, request: Request):
    uid = _caller_uid(request)
    # Resolve the conversation's stored model honestly: explicit body wins,
    # then fall back to the current global active_provider. If neither is
    # set the system has no way to route chat, so refuse instead of silently
    # binding to "gemini" (the old behavior). Admin can fix by calling
    # POST /api/agents/active-provider {provider_id}.
    model = body.model
    if not model:
        try:
            model = await active_provider()
        except RuntimeError as e:
            raise HTTPException(status_code=503, detail=str(e))
    data: dict = {"title": body.title, "model": model}
    return await storage.create_conversation(data, owner_user_id=uid)


@router.get("/conversations/{conv_id}")
async def get_conversation(conv_id: int, request: Request):
    uid = _caller_uid(request)
    return await _require_owned_conv(conv_id, uid)


@router.patch("/conversations/{conv_id}")
async def update_conversation(conv_id: int, body: UpdateConversation, request: Request):
    uid = _caller_uid(request)
    await _require_owned_conv(conv_id, uid)
    await storage.update_conversation_title(conv_id, body.title)
    return {"ok": True}


@router.delete("/conversations/{conv_id}")
async def delete_conversation(conv_id: int, request: Request):
    uid = _caller_uid(request)
    await _require_owned_conv(conv_id, uid)
    await storage.delete_conversation(conv_id)
    _pending_gates.pop(conv_id, None)
    return {"ok": True}


class ArchiveConversation(BaseModel):
    archived: bool


@router.patch("/conversations/{conv_id}/archive")
async def archive_conversation(conv_id: int, body: ArchiveConversation, request: Request):
    uid = _caller_uid(request)
    await _require_owned_conv(conv_id, uid)
    await storage.set_conversation_archived(conv_id, body.archived)
    return {"ok": True, "archived": body.archived}


@router.get("/conversations/{conv_id}/messages")
async def list_messages(conv_id: int, request: Request):
    uid = _caller_uid(request)
    await _require_owned_conv(conv_id, uid)
    msgs = await storage.get_messages(conv_id)
    if msgs:
        ids = [m["id"] for m in msgs]
        att_map = await storage.get_attachments_for_messages(ids)
        for m in msgs:
            m["attachments"] = att_map.get(m["id"], [])
    return msgs


def _parse_approve_scope(content: str) -> str | None:
    """Return scope name if message contains 'APPROVE SCOPE <scope>'.

    Tolerant of leading/trailing text so the parse still works when a user
    pastes (or a mobile UI concatenates) the assistant's full approval line
    that ends with '...APPROVE SCOPE <scope>'. Scope names are restricted to
    [a-z0-9_-] so we don't swallow trailing punctuation.
    """
    import re as _re
    m = _re.search(r"\bAPPROVE\s+SCOPE\s+([a-z][a-z0-9_-]*)\b", content, _re.IGNORECASE)
    return m.group(1).lower() if m else None


def _parse_approve_gate(content: str) -> str | None:
    """Return gate_id if message contains 'APPROVE gate-<hex>'.

    Tolerant of trailing text (e.g. when the user echoes the whole approval
    line back, which includes a follow-up 'APPROVE SCOPE ...' phrase). The
    gate hex is anchored with \\b so we don't accidentally extend into other
    tokens.
    """
    import re as _re
    m = _re.search(r"\bAPPROVE\s+(gate-[0-9a-f]+)\b", content, _re.IGNORECASE)
    return m.group(1).lower() if m else None


@router.post("/conversations/{conv_id}/messages")
async def send_message(conv_id: int, body: SendMessage, request: Request):
    try:
        uid = _caller_uid(request)
        conv = await _require_owned_conv(conv_id, uid)

        from ..database import engine
        from sqlalchemy import text as _text
        tier = "free"
        if uid:
            async with engine.connect() as conn:
                row = await conn.execute(_text("SELECT subscription_tier FROM users WHERE id = :id"), {"id": uid})
                rec = row.mappings().first()
                if rec:
                    tier = rec["subscription_tier"]

        # Forge agent binding: per-message agent_id wins, else fall back to
        # the conversation's pinned agent. Loaded once via the canonical
        # constructor so other surfaces (council, spawn, replay) can share
        # the same loader. enforce_tier/enabled are off because the chat
        # route runs its own gates below.
        from ..services.agent_instance import AgentInstance
        agent_inst: Optional[AgentInstance] = None
        agent_persona: Optional[str] = None
        agent_model_id: Optional[str] = None
        effective_agent_id = body.agent_id or conv.get("agent_id")
        if effective_agent_id and uid:
            try:
                agent_inst = await AgentInstance.from_agent_id(
                    effective_agent_id, uid,
                    enforce_tier=False, enforce_enabled=False,
                )
            except PermissionError:
                # Agent missing or not owned — fall through to default model
                # behavior, mirrors the previous silent "if arow:" semantics
                # so an unpinned/deleted agent doesn't 403 a working chat.
                agent_inst = None
            if agent_inst is not None:
                agent_persona = agent_inst.system_prompt
                agent_model_id = agent_inst.model_id
                # Honor the forge agent's configured tool list. use_tools and
                # meta["enabled_tools"] are already set correctly by
                # from_agent_id: use_tools=False when the agent has no tools,
                # True with a non-empty list otherwise. The list is merged
                # into the effective allow-list at set_allowed_tools below.

        # Honest resolution chain (no silent fallback to a hardcoded provider):
        #   per-message body.model > agent's configured model > current
        #   global active_provider > stored conversation model.
        # active_provider wins over conv.model so toggling the global active
        # provider via /api/agents/active-provider takes effect on the next
        # turn of every existing conversation. If all four are empty we
        # cannot route, so refuse — same principle as the inference
        # dispatcher's no-silent-fallback contract.
<<<<<<< HEAD
        model_from_body = bool(body.model)
        _from_conduct = False
        _conduct_sc: str = ""
        model_id = body.model or agent_model_id
        if not model_id:
            try:
                model_id, _conduct_sc = await _load_conduct_slot()
                _from_conduct = True
            except RuntimeError:
                model_id = conv.get("model") or ""
        if not model_id:
            raise HTTPException(status_code=503, detail="No instantiation selected")
        # Resolve model_id → provider_id via the catalog so forge agents
        # whose model_id is a real model name (e.g. "gpt-5-mini") route
        # correctly downstream. The fallback below is intentionally
        # asymmetric: only server-controlled sources (agent model,
        # active_provider, conv.model) get the silent fallback. A
        # user-supplied body.model that the catalog can't resolve is a
        # picker typo or a stale id and must fail loudly — silently
        # rerouting it to the active provider would let the user
        # believe they got the model they asked for.
        from ..services.model_catalog import resolve_model_id as _resolve_model
        try:
            provider_id, _ = await _resolve_model(model_id)
        except ValueError:
            if model_from_body:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Unknown model id {model_id!r}. The model picker may "
                        f"be out of date or this id is not registered in the "
                        f"catalog. Refresh the providers list or pick 'auto'."
                    ),
                )
            try:
                provider_id = await active_provider()
            except RuntimeError:
                provider_id = model_id
=======
        model_id, provider_id = await resolve_turn_model(
            body_model=body.model,
            agent_model_id=agent_model_id,
            conv_model=conv.get("model"),
        )
>>>>>>> origin/pr/32

        # Tier-gate restricted models (e.g. gemini3 = ws/admin only).
        # Gate the *resolved* provider list — never raw body.providers — so
        # aliases like "active" can't smuggle a ws-only model past the gate
        # by being inert at request time and resolving to gemini3 at exec
        # time. resolve_providers() is the same path inference uses.
        from ..services.energy_registry import resolve_providers as _resolve
        _ranks = {"free": 0, "supporter": 1, "ws": 2, "admin": 3}
        _mode_for_gate = (body.orchestration_mode or "single").strip() or "single"
        if _mode_for_gate != "single" and body.providers:
            providers_to_gate = await _resolve(body.providers) or [provider_id]
        else:
            providers_to_gate = [provider_id]
        for _pid in providers_to_gate:
            _meta = BUILTIN_PROVIDERS.get(_pid) or {}
            _mt = _meta.get("min_tier")
            if _mt and _ranks.get(tier, 0) < _ranks.get(_mt, 0):
                raise HTTPException(
                    status_code=403,
                    detail=f"Model '{_pid}' requires tier '{_mt}' or higher (current: {tier})",
                )

        # Parse both up front. Explicit per-gate approval takes priority
        # over scope grant — scope only helps FUTURE gates, while the user
        # is trying to clear the gate the model is currently holding. If
        # both phrases appear in one message (common when the user pastes
        # or the mobile UI concatenates the assistant's full approval line),
        # we clear the gate AND record the scope grant as a bonus.
        gate_id_to_approve = _parse_approve_gate(body.content)
        scope_to_grant = _parse_approve_scope(body.content)

        async def _grant_scope_if_valid(scope: str) -> tuple[bool, str]:
            """Validate + grant a scope. Returns (granted, status_note)."""
            from ..config.policy_loader import get_scope_categories, get_safety_floor_actions
            valid_scopes = get_scope_categories()
            safety_floor = get_safety_floor_actions()
            if scope in safety_floor:
                return False, f"`{scope}` is on the safety floor and cannot be pre-approved."
            if scope not in valid_scopes:
                return False, f"`{scope}` is not a recognized scope."
            from ..storage.domain import check_scope_grant_tier
            try:
                await check_scope_grant_tier(uid)
            except ValueError as _terr:
                return False, str(_terr)
            await storage.grant_approval_scope(uid, scope)
            meta = valid_scopes[scope]
            return True, f"`{scope}` — {meta['label']} pre-approved."

        if gate_id_to_approve:
            pending = _pending_gates.get(conv_id)
            user_msg = await storage.create_message({
                "conversation_id": conv_id,
                "role": "user",
                "content": body.content,
                "model": model_id,
                "metadata": {"tier": tier},
            })
            gate_matched = (
                pending
                and pending.get("gate_id") == gate_id_to_approve
                and pending.get("uid", uid) == uid
            )
            scope_note = ""
            if scope_to_grant and uid:
                granted, note = await _grant_scope_if_valid(scope_to_grant)
                scope_note = f"\n\n[SCOPE BONUS] {note}" if granted else f"\n\n[SCOPE SKIPPED] {note}"
            if gate_matched:
                _pending_gates.pop(conv_id, None)
                replay_provider = pending["provider_id"]
                from ..services.tool_executor import (
                    set_approval_scope_user_id,
                    set_allowed_tools as _set_at,
                    reset_allowed_tools as _reset_at,
                )
                set_approval_scope_user_id(uid or None)
                _gate_tools = pending.get("enabled_tools")
                _t_gate_at = _set_at(list(_gate_tools) if isinstance(_gate_tools, list) else None)
                try:
                    approved_content, approved_usage = await call_provider(
                        provider_id=replay_provider,
                        messages=pending["history"],
                        system_prompt=pending["system_prompt"],
                        user_id=uid or None,
                        skip_approval=True,
                    )
                finally:
                    set_approval_scope_user_id(None)
                    _reset_at(_t_gate_at)
                reply = f"[APPROVED — gate {gate_id_to_approve} cleared]{scope_note}\n\n{approved_content}"
            else:
                replay_provider = "system"
                reply = (
                    f"[APPROVE ERROR] Gate `{gate_id_to_approve}` not found or already consumed. "
                    f"If you meant to pre-approve a category, use: APPROVE SCOPE <scope>{scope_note}"
                )
                approved_usage = {}
            _attach_cost_usd(approved_usage, replay_provider)
            assistant_msg = await storage.create_message({
                "conversation_id": conv_id,
                "role": "assistant",
                "content": reply,
                "model": replay_provider,
                "metadata": {
                    "tier": tier,
                    "gate_approved": gate_id_to_approve,
                    "scope_bonus": scope_to_grant if scope_note.startswith("\n\n[SCOPE BONUS]") else None,
                    "usage": approved_usage,
                    "cache": cache_breakdown(approved_usage),
                },
            })
            return {
                "user_message": user_msg,
                "assistant_message": assistant_msg,
                "conversation_id": conv_id,
            }

        # Scope-only path: require strict line-anchored phrasing so
        # incidental prose like "I want to APPROVE SCOPE publish" doesn't
        # silently grant a scope on a normal chat turn. The bonus path
        # above (gate + scope) keeps the tolerant search because the gate
        # approval already proves explicit intent.
        import re as _re_strict
        scope_only_strict = bool(scope_to_grant) and bool(
            _re_strict.search(
                r"(?m)^\s*APPROVE\s+SCOPE\s+", body.content, _re_strict.IGNORECASE
            )
        )
        if scope_to_grant and uid and scope_only_strict:
            from ..config.policy_loader import get_scope_categories, get_safety_floor_actions
            valid_scopes = get_scope_categories()
            safety_floor = get_safety_floor_actions()

            user_msg = await storage.create_message({
                "conversation_id": conv_id,
                "role": "user",
                "content": body.content,
                "model": model_id,
                "metadata": {"tier": tier},
            })

            from ..storage.domain import check_scope_grant_tier
            if scope_to_grant in safety_floor:
                reply = (
                    f"[SCOPE DENIED] `{scope_to_grant}` is on the safety floor and cannot be pre-approved. "
                    f"It will always require explicit per-gate approval."
                )
                replay_result = None
            elif scope_to_grant not in valid_scopes:
                known = ", ".join(f"`{s}`" for s in valid_scopes)
                reply = (
                    f"[SCOPE UNKNOWN] `{scope_to_grant}` is not a recognized scope. "
                    f"Valid scopes: {known}"
                )
                replay_result = None
            else:
                try:
                    await check_scope_grant_tier(uid)
                except ValueError as _tier_err:
                    reply = f"[SCOPE DENIED] {_tier_err}"
                    replay_result = None
                    assistant_msg = await storage.create_message({
                        "conversation_id": conv_id,
                        "role": "assistant",
                        "content": reply,
                        "model": "system",
                        "metadata": {"tier": tier, "scope_grant_denied": scope_to_grant},
                    })
                    return {
                        "user_message": user_msg,
                        "assistant_message": assistant_msg,
                        "conversation_id": conv_id,
                    }
                await storage.grant_approval_scope(uid, scope_to_grant)
                meta = valid_scopes[scope_to_grant]
                reply = (
                    f"[SCOPE GRANTED] `{scope_to_grant}` — {meta['label']} pre-approved. "
                    f"Covers: {meta['description']}."
                )
                raw_pending = _pending_gates.get(conv_id)
                pending = raw_pending if (raw_pending and raw_pending.get("uid", uid) == uid) else None
                if pending:
                    _pending_gates.pop(conv_id, None)
                    from ..services.tool_executor import (
                        set_approval_scope_user_id,
                        set_allowed_tools as _set_at2,
                        reset_allowed_tools as _reset_at2,
                    )
                    set_approval_scope_user_id(uid or None)
                    _scope_gate_tools = pending.get("enabled_tools")
                    _t_sg_at = _set_at2(
                        list(_scope_gate_tools) if isinstance(_scope_gate_tools, list) else None
                    )
                    try:
                        replay_content, replay_usage = await call_provider(
                            provider_id=pending["provider_id"],
                            messages=pending["history"],
                            system_prompt=pending["system_prompt"],
                            user_id=uid or None,
                        )
                    finally:
                        set_approval_scope_user_id(None)
                        _reset_at2(_t_sg_at)
                    replay_result = {"content": replay_content, "usage": replay_usage}
                    reply += f"\n\nRetrying blocked action...\n\n{replay_content}"
                    if replay_usage.get("approval_state") == "pending":
                        _store_pending_gate(conv_id, {
                            "gate_id": replay_usage.get("gate_id"),
                            "history": pending["history"],
                            "system_prompt": pending["system_prompt"],
                            "provider_id": pending["provider_id"],
                            "uid": uid,
                            # Carry the allow-list forward so subsequent replays
                            # continue to respect the original tool selection.
                            "enabled_tools": pending.get("enabled_tools"),
                        })
                else:
                    replay_result = None

            assistant_msg = await storage.create_message({
                "conversation_id": conv_id,
                "role": "assistant",
                "content": reply,
                "model": "system",
                "metadata": {"tier": tier, "scope_grant": scope_to_grant, "replayed": replay_result is not None},
            })
            return {
                "user_message": user_msg,
                "assistant_message": assistant_msg,
                "conversation_id": conv_id,
            }

        system_prompt = await build_system_prompt(tier, agent_persona=agent_persona)

        # Inject conduct slot character (swarm_context) directly from the
        # instance row — the presence that wraps the energy provider.
        if _from_conduct and _conduct_sc:
            system_prompt = (system_prompt or "") + f"\n\n## Character\n{_conduct_sc}"

        # Inject per-conversation context boost if set.
        _boost = (conv.get("context_boost") or "").strip()
        if _boost and system_prompt is not None:
            system_prompt = system_prompt + f"\n\n## Context Boost\n{_boost}"
        elif _boost:
            system_prompt = f"## Context Boost\n{_boost}"

        user_msg = await storage.create_message({
            "conversation_id": conv_id,
            "role": "user",
            "content": body.content,
            "model": model_id,
            "metadata": {"tier": tier},
        })

        if body.attachment_ids:
            await storage.attach_to_message(body.attachment_ids, user_msg["id"], uid)

        prior_msgs = await storage.get_messages(conv_id)
        msg_ids = [m["id"] for m in prior_msgs if m["role"] in ("user", "assistant")]
        att_map = await storage.get_attachments_for_messages(msg_ids) if msg_ids else {}
        history: list[dict] = []
        for m in prior_msgs:
            if m["role"] not in ("user", "assistant"):
                continue
            entry: dict = {"role": m["role"], "content": m["content"]}
            atts = att_map.get(m["id"], [])
            if atts:
                entry["attachments"] = [
                    {"storage_url": a.get("storage_url"), "mime_type": a.get("mime_type")}
                    for a in atts
                ]
            history.append(entry)

        # Cap context window: keep first message (task anchor) + last N-1 messages.
        # Prevents runaway input costs on long write-heavy sessions (e.g. website
        # construction) where assistant messages accumulate large file content.
        _MAX_HISTORY = 40
        if len(history) > _MAX_HISTORY:
            history = history[:1] + history[-(_MAX_HISTORY - 1):]

        from ..services.tool_executor import (
            set_approval_scope_user_id,
            set_allowed_tools, reset_allowed_tools,
        )
        from ..services.run_context import (
            current_orchestration_mode, current_cut_mode, current_user_tier,
            current_max_tool_rounds,
        )
        from ..services.orch_progress import (
            current_client_run_id,
            publish as _publish_progress,
            register_owner as _register_owner,
            unregister_owner as _unregister_owner,
        )
        # Resolve orchestration knobs: per-message override → user pref → defaults.
        eff_mode = (body.orchestration_mode or "single").strip() or "single"
        eff_cut = (body.cut_mode or "soft").strip() or "soft"
        if uid and (body.orchestration_mode is None or body.cut_mode is None):
            from sqlalchemy import text as _ptxt
            async with engine.connect() as _c:
                _r = (await _c.execute(_ptxt(
                    "SELECT key, value FROM settings WHERE user_id = :u "
                    "AND key IN ('orchestration_mode', 'cut_mode')"
                ), {"u": uid})).mappings().all()
            for _row in _r:
                _v = _row["value"]
                if isinstance(_v, dict):
                    _v = _v.get("v") or _v.get("value")
                if _row["key"] == "orchestration_mode" and body.orchestration_mode is None and _v:
                    eff_mode = str(_v)
                if _row["key"] == "cut_mode" and body.cut_mode is None and _v:
                    eff_cut = str(_v)
        eff_providers = body.providers or [provider_id]

        set_approval_scope_user_id(uid or None)
        # Effective tool allow-list: intersect per-agent list with per-conv
        # list. None from either source means "no restriction from that
        # source". An empty agent list means the agent has no tools at all
        # (use_tools=False is already set on agent_inst in that case).
        _conv_tools = conv.get("enabled_tools")
        _agent_etl = (
            agent_inst.meta.get("enabled_tools")
            if agent_inst is not None
            else None
        )
        if _agent_etl is not None:
            if isinstance(_conv_tools, list):
                _eff_tools: Optional[list] = [t for t in _agent_etl if t in _conv_tools]
            else:
                _eff_tools = list(_agent_etl)
            _t_at = set_allowed_tools(_eff_tools)
        else:
            _t_at = set_allowed_tools(
                list(_conv_tools) if isinstance(_conv_tools, list) else None
            )
        _t_om = current_orchestration_mode.set(eff_mode)
        _t_cm = current_cut_mode.set(eff_cut)
        _t_ut = current_user_tier.set(tier)
        # Per-conversation tool-round cap: None → use global default (5).
        _t_mr = current_max_tool_rounds.set(conv.get("max_tool_rounds"))
        # Bind the run id to the orch_progress ContextVar for downstream emitters.
        _t_cri = current_client_run_id.set(body.client_run_id or None)
        # Register ownership before any publish so the SSE endpoint can
        # gate subscribers. On replay/hijack conflict, strip the id so
        # nothing publishes under it; the chat POST completes normally.
        if body.client_run_id:
            try:
                _register_owner(body.client_run_id, uid or None)
            except ValueError:
                body.client_run_id = None
                current_client_run_id.reset(_t_cri)
                _t_cri = current_client_run_id.set(None)
        # Inference mode: per-conversation override of tool-use behavior.
        # "agentic" (default) — full tool loop enabled.
        # "direct"            — tools disabled; single-pass answer only.
        # "swarm"             — reserved; currently treated as agentic.
        _inf_mode = (conv.get("inference_mode") or "agentic").strip()

        from ..services.slot_locks import conduct_turn_enter, conduct_turn_exit
        if _from_conduct:
            conduct_turn_enter()
        try:
            if eff_mode == "single":
                # ALWAYS build the executor from the gated model_id, never
                # from agent_inst. Reusing agent_inst here would bypass the
                # tier/kill-switch gates above when a caller pins a
                # restricted forge agent and overrides body.model with a
                # permitted one — gates would check body.model but
                # execution would use agent_inst.model_id. agent_inst's
                # role is purely persona/metadata loading (already folded
                # into system_prompt via build_system_prompt above).
                inst = AgentInstance.from_model(
                    model_id=provider_id,
                    user_id=uid or None,
                    enforce_tier=False,
                    enforce_enabled=False,
                )
                if _inf_mode == "direct":
                    inst.use_tools = False
                elif agent_inst is not None and not agent_inst.use_tools:
                    # Forge agent has no tools configured — propagate that
                    # to the executor so the provider never sees tool schemas.
                    inst.use_tools = False
                content, usage = await inst.run(
                    history,
                    system_prompt_override=system_prompt or None,
                )
                print(f"[chat-dbg] provider={inst.provider_id!r} hist_len={len(history)} content_len={len(content or '')} content_preview={repr((content or '')[:80])}")
                # Use the resolved provider_id from the instance — for forge
                # agents whose model_id is "gpt-5-mini" this is "openai".
                provider_id = inst.provider_id or provider_id
                usage = dict(usage or {})
                usage.setdefault("orchestration_mode", "single")
                usage.setdefault("providers", [provider_id])
            else:
                # Multi-model orchestration is a model-voice comparator, not an
                # agentic surface. Do NOT carry the forge agent persona into
                # fan_out/council/daisy_chain — those compare raw provider
                # outputs without an attached agent identity. Tools are also
                # disabled by the multi-model hub (single-branch only).
                from ..services.inference_modes import run_inference_with_mode
                content, usage = await run_inference_with_mode(
                    messages=history,
                    orchestration_mode=eff_mode,
                    providers=eff_providers,
                    cut_mode=eff_cut,
                    user_id=uid or None,
                    system_prompt=None,
                )
        finally:
            if _from_conduct:
                conduct_turn_exit()
            # Bookend so subscribed SSE streams close immediately, even on errors.
            if body.client_run_id:
                try:
                    _publish_progress("orchestration_done", {
                        "client_run_id": body.client_run_id,
                    })
                except Exception:
                    pass
                try:
                    _unregister_owner(body.client_run_id)
                except Exception:
                    pass
            set_approval_scope_user_id(None)
            reset_allowed_tools(_t_at)
            current_orchestration_mode.reset(_t_om)
            current_cut_mode.reset(_t_cm)
            current_user_tier.reset(_t_ut)
            current_max_tool_rounds.reset(_t_mr)
            current_client_run_id.reset(_t_cri)

        if usage.get("approval_state") == "pending":
            _store_pending_gate(conv_id, {
                "gate_id": usage.get("gate_id"),
                "history": history,
                "system_prompt": system_prompt or None,
                "provider_id": provider_id,
                "uid": uid,
                # Persist the allow-list so approval replay uses the same tool set.
                "enabled_tools": list(_conv_tools) if isinstance(_conv_tools, list) else None,
            })

        _attach_cost_usd(usage, provider_id)

        assistant_msg = await storage.create_message({
            "conversation_id": conv_id,
            "role": "assistant",
            "content": content,
            "model": provider_id,
            # The Message model has no orchestration_mode / cut_mode columns;
            # those live on agent_runs. Fold them into metadata so the UI can
            # still surface them per-message via msg.metadata.orchestration_mode.
            "metadata": {
                "tier": tier,
                "usage": usage,
                "cache": cache_breakdown(usage),
                "orchestration_mode": eff_mode,
                "cut_mode": eff_cut,
                "inference_mode": _inf_mode,
            },
        })

        from ..engine.zeta import _zeta_engine
        _spawn_bg(
            _zeta_engine.evaluate(
                assistant_text=content,
                provider=provider_id,
                user_text=body.content,
            ),
            name=f"zeta-eval-conv{conv_id}",
        )

        return {
            "user_message": user_msg,
            "assistant_message": assistant_msg,
            "conversation_id": conv_id,
        }
    except HTTPException:
        raise
    except Exception as exc:
        tb = traceback.format_exc()
        print(f"[chat] send_message error: {exc}\n{tb}")
        raise HTTPException(status_code=500, detail=f"Chat error: {exc}")


# === CONTRACTS ===
# id: chat_get_other_owner_404
#   given: GET /api/v1/conversations/{id} with x-user-id != row.user_id
#   then:  404 (existence non-disclosure, never 403 or 200)
#   class: security
#   call:  python.tests.contracts.chat.test_get_other_owner_404
#
# id: chat_delete_other_owner_404
#   given: DELETE /api/v1/conversations/{id} with x-user-id != row.user_id
#   then:  404; the row remains intact for the real owner
#   class: security
#   call:  python.tests.contracts.chat.test_delete_other_owner_404
#
# id: chat_unknown_body_model_400
#   given: POST /api/v1/conversations/{id}/messages with body.model that
#          the catalog cannot resolve
#   then:  400 with a detail naming the unknown id (no silent fallback to
#          active_provider — server-side sources still fall back, only
#          user input is strict)
#   class: correctness
#   call:  python.tests.contracts.chat.test_unknown_body_model_400
# === END CONTRACTS ===
<<<<<<< HEAD
# 637:187 2:7 2:16
=======
# 641:171
>>>>>>> origin/pr/32
