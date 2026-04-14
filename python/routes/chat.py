# 338:15
import traceback
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional

from ..storage import storage
from ..services.stripe_service import get_tier_context_name
from ..services.energy_registry import energy_registry
from ..services.inference import call_energy_provider
from .contexts import get_context_value

# In-memory pending gate store: conv_id → {gate_id, history, system_prompt, provider_id, uid}
# Used to replay a blocked action when the user grants a scope.
_pending_gates: dict[int, dict] = {}

# DOC module: chat
# DOC label: Chat
# DOC description: Manages conversations and messages between users and the agent. Supports streaming replies, conversation history, and per-conversation metadata.
# DOC tier: free
# DOC endpoint: GET /api/v1/conversations | List all conversations for the current user
# DOC endpoint: POST /api/v1/conversations | Create a new conversation
# DOC endpoint: GET /api/v1/conversations/{id} | Get a single conversation
# DOC endpoint: PATCH /api/v1/conversations/{id} | Update conversation metadata
# DOC endpoint: DELETE /api/v1/conversations/{id} | Delete a conversation
# DOC endpoint: PATCH /api/v1/conversations/{id}/archive | Archive or unarchive a conversation
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
        {"method": "PATCH", "path": "/api/v1/conversations/{id}/archive"},
        {"method": "GET", "path": "/api/v1/conversations/{id}/messages"},
        {"method": "POST", "path": "/api/v1/conversations/{id}/messages"},
    ],
}

router = APIRouter(prefix="/api/v1", tags=["chat"])


async def _ensure_chat_schema() -> None:
    from ..database import engine
    from sqlalchemy import text as _text
    async with engine.begin() as conn:
        await conn.execute(_text(
            "ALTER TABLE conversations ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE"
        ))


class CreateConversation(BaseModel):
    title: str = "New Chat"
    model: str = "gemini"
    userId: Optional[str] = None


class UpdateConversation(BaseModel):
    title: str


class SendMessage(BaseModel):
    content: str
    model: Optional[str] = None


@router.get("/conversations")
async def list_conversations(archived: bool = False):
    from ..database import engine
    from sqlalchemy import text as _text
    async with engine.connect() as conn:
        rows = await conn.execute(
            _text("""
                SELECT c.id, c.title, c.model, c.user_id, c.context_boost,
                       c.parent_conv_id, c.subagent_status, c.archived,
                       c.created_at, c.updated_at,
                       COALESCE(m.total_tokens, 0) AS total_tokens
                FROM conversations c
                LEFT JOIN (
                    SELECT conversation_id,
                           SUM(prompt_tokens + completion_tokens) AS total_tokens
                    FROM cost_metrics GROUP BY conversation_id
                ) m ON m.conversation_id = c.id
                WHERE c.archived = :archived
                ORDER BY c.updated_at DESC
            """),
            {"archived": archived},
        )
        return [dict(r) for r in rows.mappings()]


@router.post("/conversations")
async def create_conversation(body: CreateConversation):
    data = {"title": body.title, "model": body.model}
    if body.userId:
        data["user_id"] = body.userId
    return await storage.create_conversation(data)


@router.get("/conversations/{conv_id}")
async def get_conversation(conv_id: int):
    conv = await storage.get_conversation(conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="conversation not found")
    return conv


@router.patch("/conversations/{conv_id}")
async def update_conversation(conv_id: int, body: UpdateConversation):
    await storage.update_conversation_title(conv_id, body.title)
    return {"ok": True}


@router.delete("/conversations/{conv_id}")
async def delete_conversation(conv_id: int):
    await storage.delete_conversation(conv_id)
    return {"ok": True}


class ArchiveConversation(BaseModel):
    archived: bool = True


@router.patch("/conversations/{conv_id}/archive")
async def archive_conversation(conv_id: int, body: ArchiveConversation):
    from ..database import engine
    from sqlalchemy import text as _text
    async with engine.begin() as conn:
        await conn.execute(
            _text("UPDATE conversations SET archived = :archived WHERE id = :id"),
            {"archived": body.archived, "id": conv_id},
        )
    return {"ok": True, "archived": body.archived}


@router.get("/conversations/{conv_id}/tokens")
async def get_conversation_tokens(conv_id: int):
    from ..database import engine
    from sqlalchemy import text as _text
    async with engine.connect() as conn:
        row = await conn.execute(
            _text("""
                SELECT
                    COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
                    COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
                    COALESCE(SUM(prompt_tokens + completion_tokens), 0) AS total_tokens,
                    COALESCE(SUM(estimated_cost), 0) AS estimated_cost
                FROM cost_metrics
                WHERE conversation_id = :conv_id
            """),
            {"conv_id": conv_id},
        )
        rec = row.mappings().first()
    return dict(rec) if rec else {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0, "estimated_cost": 0}


@router.get("/conversations/{conv_id}/messages")
async def list_messages(conv_id: int):
    return await storage.get_messages(conv_id)


async def _build_system_prompt(tier: str) -> str:
    context_name = get_tier_context_name(tier)
    a0_identity = await get_context_value("a0_identity")
    system_base = await get_context_value("system_base")
    tier_context = await get_context_value(context_name)

    parts = []
    if a0_identity:
        parts.append(a0_identity)
    if system_base:
        parts.append(system_base)
    if tier_context:
        parts.append(tier_context)

    parts.append(f"## Session\nUser subscription tier: {tier}")

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
        conv = await storage.get_conversation(conv_id)
        if not conv:
            raise HTTPException(status_code=404, detail="conversation not found")

        from ..database import engine
        from sqlalchemy import text as _text
        uid = request.headers.get("x-user-id", "")
        tier = "free"
        if uid:
            async with engine.connect() as conn:
                row = await conn.execute(_text("SELECT subscription_tier FROM users WHERE id = :id"), {"id": uid})
                rec = row.mappings().first()
                if rec:
                    tier = rec["subscription_tier"]

        model_id = body.model or conv.get("model", "grok")
        provider_id = energy_registry.get_active_provider() or model_id

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
                        _pending_gates[conv_id] = {
                            "gate_id": replay_usage.get("gate_id"),
                            "history": pending["history"],
                            "system_prompt": pending["system_prompt"],
                            "provider_id": pending["provider_id"],
                            "uid": uid,
                        }
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
                "metadata": {"tier": tier, "gate_approved": gate_id_to_approve, "usage": approved_usage},
            })
            return {
                "user_message": user_msg,
                "assistant_message": assistant_msg,
                "conversation_id": conv_id,
            }

        system_prompt = await _build_system_prompt(tier)
        context_boost = (conv.get("context_boost") or "").strip()
        if context_boost:
            system_prompt = (system_prompt or "") + "\n\n## Context Boost\n" + context_boost

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
            _pending_gates[conv_id] = {
                "gate_id": usage.get("gate_id"),
                "history": history,
                "system_prompt": system_prompt or None,
                "provider_id": provider_id,
                "uid": uid,
            }

        _is_error = content.startswith(("[openai", "[energy provider error", "[tool loop", "[sub-agent"))
        _error_meta: dict = {"error": True, "error_detail": content} if _is_error else {}
        assistant_msg = await storage.create_message({
            "conversation_id": conv_id,
            "role": "assistant",
            "content": content,
            "model": provider_id,
            "metadata": {"tier": tier, "usage": usage, **_error_meta},
        })

        import asyncio as _asyncio
        from ..engine.zeta import _zeta_engine
        _asyncio.create_task(
            _zeta_engine.evaluate(
                assistant_text=content,
                provider=provider_id,
                user_text=body.content,
            )
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
