# 338:42 3:17 1:4
# DOC module: instances_api
# DOC label: Model Instances
# DOC description: CRUD for model instances (D&D party), per-instance memory, task board, and chat/archive sub-routes.
# DOC tier: ws
# DOC role: api
# DOC endpoint: GET /api/v1/agents/models | Model roster grouped by vendor
# DOC endpoint: GET /api/v1/agents/instances | List all instances with counts
# DOC endpoint: POST /api/v1/agents/instances | Create a new instance (admin)
# DOC endpoint: PATCH /api/v1/agents/instances/{id} | Update swarm_context (admin)
# DOC endpoint: DELETE /api/v1/agents/instances/{id} | Delete instance (admin)
# DOC endpoint: PATCH /api/v1/agents/instances/{id}/slot | Assign role slot (admin)
# DOC endpoint: GET /api/v1/agents/instances/{id}/memory | List instance memory
# DOC endpoint: POST /api/v1/agents/instances/{id}/memory | Add memory entry (admin)
# DOC endpoint: DELETE /api/v1/agents/instances/{id}/memory/{eid} | Delete entry (admin)
# DOC endpoint: GET /api/v1/agents/instances/{id}/tasks | List task board
# DOC endpoint: POST /api/v1/agents/instances/{id}/tasks | Create task
# DOC endpoint: PATCH /api/v1/agents/instances/{id}/tasks/{tid} | Update task
# DOC endpoint: DELETE /api/v1/agents/instances/{id}/tasks/{tid} | Delete task
# DOC endpoint: GET /api/v1/agents/instances/{id}/chat | Unarchived chat messages
# DOC endpoint: POST /api/v1/agents/instances/{id}/chat | Append chat message
# DOC endpoint: POST /api/v1/agents/instances/{id}/chat/archive | Archive current chat
# DOC endpoint: GET /api/v1/agents/instances/{id}/archives | List chat archives
"""Model-instantiation (D&D party) CRUD and sub-routes."""


import uuid
import os
import json
import logging
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import text as _sql

from ..database import get_session
from ._admin_gate import require_admin
from ..services.agent_instance import AgentInstance

router = APIRouter(prefix="/api/v1", tags=["instances"])
_log = logging.getLogger("a0p.instances_api")

# ── Pydantic ──────────────────────────────────────────────────────────────────

VALID_SLOTS = {"conduct", "perform", "practice", "record", "derive", "edcm"}


class InstanceCreate(BaseModel):
    kind: str
    vendor: str
    model_id: str
    swarm_context: Optional[str] = None
    remote_url: Optional[str] = None
    remote_secret_ref: Optional[str] = None


class InstancePatch(BaseModel):
    swarm_context: Optional[str] = None


class SlotPatch(BaseModel):
    role_slot: Optional[str] = None


class MemoryCreate(BaseModel):
    tier: str
    content: str


class TaskCreate(BaseModel):
    title: str


class TaskPatch(BaseModel):
    title: Optional[str] = None
    status: Optional[str] = None


class ChatMsg(BaseModel):
    role: str
    content: str


# ── Model Roster ──────────────────────────────────────────────────────────────

_PROVIDERS_JSON = os.path.join(
    os.path.dirname(os.path.dirname(__file__)), "config", "providers.json"
)


def _provider_data() -> dict:
    with open(_PROVIDERS_JSON, encoding="utf-8") as fh:
        return json.load(fh)


@router.get("/agents/models")
async def list_models():
    """All models from providers.json, grouped by vendor.

    Returns flagship models from providers{} plus all sub-models referenced
    in presets{} so every model that can be used in a slot or preset can also
    be instantiated and given instance memory.
    """
    data = _provider_data()
    providers = data.get("providers", {})
    presets = data.get("presets", {})

    # Build per-provider capability index for preset sub-model entries.
    provider_meta: dict[str, dict] = {
        pid: {
            "vendor": p.get("vendor", "unknown"),
            "supports_thinking": bool(p.get("supports_thinking")),
            "supports_vision": bool(p.get("supports_vision")),
            "supports_reasoning_effort": bool(p.get("supports_reasoning_effort")),
            "min_tier": p.get("min_tier", "free"),
        }
        for pid, p in providers.items()
    }

    by_vendor: dict[str, list] = {}
    seen: set[str] = set()

    # Flagship model per top-level provider entry.
    for pid, p in providers.items():
        vendor = p.get("vendor", "unknown")
        model_id = p.get("model", pid)
        by_vendor.setdefault(vendor, []).append({
            "provider_id": pid,
            "model_id": model_id,
            "label": p.get("label", pid),
            "vendor": vendor,
            "supports_thinking": bool(p.get("supports_thinking")),
            "supports_vision": bool(p.get("supports_vision")),
            "supports_reasoning_effort": bool(p.get("supports_reasoning_effort")),
            "min_tier": p.get("min_tier", "free"),
            "is_flagship": True,
        })
        seen.add(model_id)

    # Sub-models from presets that aren't already in the flagship list.
    for pid, preset_map in presets.items():
        meta = provider_meta.get(pid, {})
        vendor = meta.get("vendor", "unknown")
        for _preset_name, slot_map in preset_map.items():
            for _slot, mid in slot_map.items():
                if mid not in seen:
                    by_vendor.setdefault(vendor, []).append({
                        "provider_id": pid,
                        "model_id": mid,
                        "label": mid,
                        "vendor": vendor,
                        "supports_thinking": meta.get("supports_thinking", False),
                        "supports_vision": meta.get("supports_vision", False),
                        "supports_reasoning_effort": meta.get("supports_reasoning_effort", False),
                        "min_tier": meta.get("min_tier", "free"),
                        "is_flagship": False,
                    })
                    seen.add(mid)

    return [{"vendor": v, "models": ms} for v, ms in by_vendor.items()]


# ── Instance CRUD ─────────────────────────────────────────────────────────────

@router.get("/agents/instances")
async def list_instances():
    async with get_session() as s:
        rows = (await s.execute(_sql(
            "SELECT id, canonical_name, kind, vendor, model_id, "
            "swarm_context, role_slot, created_at FROM model_instances ORDER BY created_at ASC"
        ))).mappings().all()
        result = []
        for r in rows:
            iid = str(r["id"])
            mem_n = (await s.execute(
                _sql("SELECT COUNT(*) FROM instance_memory WHERE instance_id = :id"), {"id": iid}
            )).scalar() or 0
            task_n = (await s.execute(
                _sql("SELECT COUNT(*) FROM instance_tasks WHERE instance_id=:id AND status='open'"),
                {"id": iid},
            )).scalar() or 0
            result.append({
                **{k: v for k, v in r.items() if k != "id"},
                "id": iid,
                "created_at": str(r["created_at"]),
                "memory_count": int(mem_n),
                "open_task_count": int(task_n),
            })
    return result


@router.post("/agents/instances")
async def create_instance(request: Request, body: InstanceCreate):
    await require_admin(request)
    if body.kind not in ("zfae", "bare", "remote"):
        raise HTTPException(400, "kind must be zfae, bare, or remote")
    now = datetime.utcnow()
    canonical = f"zeta({body.model_id}){now.strftime('%Y-%m-%dT%H:%M:%SZ')}"
    iid = str(uuid.uuid4())
    async with get_session() as s:
        await s.execute(_sql(
            "INSERT INTO model_instances "
            "(id, canonical_name, kind, vendor, model_id, swarm_context, "
            " remote_url, remote_secret_ref, created_at) "
            "VALUES (:id,:cn,:kind,:vendor,:mid,:sc,:ru,:rsr,:ts)"
        ), {"id": iid, "cn": canonical, "kind": body.kind, "vendor": body.vendor,
            "mid": body.model_id, "sc": body.swarm_context,
            "ru": body.remote_url, "rsr": body.remote_secret_ref, "ts": now})
    return {"id": iid, "canonical_name": canonical, "kind": body.kind,
            "vendor": body.vendor, "model_id": body.model_id}


@router.patch("/agents/instances/{iid}")
async def patch_instance(iid: str, request: Request, body: InstancePatch):
    await require_admin(request)
    async with get_session() as s:
        await s.execute(
            _sql("UPDATE model_instances SET swarm_context=:sc WHERE id=:id"),
            {"sc": body.swarm_context, "id": iid},
        )
    return {"ok": True}


@router.delete("/agents/instances/{iid}")
async def delete_instance(iid: str, request: Request):
    await require_admin(request)
    async with get_session() as s:
        row = (await s.execute(
            _sql("SELECT role_slot FROM model_instances WHERE id=:id"), {"id": iid}
        )).first()
        if not row:
            raise HTTPException(404, "not found")
        if row[0]:
            raise HTTPException(409, "instance is slot-assigned; unassign first")
        await s.execute(_sql("DELETE FROM model_instances WHERE id=:id"), {"id": iid})
    return {"ok": True}


@router.patch("/agents/instances/{iid}/slot")
async def assign_slot(iid: str, request: Request, body: SlotPatch):
    await require_admin(request)
    if body.role_slot is not None and body.role_slot not in VALID_SLOTS:
        raise HTTPException(400, f"role_slot must be one of {sorted(VALID_SLOTS)} or null")
    if body.role_slot == "conduct" or body.role_slot is None:
        from ..services.slot_locks import conduct_is_active
        if conduct_is_active():
            raise HTTPException(
                409,
                "conduct slot is busy — a chat turn is in progress; "
                "retry after the current turn completes",
            )
    async with get_session() as s:
        if body.role_slot:
            await s.execute(
                _sql("UPDATE model_instances SET role_slot=NULL WHERE role_slot=:slot"),
                {"slot": body.role_slot},
            )
        await s.execute(
            _sql("UPDATE model_instances SET role_slot=:slot WHERE id=:id"),
            {"slot": body.role_slot, "id": iid},
        )
    return {"ok": True}


# ── Memory ────────────────────────────────────────────────────────────────────

@router.get("/agents/instances/{iid}/memory")
async def get_memory(iid: str):
    async with get_session() as s:
        rows = (await s.execute(_sql(
            "SELECT id,tier,content,created_at FROM instance_memory "
            "WHERE instance_id=:id ORDER BY created_at DESC"
        ), {"id": iid})).mappings().all()
    return [{"id": str(r["id"]), "tier": r["tier"],
             "content": r["content"], "created_at": str(r["created_at"])} for r in rows]


@router.post("/agents/instances/{iid}/memory")
async def add_memory(iid: str, request: Request, body: MemoryCreate):
    await require_admin(request)
    mid = str(uuid.uuid4())
    async with get_session() as s:
        await s.execute(_sql(
            "INSERT INTO instance_memory (id,instance_id,tier,content,created_at) "
            "VALUES (:id,:iid,:tier,:content,NOW())"
        ), {"id": mid, "iid": iid, "tier": body.tier, "content": body.content})
    return {"id": mid}


@router.delete("/agents/instances/{iid}/memory/{eid}")
async def delete_memory(iid: str, eid: str, request: Request):
    await require_admin(request)
    async with get_session() as s:
        await s.execute(
            _sql("DELETE FROM instance_memory WHERE id=:eid AND instance_id=:iid"),
            {"eid": eid, "iid": iid},
        )
    return {"ok": True}


# ── Tasks ─────────────────────────────────────────────────────────────────────

@router.get("/agents/instances/{iid}/tasks")
async def get_tasks(iid: str):
    async with get_session() as s:
        rows = (await s.execute(_sql(
            "SELECT id,title,status,created_at,updated_at FROM instance_tasks "
            "WHERE instance_id=:id ORDER BY created_at ASC"
        ), {"id": iid})).mappings().all()
    return [{"id": str(r["id"]), "title": r["title"], "status": r["status"],
             "created_at": str(r["created_at"]), "updated_at": str(r["updated_at"])} for r in rows]


@router.post("/agents/instances/{iid}/tasks")
async def create_task(iid: str, request: Request, body: TaskCreate):
    await require_admin(request)
    tid = str(uuid.uuid4())
    async with get_session() as s:
        await s.execute(_sql(
            "INSERT INTO instance_tasks (id,instance_id,title,status,created_at,updated_at) "
            "VALUES (:id,:iid,:title,'open',NOW(),NOW())"
        ), {"id": tid, "iid": iid, "title": body.title})
    return {"id": tid}


@router.patch("/agents/instances/{iid}/tasks/{tid}")
async def update_task(iid: str, tid: str, request: Request, body: TaskPatch):
    await require_admin(request)
    parts: list[str] = []
    params: dict = {"id": tid, "iid": iid}
    if body.title is not None:
        parts.append("title=:title")
        params["title"] = body.title
    if body.status is not None:
        parts.append("status=:status")
        params["status"] = body.status
    if not parts:
        raise HTTPException(400, "nothing to update")
    parts.append("updated_at=NOW()")
    async with get_session() as s:
        await s.execute(
            _sql(f"UPDATE instance_tasks SET {', '.join(parts)} WHERE id=:id AND instance_id=:iid"),
            params,
        )
    return {"ok": True}


@router.delete("/agents/instances/{iid}/tasks/{tid}")
async def delete_task(iid: str, tid: str, request: Request):
    await require_admin(request)
    async with get_session() as s:
        await s.execute(
            _sql("DELETE FROM instance_tasks WHERE id=:id AND instance_id=:iid"),
            {"id": tid, "iid": iid},
        )
    return {"ok": True}


# ── Chat ──────────────────────────────────────────────────────────────────────

@router.get("/agents/instances/{iid}/chat")
async def get_chat(iid: str):
    async with get_session() as s:
        rows = (await s.execute(_sql(
            "SELECT id,role,content,created_at FROM instance_chats "
            "WHERE instance_id=:id AND archive_id IS NULL ORDER BY created_at ASC"
        ), {"id": iid})).mappings().all()
    return [{"id": str(r["id"]), "role": r["role"],
             "content": r["content"], "created_at": str(r["created_at"])} for r in rows]


@router.post("/agents/instances/{iid}/chat")
async def post_chat(iid: str, request: Request, body: ChatMsg):
    await require_admin(request)

    # Fetch instance row for model_id and swarm_context.
    async with get_session() as s:
        inst_row = (await s.execute(
            _sql("SELECT model_id, swarm_context FROM model_instances WHERE id = :id"),
            {"id": iid},
        )).mappings().first()
    if not inst_row:
        raise HTTPException(status_code=404, detail="Instance not found")

    # Persist the user message first so history is complete before inference.
    cid = str(uuid.uuid4())
    async with get_session() as s:
        await s.execute(_sql(
            "INSERT INTO instance_chats (id,instance_id,role,content,created_at) "
            "VALUES (:id,:iid,:role,:content,NOW())"
        ), {"id": cid, "iid": iid, "role": body.role, "content": body.content})

    # Load conversation history (last 40 turns) for context.
    async with get_session() as s:
        history_rows = (await s.execute(_sql(
            "SELECT role, content FROM instance_chats "
            "WHERE instance_id = :id AND archive_id IS NULL "
            "ORDER BY created_at ASC LIMIT 40"
        ), {"id": iid})).mappings().all()
    messages = [{"role": r["role"], "content": r["content"]} for r in history_rows]

    # Run inference against the instance's model using swarm_context as system prompt.
    instance = AgentInstance.from_model(
        model_id=inst_row["model_id"],
        system_prompt=inst_row["swarm_context"] or None,
        use_tools=False,
        enforce_tier=False,
        enforce_enabled=True,
    )
    try:
        content, _usage = await instance.run(messages)
    except Exception as exc:
        _log.exception("Model inference failed for instance_id=%s", iid)
        raise HTTPException(status_code=502, detail="Model request failed") from exc

    # Persist assistant reply.
    aid = str(uuid.uuid4())
    async with get_session() as s:
        await s.execute(_sql(
            "INSERT INTO instance_chats (id,instance_id,role,content,created_at) "
            "VALUES (:id,:iid,'assistant',:content,NOW())"
        ), {"id": aid, "iid": iid, "content": content})

    return {"id": cid, "reply_id": aid, "reply": content}


@router.post("/agents/instances/{iid}/chat/archive")
async def archive_chat(iid: str, request: Request):
    await require_admin(request)
    aid = str(uuid.uuid4())
    label = f"Archive {datetime.now(timezone.utc).strftime('%Y-%m-%d')}"
    async with get_session() as s:
        await s.execute(_sql(
            "INSERT INTO instance_chat_archives "
            "(id,instance_id,label,archived_at,merge_status) "
            "VALUES (:id,:iid,:label,NOW(),'pending')"
        ), {"id": aid, "iid": iid, "label": label})
        await s.execute(
            _sql("UPDATE instance_chats SET archive_id=:aid "
                 "WHERE instance_id=:iid AND archive_id IS NULL"),
            {"aid": aid, "iid": iid},
        )
    return {"archive_id": aid, "label": label}


@router.get("/agents/instances/{iid}/archives")
async def get_archives(iid: str):
    async with get_session() as s:
        rows = (await s.execute(_sql(
            "SELECT id,label,archived_at,merge_status FROM instance_chat_archives "
            "WHERE instance_id=:id ORDER BY archived_at DESC"
        ), {"id": iid})).mappings().all()
    return [{"id": str(r["id"]), "label": r["label"],
             "archived_at": str(r["archived_at"]), "merge_status": r["merge_status"]}
            for r in rows]
# 338:42 3:17 1:4
