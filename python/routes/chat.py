# 338:15
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
    model: str = "gemini"
    agent_id: Optional[int] = None
    # Note: userId from body is now ignored — owner is always the authenticated caller.


class UpdateConversation(BaseModel):
    title: str


class SendMessage(BaseModel):
    content: str
    model: Optional[str] = None
    agent_id: Optional[int] = None


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
async def list_conversations(request: Request, agent_id: int | None = None):
    """List conversations.

    Defaults to a0-only (excludes any conversation pinned to a Forge agent).
    Pass ?agent_id=<id> to fetch only conversations pinned to that agent —
    used by the Forge tab's inline chat surface.
    """
    uid = _caller_uid(request)
    if not uid:
        raise HTTPException(status_code=401, detail="authentication required")
    return await storage.get_conversations(user_id=uid, agent_id=agent_id)


@router.post("/conversations")
async def create_conversation(body: CreateConversation, request: Request):
    uid = _caller_uid(request)
    data: dict = {"title": body.title, "model": body.model}
    if uid:
        data["user_id"] = uid
    return await storage.create_conversation(data)


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
    return await storage.get_messages(conv_id)


async def _build_system_prompt(tier: str, agent_persona: str | None = None) -> str:
    """Compose system prompt with stable→volatile ordering for max cache reuse.

    Order (most stable first; cache prefix grows as we go down):
      1. a0_identity      — global, immutable across all users
      2. system_base      — global, edited rarely
      3. tier_context     — stable per tier (free / supporter / ws / admin)
      4. agent_persona    — stable per Forge agent across many turns (optional)
      5. memory seeds     — volatile (user edits weights/text frequently)

    The break between (4) and (5) is where Anthropic places its 2nd cache_control
    breakpoint, so seed edits only invalidate the seed segment, not the whole
    prefix. See _call_anthropic.
    """
    context_name = get_tier_context_name(tier)
    a0_identity = await get_context_value("a0_identity")
    system_base = await get_context_value("system_base")
    tier_context = await get_context_value(context_name)

    parts: list[str] = []
    if a0_identity:
        parts.append(a0_identity)
    if system_base:
        parts.append(system_base)
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
    """Return scope name if message is 'APPROVE SCOPE <scope>', else None."""
    stripped = content.strip()
    import re as _re
    m = _re.match(r"^APPROVE\s+SCOPE\s+(\S+)$", stripped, _re.IGNORECASE)
    return m.group(1).lower() if m else None


def _parse_approve_gate(content: str) -> str | None:
    """Return gate_id if message is 'APPROVE gate-<hex>', else None."""
    import re as _re
    m = _re.match(r"^APPROVE\s+(gate-[0-9a-f]+)$", content.strip(), _re.IGNORECASE)
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

        # Forge agent binding: per-message agent_id wins, else fall back to the
        # conversation's pinned agent. Agent loaded once per send.
        agent_persona: Optional[str] = None
        agent_model_id: Optional[str] = None
        effective_agent_id = body.agent_id or conv.get("agent_id")
        if effective_agent_id and uid:
            from sqlalchemy import text as _text2
            async with engine.connect() as conn:
                arow = (await conn.execute(_text2(
                    "SELECT model_id, system_prompt FROM agent_instances "
                    "WHERE id = :id AND owner_id = :uid AND is_template = false"
                ), {"id": effective_agent_id, "uid": uid})).mappings().first()
            if arow:
                agent_persona = arow["system_prompt"]
                agent_model_id = arow["model_id"]

        model_id = body.model or agent_model_id or conv.get("model", "grok")
        provider_id = energy_registry.get_active_provider() or model_id

        # Tier-gate restricted models (e.g. gemini3 = ws/admin only).
        prov_meta = energy_registry.get(provider_id) or {}
        min_tier = prov_meta.get("min_tier")
        if min_tier:
            _ranks = {"free": 0, "supporter": 1, "ws": 2, "admin": 3}
            if _ranks.get(tier, 0) < _ranks.get(min_tier, 0):
                raise HTTPException(
                    status_code=403,
                    detail=f"Model '{provider_id}' requires tier '{min_tier}' or higher (current: {tier})",
                )

        scope_to_grant = _parse_approve_scope(body.content)
        if scope_to_grant and uid:
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

        gate_id_to_approve = _parse_approve_gate(body.content)
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
                reply = f"[APPROVED — gate {gate_id_to_approve} cleared]\n\n{approved_content}"
            else:
                replay_provider = "system"
                reply = (
                    f"[APPROVE ERROR] Gate `{gate_id_to_approve}` not found or already consumed. "
                    f"If you meant to pre-approve a category, use: APPROVE SCOPE <scope>"
                )
                approved_usage = {}
            assistant_msg = await storage.create_message({
                "conversation_id": conv_id,
                "role": "assistant",
                "content": reply,
                "model": replay_provider,
                "metadata": {"tier": tier, "gate_approved": gate_id_to_approve, "usage": approved_usage, "cache": energy_registry.cache_breakdown(approved_usage)},
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

        prior_msgs = await storage.get_messages(conv_id)
        history = [
            {"role": m["role"], "content": m["content"]}
            for m in prior_msgs
            if m["role"] in ("user", "assistant")
        ]

        from ..services.tool_executor import set_approval_scope_user_id
        set_approval_scope_user_id(uid or None)
        try:
            content, usage = await call_energy_provider(
                provider_id=provider_id,
                messages=history,
                system_prompt=system_prompt or None,
                user_id=uid or None,
            )
        finally:
            set_approval_scope_user_id(None)

        if usage.get("approval_state") == "pending":
            _store_pending_gate(conv_id, {
                "gate_id": usage.get("gate_id"),
                "history": history,
                "system_prompt": system_prompt or None,
                "provider_id": provider_id,
                "uid": uid,
            })

        assistant_msg = await storage.create_message({
            "conversation_id": conv_id,
            "role": "assistant",
            "content": content,
            "model": provider_id,
            "metadata": {"tier": tier, "usage": usage, "cache": energy_registry.cache_breakdown(usage)},
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
# 338:15
