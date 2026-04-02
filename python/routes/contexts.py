import os
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
from sqlalchemy import text
from ..database import engine

ADMIN_USER_ID = os.environ.get("ADMIN_USER_ID", "")

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
    ],
}

router = APIRouter(prefix="/api/v1/contexts", tags=["contexts"])

DEFAULT_CONTEXTS = [
    "tier_free",
    "tier_seeker",
    "tier_operator",
    "tier_patron",
    "tier_founder",
    "system_base",
]


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
    uid = request.headers.get("x-replit-user-id", "")
    if not uid or (ADMIN_USER_ID and uid != ADMIN_USER_ID):
        raise HTTPException(status_code=403, detail="Admin access required")

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
            {"name": name, "value": body.value, "uid": uid},
        )
    return {"ok": True, "name": name}
