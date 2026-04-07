from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional

from ..storage import storage
from ..services.stripe_service import get_tier_context_name
from ..services.energy_registry import energy_registry
from ..services.inference import call_energy_provider
from .contexts import get_context_value

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
    userId: Optional[str] = None


class UpdateConversation(BaseModel):
    title: str


class SendMessage(BaseModel):
    content: str
    model: Optional[str] = None


@router.get("/conversations")
async def list_conversations():
    return await storage.get_conversations()


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


@router.post("/conversations/{conv_id}/messages")
async def send_message(conv_id: int, body: SendMessage, request: Request):
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

    system_prompt = await _build_system_prompt(tier)

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

    content, usage = await call_energy_provider(
        provider_id=provider_id,
        messages=history,
        system_prompt=system_prompt or None,
    )

    assistant_msg = await storage.create_message({
        "conversation_id": conv_id,
        "role": "assistant",
        "content": content,
        "model": provider_id,
        "metadata": {"tier": tier, "usage": usage},
    })

    return {
        "user_message": user_msg,
        "assistant_message": assistant_msg,
        "conversation_id": conv_id,
    }
