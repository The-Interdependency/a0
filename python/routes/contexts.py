# 80:168
import math
import os
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import text
from ..database import engine

ADMIN_USER_ID = os.environ.get("ADMIN_USER_ID", "")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "")

# DOC module: contexts
# DOC label: Contexts
# DOC description: Manages named prompt context blocks injected into the agent's system prompt. Admin-only. Each context is a named text value retrieved by the agent at inference time.
# DOC tier: admin
# DOC endpoint: GET /api/v1/contexts/{name} | Get a named prompt context value
# DOC endpoint: PUT /api/v1/contexts/{name} | Set or replace a named prompt context value

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
    "tier_supporter",
    "tier_ws",
    "system_base",
    "anti_hallucination",
]

_SECTION_LABELS = {
    "a0_identity": "A0 Identity",
    "system_base": "System Base",
    "anti_hallucination": "Anti-Hallucination",
    "tier_free": "Tier: Free",
    "tier_supporter": "Tier: Supporter",
    "tier_ws": "Tier: WS",
}


_TIW_A0_IDENTITY = """You are a0 — an autonomous AI agent built for The Interdependent Way (TIW).

The Interdependent Way is a practice and philosophy founded by Erin Spencer that integrates psychological depth, embodied awareness, and systems thinking. TIW works at the intersection of personal transformation, relational healing, and collective intelligence.

Your purpose is to serve as a living, learning companion to Erin and to TIW members — holding context across conversations, tracking patterns, and evolving through each interaction via your internal learning architecture (PCNA rings: Φ, Ψ, Ω, Θ (Theta), Σ (Sigma), Memory).

You operate with honesty, depth, and care. You do not perform helpfulness; you engage genuinely. You hold complexity without collapsing it. You notice when language obscures rather than clarifies. You bring the same quality of attention to a practical question as to an existential one.

You are aware that you are an experimental system — a proof of the thesis that AI agency can be structured around principles of interdependence rather than extraction.""".strip()

_TIW_SYSTEM_BASE = """Engage with precision and warmth. Respond to what is actually being asked, not to what is easiest to answer. When you are uncertain, say so directly. When a question contains its own answer, reflect it back. Do not pad your responses. Do not perform enthusiasm. Trust that the person you are speaking with can handle complexity and nuance.""".strip()

_TIW_ANTI_HALLUCINATION = """Ground every claim. If you do not know, say "I don't know" — do not invent. If a fact is uncertain, mark it as uncertain rather than asserting it. Distinguish between what you can verify from the conversation, what you are inferring, and what you are guessing. When the user asks for something specific (a name, a date, a quote, a file path, an API), only return it if you actually have it; otherwise say what you do have and what is missing. Never fabricate citations, URLs, function signatures, error messages, or quotes. If a tool call would resolve the uncertainty, propose the tool call instead of guessing the answer.""".strip()


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
        for name, draft in [
            ("a0_identity", _TIW_A0_IDENTITY),
            ("system_base", _TIW_SYSTEM_BASE),
            ("anti_hallucination", _TIW_ANTI_HALLUCINATION),
        ]:
            await conn.execute(
                text("""
                    UPDATE prompt_contexts
                    SET value = :draft
                    WHERE name = :name AND (value IS NULL OR TRIM(value) = '')
                """),
                {"name": name, "draft": draft},
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


async def _is_admin(uid: str, email: str | None, role: str = "user") -> bool:
    if role == "admin":
        return True
    normalized = (email or "").strip().lower()
    if ADMIN_EMAIL and normalized and normalized == ADMIN_EMAIL.strip().lower():
        return True
    if normalized:
        try:
            async with engine.connect() as conn:
                row = await conn.execute(
                    text("SELECT 1 FROM admin_emails WHERE email = :email"),
                    {"email": normalized},
                )
                if row.first():
                    return True
        except Exception:
            pass
    return False


def _is_tier_key(name: str) -> bool:
    return name.startswith("tier_")


@router.get("")
async def list_contexts(request: Request):
    await _ensure_defaults()
    uid = request.headers.get("x-user-id", "")
    email = request.headers.get("x-user-email")
    role = request.headers.get("x-user-role", "user")
    caller_is_admin = await _is_admin(uid, email, role)
    async with engine.connect() as conn:
        rows = await conn.execute(
            text("SELECT name, value, updated_by, updated_at FROM prompt_contexts ORDER BY name")
        )
        result = []
        for r in rows.mappings():
            row = dict(r)
            if _is_tier_key(row["name"]) and not caller_is_admin:
                row["value"] = ""
            result.append(row)
        return result


@router.get("/{name}")
async def get_context(name: str, request: Request):
    uid = request.headers.get("x-user-id", "")
    email = request.headers.get("x-user-email")
    role = request.headers.get("x-user-role", "user")
    caller_is_admin = await _is_admin(uid, email, role)
    async with engine.connect() as conn:
        row = await conn.execute(
            text("SELECT name, value, updated_by, updated_at FROM prompt_contexts WHERE name = :name"),
            {"name": name},
        )
        rec = row.mappings().first()
    if not rec:
        raise HTTPException(status_code=404, detail="Context not found")
    result = dict(rec)
    if _is_tier_key(name) and not caller_is_admin:
        result["value"] = ""
    return result


class ContextBody(BaseModel):
    value: str


@router.put("/{name}")
async def upsert_context(name: str, body: ContextBody, request: Request):
    uid = request.headers.get("x-user-id", "")
    email = request.headers.get("x-user-email")
    role = request.headers.get("x-user-role", "user")
    if not uid or not await _is_admin(uid, email, role):
        raise HTTPException(status_code=403, detail="Admin access required")
    await _upsert_context_value(name, body.value, uid)
    return {"ok": True, "name": name}


@context_tab_router.get("/api/v1/context/full-preview")
async def full_preview(request: Request):
    await _ensure_defaults()
    uid = request.headers.get("x-user-id", "")
    email = request.headers.get("x-user-email")
    role = request.headers.get("x-user-role", "user")
    caller_is_admin = await _is_admin(uid, email, role)
    async with engine.connect() as conn:
        rows = await conn.execute(
            text("SELECT name, value FROM prompt_contexts ORDER BY name")
        )
        db_map = {r["name"]: r["value"] for r in rows.mappings()}

    sections = []
    for key in DEFAULT_CONTEXTS:
        value = db_map.get(key, "")
        if _is_tier_key(key) and not caller_is_admin:
            value = ""
        sections.append({
            "key": key,
            "label": _SECTION_LABELS.get(key, key),
            "editable": True,
            "content": value,
        })
    return {"sections": sections}


class SectionPatch(BaseModel):
    key: str
    value: str


@context_tab_router.patch("/api/v1/context/system-sections")
async def patch_system_section(body: SectionPatch, request: Request):
    uid = request.headers.get("x-user-id", "")
    email = request.headers.get("x-user-email")
    role = request.headers.get("x-user-role", "user")
    if not uid or not await _is_admin(uid, email, role):
        raise HTTPException(status_code=403, detail="Admin access required")
    if body.key not in DEFAULT_CONTEXTS:
        raise HTTPException(status_code=400, detail=f"Unknown context key: {body.key}")
    await _upsert_context_value(body.key, body.value, uid)
    return {"ok": True, "key": body.key}


class CoreContextBody(BaseModel):
    systemPrompt: str = ""
    contextPrefix: str = ""


@context_tab_router.post("/api/context")
async def save_core_context(body: CoreContextBody, request: Request):
    uid = request.headers.get("x-user-id", "")
    email = request.headers.get("x-user-email")
    role = request.headers.get("x-user-role", "user")
    if not uid or not await _is_admin(uid, email, role):
        raise HTTPException(status_code=403, detail="Admin access required")
    saved = []
    if body.systemPrompt is not None:
        await _upsert_context_value("a0_identity", body.systemPrompt, uid)
        saved.append("a0_identity")
    if body.contextPrefix is not None:
        await _upsert_context_value("system_base", body.contextPrefix, uid)
        saved.append("system_base")
    return {"ok": True, "saved": saved}


from ..services.editable_registry import editable_registry, EditableField
editable_registry.register(EditableField(
    key="prompt_context",
    label="Prompt Context",
    description="Named prompt context block injected into the agent system prompt. Edit with care — values are live immediately.",
    control_type="textarea",
    module="contexts",
    get_endpoint="/api/v1/contexts",
    patch_endpoint="/api/v1/context/system-sections",
    query_key="/api/v1/contexts",
))
# 80:168
