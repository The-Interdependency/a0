# 124:14
# DOC module: cli
# DOC label: CLI Keys
# DOC endpoint: POST /api/v1/cli/keys | Generate a new CLI API key
# DOC endpoint: GET /api/v1/cli/keys | List your CLI keys
# DOC endpoint: DELETE /api/v1/cli/keys/{key_id} | Revoke a CLI key
# DOC endpoint: POST /api/v1/cli/chat | Send a message via CLI API key (no session required)
import os
import secrets
import hashlib
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import text
from ..database import engine

router = APIRouter(prefix="/api/v1/cli", tags=["cli"])

UI_META = {
    "tab_id": "cli_keys",
    "label": "CLI Keys",
    "icon": "Terminal",
    "order": 14,
    "sections": [],
}

# CLI key format: a0k_<prefix8>_<random48>
_PREFIX_LEN = 8
_SECRET_LEN = 32  # 32 bytes → 64 hex chars


def _user_id(request: Request) -> Optional[str]:
    return request.headers.get("x-user-id") or None


def _make_key() -> tuple[str, str, str]:
    """Returns (full_key, prefix, sha256_hash)."""
    raw = secrets.token_hex(_SECRET_LEN)
    prefix = raw[:_PREFIX_LEN]
    full_key = f"a0k_{prefix}_{raw[_PREFIX_LEN:]}"
    key_hash = hashlib.sha256(full_key.encode()).hexdigest()
    return full_key, prefix, key_hash


async def resolve_cli_key(api_key: str) -> Optional[dict]:
    """Resolve an API key to a user dict. Returns None if invalid."""
    if not api_key.startswith("a0k_"):
        return None
    key_hash = hashlib.sha256(api_key.encode()).hexdigest()
    async with engine.connect() as conn:
        row = await conn.execute(
            text("""
                SELECT ck.id AS key_id, ck.user_id, u.username, u.email,
                       u.subscription_tier, u.role
                FROM cli_keys ck
                JOIN users u ON u.id = ck.user_id
                WHERE ck.key_hash = :h
            """),
            {"h": key_hash},
        )
        rec = row.mappings().first()
        if not rec:
            return None
    async with engine.begin() as conn:
        await conn.execute(
            text("UPDATE cli_keys SET last_used_at = NOW() WHERE key_hash = :h"),
            {"h": key_hash},
        )
    return dict(rec)


class CreateKeyBody(BaseModel):
    label: Optional[str] = None


@router.post("/keys")
async def create_key(body: CreateKeyBody, request: Request):
    uid = _user_id(request)
    if not uid:
        raise HTTPException(status_code=401, detail="Not authenticated")

    full_key, prefix, key_hash = _make_key()

    async with engine.begin() as conn:
        await conn.execute(
            text("""
                INSERT INTO cli_keys (user_id, key_prefix, key_hash, label)
                VALUES (:uid, :prefix, :hash, :label)
            """),
            {"uid": uid, "prefix": prefix, "hash": key_hash, "label": body.label or f"Key {prefix}"},
        )
        row = await conn.execute(
            text("SELECT id FROM cli_keys WHERE key_hash = :h"),
            {"h": key_hash},
        )
        rec = row.mappings().first()

    return {
        "key": full_key,
        "prefix": prefix,
        "label": body.label or f"Key {prefix}",
        "id": rec["id"],
        "note": "Store this key securely — it will not be shown again.",
    }


@router.get("/keys")
async def list_keys(request: Request):
    uid = _user_id(request)
    if not uid:
        raise HTTPException(status_code=401, detail="Not authenticated")

    async with engine.connect() as conn:
        rows = await conn.execute(
            text("""
                SELECT id, key_prefix, label, last_used_at, created_at
                FROM cli_keys WHERE user_id = :uid
                ORDER BY created_at DESC
            """),
            {"uid": uid},
        )
        keys = [dict(r) for r in rows.mappings()]

    return {"keys": keys}


@router.delete("/keys/{key_id}")
async def revoke_key(key_id: int, request: Request):
    uid = _user_id(request)
    if not uid:
        raise HTTPException(status_code=401, detail="Not authenticated")

    async with engine.begin() as conn:
        result = await conn.execute(
            text("DELETE FROM cli_keys WHERE id = :kid AND user_id = :uid RETURNING id"),
            {"kid": key_id, "uid": uid},
        )
        if not result.rowcount:
            raise HTTPException(status_code=404, detail="Key not found")

    return {"ok": True, "revoked": key_id}


class CliChatBody(BaseModel):
    message: str
    conversation_id: Optional[int] = None
    model: Optional[str] = None


@router.post("/chat")
async def cli_chat(body: CliChatBody, request: Request):
    """Stateless CLI chat — authenticates via Authorization: Bearer a0k_... header."""
    from ..services.inference import call_energy_provider
    from ..services.energy_registry import energy_registry
    from ..storage import storage
    from .chat import _build_system_prompt

    api_key = ""
    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        api_key = auth_header[7:].strip()
    if not api_key:
        api_key = request.headers.get("x-api-key", "")

    user = await resolve_cli_key(api_key)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or missing CLI key")

    uid = user["user_id"]
    tier = user["subscription_tier"] or "free"

    if body.conversation_id:
        conv = await storage.get_conversation(body.conversation_id)
        if not conv:
            raise HTTPException(status_code=404, detail="conversation not found")
        conv_id = body.conversation_id
        prior_msgs = await storage.get_messages(conv_id)
    else:
        conv = await storage.create_conversation({"user_id": uid, "title": "CLI", "model": body.model or "grok"})
        conv_id = conv["id"]
        prior_msgs = []

    history = [
        {"role": m["role"], "content": m["content"]}
        for m in prior_msgs
        if m["role"] in ("user", "assistant")
    ]
    history.append({"role": "user", "content": body.message})

    model_id = body.model or conv.get("model", "grok")
    provider_id = energy_registry.get_active_provider() or model_id
    system_prompt = await _build_system_prompt(tier)

    await storage.create_message({
        "conversation_id": conv_id,
        "role": "user",
        "content": body.message,
        "model": model_id,
        "metadata": {"tier": tier, "via": "cli"},
    })

    content, usage = await call_energy_provider(
        provider_id=provider_id,
        messages=history,
        system_prompt=system_prompt or None,
        user_id=uid,
    )

    await storage.create_message({
        "conversation_id": conv_id,
        "role": "assistant",
        "content": content,
        "model": provider_id,
        "metadata": {"tier": tier, "usage": usage, "via": "cli"},
    })

    return {
        "reply": content,
        "conversation_id": conv_id,
        "tier": tier,
        "usage": usage,
    }
