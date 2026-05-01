# 635:175
import time
import traceback
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional

from ..storage import storage
from ..services.stripe_service import get_tier_context_name
from ..services.energy_registry import energy_registry
from ..services.inference import call_energy_provider
from ..services.bg_tasks import spawn as _spawn_bg
from .contexts import get_context_value

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
    if not energy_registry.get_provider(provider_id):
        return
    try:
        cb = energy_registry.cache_breakdown(usage)
        cost = energy_registry.estimate_cost(
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
# DOC endpoint: GET /api/v1/conversations | List all conversations for the current user
# DOC endpoint: POST /api/v1/conversations | Create a new conversation
# DOC endpoint: GET /api/v1/conversations/{id} | Get a single conversation
# DOC endpoint: PATCH /api/v1/conversations/{id} | Update conversation metadata
# DOC endpoint: DELETE /api/v1/conversations/{id} | Delete a conversation
# DOC endpoint: GET /api/v1/conversations/{id}/messages | List messages in a conversation
# DOC endpoint: POST /api/v1/conversations/{id}/messages | Send a message and receive a reply

UI_META = {
    "tab_id": "chat",
    "label": "Chat",
    "icon": "MessageSquare",
    "order": 1,
    "sections": [
        {
            "id": "conversations",
            "label": "Conversations",
            "endpoint": "/api/v1/conversations",
            "fields": [
                {"key": "id", "type": "text", "label": "ID"},
                {"key": "title", "type": "text", "label": "Title"},
                {"key": "model", "type": "badge", "label": "Model"},
                {"key": "created_at", "type": "text", "label": "Created"},
            ],
        },
        {
            "id": "messages",
            "label": "Messages",
            "endpoint": "/api/v1/conversations/{id}/messages",
            "fields": [
                {"key": "role", "type": "badge", "label": "Role"},
                {"key": "content", "type": "text", "label": "Content"},
                {"key": "model", "type": "badge", "label": "Model"},
            ],
        },
    ],
}

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
    model = body.model or energy_registry.get_active_provider()
    if not model:
        raise HTTPException(
            status_code=503,
            detail=(
                "No model resolvable: request had no `model` and no global "
                "active_provider is set. Set one via POST /api/agents/active-provider."
            ),
        )
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


async def _build_system_prompt(tier: str, agent_persona: str | None = None) -> str:
    """Compose system prompt with stable→volatile ordering for max cache reuse.

    Order (most stable first; cache prefix grows as we go down):
      1. a0_identity        — global, immutable across all users
      2. system_base        — global, edited rarely
      3. anti_hallucination — global grounding rules, edited rarely
      4. tier_context       — stable per tier (free / supporter / ws / admin)
      5. agent_persona      — stable per Forge agent across many turns (optional)
      6. memory seeds       — volatile (user edits weights/text frequently)

    The break between (5) and (6) is where Anthropic places its 2nd cache_control
    breakpoint, so seed edits only invalidate the seed segment, not the whole
    prefix. See _call_anthropic.
    """
    context_name = get_tier_context_name(tier)
    a0_identity = await get_context_value("a0_identity")
    system_base = await get_context_value("system_base")
    anti_hallucination = await get_context_value("anti_hallucination")
    tier_context = await get_context_value(context_name)

    parts: list[str] = []
    if a0_identity:
        parts.append(a0_identity)
    if system_base:
        parts.append(system_base)
    if anti_hallucination:
        parts.append(anti_hallucination)
    if tier_context:
        parts.append(tier_context)
    if agent_persona:
        parts.append(f"## Persona\n{agent_persona}")

    seeds = await storage.get_memory_seeds()
    active_seeds = [
        s for s in seeds
        if s.get("enabled") and (s.get("summary") or "").strip()
    ]
    active_seeds.sort(key=lambda s: float(s.get("weight", 1.0)), reverse=True)
    if active_seeds:
        seed_lines = []
        for s in active_seeds:
            label = s.get("label", f"Seed {s.get('seed_index', '?')}")
            summary = s.get("summary", "").strip()
            seed_lines.append(f"- [{label}]: {summary}")
        parts.append("## Memory\n" + "\n".join(seed_lines))

    return "\n\n".join(parts)


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
                # Preserve today's behavior: chat single-mode always allows
                # tools regardless of the per-agent enabled_tools list.
                # Per-agent tool gating is a follow-up; honoring it here
                # would silently regress existing forge agents.
                agent_inst.use_tools = True

        # Honest resolution chain (no silent fallback to a hardcoded provider):
        #   per-message body.model > agent's configured model > current
        #   global active_provider > stored conversation model.
        # active_provider wins over conv.model so toggling the global active
        # provider via /api/agents/active-provider takes effect on the next
        # turn of every existing conversation. If all four are empty we
        # cannot route, so refuse — same principle as the inference
        # dispatcher's no-silent-fallback contract.
        model_from_body = bool(body.model)
        model_id = (
            body.model
            or agent_model_id
            or energy_registry.get_active_provider()
            or conv.get("model")
        )
        if not model_id:
            raise HTTPException(
                status_code=503,
                detail=(
                    "No model resolvable for this turn: no body.model, no agent "
                    "model, no active_provider set, and conversation has no "
                    "stored model. Set the global default via "
                    "POST /api/agents/active-provider."
                ),
            )
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
            provider_id = energy_registry.get_active_provider() or model_id

        # Tier-gate restricted models (e.g. gemini3 = ws/admin only).
        # Gate the *resolved* provider list — never raw body.providers — so
        # aliases like "active" can't smuggle a ws-only model past the gate
        # by being inert at request time and resolving to gemini3 at exec
        # time. resolve_providers() is the same path inference uses.
        from ..services.energy_registry import resolve_providers as _resolve
        _ranks = {"free": 0, "supporter": 1, "ws": 2, "admin": 3}
        _mode_for_gate = (body.orchestration_mode or "single").strip() or "single"
        if _mode_for_gate != "single" and body.providers:
            providers_to_gate = _resolve(body.providers) or [provider_id]
        else:
            providers_to_gate = [provider_id]
        # Read seed flags once for the providers we're about to call.
        from .energy import _get_seed_module as _gsm
        for _pid in providers_to_gate:
            _meta = energy_registry.get_provider(_pid) or {}
            _mt = _meta.get("min_tier")
            if _mt and _ranks.get(tier, 0) < _ranks.get(_mt, 0):
                raise HTTPException(
                    status_code=403,
                    detail=f"Model '{_pid}' requires tier '{_mt}' or higher (current: {tier})",
                )
            # Per-provider kill switch from seed route_config.enabled.
            # Default True when missing so existing seeds keep working.
            _seed = await _gsm(_pid)
            _rc = (_seed or {}).get("route_config") or {}
            if _rc.get("enabled") is False:
                raise HTTPException(
                    status_code=400,
                    detail=f"Provider '{_pid}' is disabled in energy settings",
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
                from ..services.tool_executor import set_approval_scope_user_id
                set_approval_scope_user_id(uid or None)
                try:
                    approved_content, approved_usage = await call_energy_provider(
                        provider_id=replay_provider,
                        messages=pending["history"],
                        system_prompt=pending["system_prompt"],
                        user_id=uid or None,
                        skip_approval=True,
                    )
                finally:
                    set_approval_scope_user_id(None)
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
                    "cache": energy_registry.cache_breakdown(approved_usage),
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
                    from ..services.tool_executor import set_approval_scope_user_id
                    set_approval_scope_user_id(uid or None)
                    try:
                        replay_content, replay_usage = await call_energy_provider(
                            provider_id=pending["provider_id"],
                            messages=pending["history"],
                            system_prompt=pending["system_prompt"],
                            user_id=uid or None,
                        )
                    finally:
                        set_approval_scope_user_id(None)
                    replay_result = {"content": replay_content, "usage": replay_usage}
                    reply += f"\n\nRetrying blocked action...\n\n{replay_content}"
                    if replay_usage.get("approval_state") == "pending":
                        _store_pending_gate(conv_id, {
                            "gate_id": replay_usage.get("gate_id"),
                            "history": pending["history"],
                            "system_prompt": pending["system_prompt"],
                            "provider_id": pending["provider_id"],
                            "uid": uid,
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

        system_prompt = await _build_system_prompt(tier, agent_persona=agent_persona)

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

        from ..services.tool_executor import set_approval_scope_user_id
        from ..services.run_context import (
            current_orchestration_mode, current_cut_mode, current_user_tier,
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
        _t_om = current_orchestration_mode.set(eff_mode)
        _t_cm = current_cut_mode.set(eff_cut)
        _t_ut = current_user_tier.set(tier)
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
        try:
            if eff_mode == "single":
                # ALWAYS build the executor from the gated model_id, never
                # from agent_inst. Reusing agent_inst here would bypass the
                # tier/kill-switch gates above when a caller pins a
                # restricted forge agent and overrides body.model with a
                # permitted one — gates would check body.model but
                # execution would use agent_inst.model_id. agent_inst's
                # role is purely persona/metadata loading (already folded
                # into system_prompt via _build_system_prompt above).
                inst = AgentInstance.from_model(
                    model_id=model_id,
                    user_id=uid or None,
                    enforce_tier=False,
                    enforce_enabled=False,
                )
                content, usage = await inst.run(
                    history,
                    system_prompt_override=system_prompt or None,
                )
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
            current_orchestration_mode.reset(_t_om)
            current_cut_mode.reset(_t_cm)
            current_user_tier.reset(_t_ut)
            current_client_run_id.reset(_t_cri)

        if usage.get("approval_state") == "pending":
            _store_pending_gate(conv_id, {
                "gate_id": usage.get("gate_id"),
                "history": history,
                "system_prompt": system_prompt or None,
                "provider_id": provider_id,
                "uid": uid,
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
                "cache": energy_registry.cache_breakdown(usage),
                "orchestration_mode": eff_mode,
                "cut_mode": eff_cut,
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
# 635:175
