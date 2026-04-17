# 211:17
# DOC module: focus
# DOC label: Focus & Sub-agents
# DOC description: Model focus management and sub-agent delegation. Provides context boost injection per conversation, focus regain directives, sub-agent background task launch, and error log retrieval for model calls.
# DOC tier: free
# DOC endpoint: GET /api/v1/conversations/{id}/boost | Get the context boost for a conversation
# DOC endpoint: PUT /api/v1/conversations/{id}/boost | Set context boost text injected into the system prompt
# DOC endpoint: DELETE /api/v1/conversations/{id}/boost | Clear the context boost
# DOC endpoint: POST /api/v1/conversations/{id}/focus | Inject a focus-regain directive into the conversation
# DOC endpoint: POST /api/v1/subagent | Launch a background sub-agent task; primary energy stays unblocked
# DOC endpoint: GET /api/v1/subagent/{conv_id}/status | Poll sub-agent completion status + result

import asyncio
from typing import Optional
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import text
from ..database import engine
from ..storage import storage

router = APIRouter(prefix="/api/v1", tags=["focus"])

_FOCUS_DIRECTIVE = (
    "## Focus Regain\n"
    "You are being asked to regain focus. Stop, take stock, and do the following:\n"
    "1. In one sentence, state the primary goal of this conversation.\n"
    "2. Identify the last concrete action you completed.\n"
    "3. State the single next step you will take.\n"
    "Then continue systematically from that next step. Do not re-explain prior work."
)

# ─── Context Boost ────────────────────────────────────────────────────────────

def _uid(request: Request) -> Optional[str]:
    return request.headers.get("x-user-id") or None


async def _assert_conv_owner(conv_id: int, uid: Optional[str]) -> dict:
    conv = await storage.get_conversation(conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if uid and conv.get("user_id") and conv["user_id"] != uid:
        raise HTTPException(status_code=403, detail="Not your conversation")
    return conv


@router.get("/conversations/{conv_id}/boost")
async def get_boost(conv_id: int, request: Request):
    uid = _uid(request)
    conv = await _assert_conv_owner(conv_id, uid)
    return {"conversation_id": conv_id, "context_boost": conv.get("context_boost") or ""}


class BoostBody(BaseModel):
    text: str


@router.put("/conversations/{conv_id}/boost")
async def set_boost(conv_id: int, body: BoostBody, request: Request):
    uid = _uid(request)
    await _assert_conv_owner(conv_id, uid)
    async with engine.begin() as conn:
        await conn.execute(
            text("UPDATE conversations SET context_boost = :boost WHERE id = :id"),
            {"boost": body.text.strip(), "id": conv_id},
        )
    return {"ok": True, "conversation_id": conv_id, "context_boost": body.text.strip()}


@router.delete("/conversations/{conv_id}/boost")
async def clear_boost(conv_id: int, request: Request):
    uid = _uid(request)
    await _assert_conv_owner(conv_id, uid)
    async with engine.begin() as conn:
        await conn.execute(
            text("UPDATE conversations SET context_boost = NULL WHERE id = :id"),
            {"id": conv_id},
        )
    return {"ok": True, "conversation_id": conv_id, "context_boost": ""}


# ─── Focus Regain ─────────────────────────────────────────────────────────────

@router.post("/conversations/{conv_id}/focus")
async def regain_focus(conv_id: int, request: Request):
    uid = _uid(request)
    conv = await _assert_conv_owner(conv_id, uid)

    from ..services.inference import call_energy_provider
    from ..services.energy_registry import energy_registry
    from .chat import _build_system_prompt

    tier = "free"
    if uid:
        async with engine.connect() as conn:
            row = await conn.execute(
                text("SELECT subscription_tier FROM users WHERE id = :id"), {"id": uid}
            )
            rec = row.mappings().first()
            if rec:
                tier = rec["subscription_tier"]

    prior_msgs = await storage.get_messages(conv_id)
    history = [
        {"role": m["role"], "content": m["content"]}
        for m in prior_msgs
        if m["role"] in ("user", "assistant")
    ]
    history.append({"role": "user", "content": "[SYSTEM: Focus regain requested by user]"})

    system_prompt = await _build_system_prompt(tier)
    focus_system = (system_prompt or "") + "\n\n" + _FOCUS_DIRECTIVE

    provider_id = energy_registry.get_active_provider() or conv.get("model", "grok")

    user_msg = await storage.create_message({
        "conversation_id": conv_id,
        "role": "user",
        "content": "🎯 Regain focus",
        "model": provider_id,
        "metadata": {"focus_regain": True, "tier": tier},
    })

    content, usage = await call_energy_provider(
        provider_id=provider_id,
        messages=history,
        system_prompt=focus_system,
        user_id=uid,
        use_tools=False,
    )

    assistant_msg = await storage.create_message({
        "conversation_id": conv_id,
        "role": "assistant",
        "content": content,
        "model": provider_id,
        "metadata": {"focus_regain": True, "tier": tier, "usage": usage},
    })

    return {
        "user_message": user_msg,
        "assistant_message": assistant_msg,
        "conversation_id": conv_id,
    }


# ─── Sub-agent ────────────────────────────────────────────────────────────────

class SubagentBody(BaseModel):
    task: str
    model: Optional[str] = None
    parent_conv_id: Optional[int] = None


@router.post("/subagent")
async def launch_subagent(body: SubagentBody, request: Request):
    """
    Launch a background sub-agent that runs inference without blocking the primary a0.
    Returns immediately with the sub-agent conversation ID.
    """
    uid = _uid(request)

    conv = await storage.create_conversation({
        "user_id": uid,
        "title": f"[sub-agent] {body.task[:60]}",
        "model": body.model or "grok",
        "parent_conv_id": body.parent_conv_id,
        "subagent_status": "running",
    })
    conv_id = conv["id"]

    await storage.create_message({
        "conversation_id": conv_id,
        "role": "user",
        "content": body.task,
        "model": body.model or "grok",
        "metadata": {"subagent": True},
    })

    from ..services.bg_tasks import spawn as _spawn_bg
    _spawn_bg(_run_subagent(conv_id, body.task, body.model, uid), name=f"subagent-conv{conv_id}")

    return {
        "ok": True,
        "subagent_conv_id": conv_id,
        "status": "running",
        "message": "Sub-agent started. Primary a0 remains unblocked.",
    }


async def _run_subagent(conv_id: int, task: str, model: Optional[str], uid: Optional[str]):
    from ..services.inference import call_energy_provider
    from ..services.energy_registry import energy_registry
    from .chat import _build_system_prompt

    try:
        tier = "free"
        if uid:
            async with engine.connect() as conn:
                row = await conn.execute(
                    text("SELECT subscription_tier FROM users WHERE id = :id"), {"id": uid}
                )
                rec = row.mappings().first()
                if rec:
                    tier = rec["subscription_tier"]

        provider_id = energy_registry.get_active_provider() or model or "grok"
        system_prompt = await _build_system_prompt(tier)
        subagent_directive = (
            "\n\n## Sub-agent Mode\n"
            "You are running as a background sub-agent. "
            "Complete the assigned task fully and independently. "
            "Return a clear, structured result with findings, conclusions, and any recommended next steps."
        )

        content, usage = await call_energy_provider(
            provider_id=provider_id,
            messages=[{"role": "user", "content": task}],
            system_prompt=(system_prompt or "") + subagent_directive,
            user_id=uid,
        )

        await storage.create_message({
            "conversation_id": conv_id,
            "role": "assistant",
            "content": content,
            "model": provider_id,
            "metadata": {"subagent": True, "tier": tier, "usage": usage},
        })

        async with engine.begin() as conn:
            await conn.execute(
                text("UPDATE conversations SET subagent_status = 'done', updated_at = NOW() WHERE id = :id"),
                {"id": conv_id},
            )

    except Exception as exc:
        err = str(exc)
        try:
            await storage.create_message({
                "conversation_id": conv_id,
                "role": "assistant",
                "content": f"[sub-agent error: {err}]",
                "model": "system",
                "metadata": {"subagent": True, "error": True, "error_detail": err},
            })
            async with engine.begin() as conn:
                await conn.execute(
                    text("UPDATE conversations SET subagent_status = 'error', subagent_error = :err, updated_at = NOW() WHERE id = :id"),
                    {"err": err[:500], "id": conv_id},
                )
        except Exception:
            pass


@router.get("/subagent/{conv_id}/status")
async def subagent_status(conv_id: int, request: Request):
    uid = _uid(request)
    conv = await _assert_conv_owner(conv_id, uid)

    status = conv.get("subagent_status")
    if not status:
        raise HTTPException(status_code=400, detail="Not a sub-agent conversation")

    result: dict = {
        "conversation_id": conv_id,
        "status": status,
        "title": conv.get("title"),
        "parent_conv_id": conv.get("parent_conv_id"),
    }

    if status in ("done", "error"):
        msgs = await storage.get_messages(conv_id)
        assistant_msgs = [m for m in msgs if m["role"] == "assistant"]
        if assistant_msgs:
            result["reply"] = assistant_msgs[-1]["content"]
    if status == "error":
        result["error"] = conv.get("subagent_error")

    return result
# 211:17
