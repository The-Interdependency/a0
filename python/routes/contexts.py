import math
import os
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import text
from ..database import engine

ADMIN_USER_ID = os.environ.get("ADMIN_USER_ID", "")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "")

UI_META = {
    "tab_id": "contexts",
    "label": "Contexts",
    "icon": "FileText",
    "order": 8,
    "admin_only": True,
    "sections": [
        {
            "id": "prompt_contexts",
            "label": "Prompt Contexts",
            "endpoint": "/api/v1/contexts",
            "fields": [
                {"key": "name", "type": "text", "label": "Name"},
                {"key": "value", "type": "text", "label": "Value"},
                {"key": "updated_by", "type": "badge", "label": "Updated By"},
                {"key": "updated_at", "type": "text", "label": "Updated"},
            ],
        }
    ],
}

DATA_SCHEMA = {
    "endpoints": [
        {"method": "GET", "path": "/api/v1/contexts"},
        {"method": "GET", "path": "/api/v1/contexts/{name}"},
        {"method": "PUT", "path": "/api/v1/contexts/{name}"},
        {"method": "GET", "path": "/api/v1/context/full-preview"},
        {"method": "PATCH", "path": "/api/v1/context/system-sections"},
        {"method": "POST", "path": "/api/context"},
    ],
}

router = APIRouter(prefix="/api/v1/contexts", tags=["contexts"])
context_tab_router = APIRouter(tags=["context_tab"])

DEFAULT_CONTEXTS = [
    "a0_identity",
    "tier_free",
    "tier_seeker",
    "tier_operator",
    "tier_patron",
    "tier_founder",
    "system_base",
]

_SECTION_LABELS = {
    "a0_identity": "A0 Identity",
    "system_base": "System Base",
    "tier_free": "Tier: Free",
    "tier_seeker": "Tier: Seeker",
    "tier_operator": "Tier: Operator",
    "tier_patron": "Tier: Patron",
    "tier_founder": "Tier: Founder",
}


async def _ensure_defaults():
    async with engine.begin() as conn:
        for name in DEFAULT_CONTEXTS:
            await conn.execute(
                text("""
                    INSERT INTO prompt_contexts (name, value)
                    VALUES (:name, '')
                    ON CONFLICT (name) DO NOTHING
                """),
                {"name": name},
            )


async def get_context_value(name: str) -> str:
    async with engine.connect() as conn:
        row = await conn.execute(
            text("SELECT value FROM prompt_contexts WHERE name = :name"),
            {"name": name},
        )
        rec = row.mappings().first()
    return rec["value"] if rec else ""


async def _upsert_context_value(name: str, value: str, uid: str = "system"):
    async with engine.begin() as conn:
        await conn.execute(
            text("""
                INSERT INTO prompt_contexts (name, value, updated_by, updated_at)
                VALUES (:name, :value, :uid, CURRENT_TIMESTAMP)
                ON CONFLICT (name) DO UPDATE
                  SET value = EXCLUDED.value,
                      updated_by = EXCLUDED.updated_by,
                      updated_at = CURRENT_TIMESTAMP
            """),
            {"name": name, "value": value, "uid": uid},
        )


def _is_admin(uid: str, email: str | None, role: str = "user") -> bool:
    if role == "admin":
        return True
    if ADMIN_EMAIL and email and email.strip().lower() == ADMIN_EMAIL.strip().lower():
        return True
    return False


@router.get("")
async def list_contexts():
    await _ensure_defaults()
    async with engine.connect() as conn:
        rows = await conn.execute(
            text("SELECT name, value, updated_by, updated_at FROM prompt_contexts ORDER BY name")
        )
        return [dict(r) for r in rows.mappings()]


@router.get("/{name}")
async def get_context(name: str):
    async with engine.connect() as conn:
        row = await conn.execute(
            text("SELECT name, value, updated_by, updated_at FROM prompt_contexts WHERE name = :name"),
            {"name": name},
        )
        rec = row.mappings().first()
    if not rec:
        raise HTTPException(status_code=404, detail="Context not found")
    return dict(rec)


class ContextBody(BaseModel):
    value: str


@router.put("/{name}")
async def upsert_context(name: str, body: ContextBody, request: Request):
    uid = request.headers.get("x-user-id", "")
    email = request.headers.get("x-user-email")
    role = request.headers.get("x-user-role", "user")
    if not uid or not _is_admin(uid, email, role):
        raise HTTPException(status_code=403, detail="Admin access required")
    await _upsert_context_value(name, body.value, uid)
    return {"ok": True, "name": name}


@context_tab_router.get("/api/v1/context/full-preview")
async def full_preview():
    await _ensure_defaults()
    async with engine.connect() as conn:
        rows = await conn.execute(
            text("SELECT name, value FROM prompt_contexts ORDER BY name")
        )
        db_map = {r["name"]: r["value"] for r in rows.mappings()}

    sections = []
    for key in DEFAULT_CONTEXTS:
        sections.append({
            "key": key,
            "label": _SECTION_LABELS.get(key, key),
            "editable": True,
            "content": db_map.get(key, ""),
        })
    return {"sections": sections}


class SectionPatch(BaseModel):
    key: str
    value: str


@context_tab_router.patch("/api/v1/context/system-sections")
async def patch_system_section(body: SectionPatch, request: Request):
    uid = request.headers.get("x-user-id", "system")
    if body.key not in DEFAULT_CONTEXTS:
        raise HTTPException(status_code=400, detail=f"Unknown context key: {body.key}")
    await _upsert_context_value(body.key, body.value, uid or "system")
    return {"ok": True, "key": body.key}


class CoreContextBody(BaseModel):
    systemPrompt: str = ""
    contextPrefix: str = ""


@context_tab_router.post("/api/context")
async def save_core_context(body: CoreContextBody, request: Request):
    uid = request.headers.get("x-user-id", "system")
    saved = []
    if body.systemPrompt is not None:
        await _upsert_context_value("a0_identity", body.systemPrompt, uid or "system")
        saved.append("a0_identity")
    if body.contextPrefix is not None:
        await _upsert_context_value("system_base", body.contextPrefix, uid or "system")
        saved.append("system_base")
    return {"ok": True, "saved": saved}
