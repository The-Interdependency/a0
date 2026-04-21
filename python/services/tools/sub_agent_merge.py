# N:M
"""sub_agent_merge — merge a sub-agent's ring state, archive its log stream."""
import json

from sqlalchemy import text as _sa_text

from ..run_logger import get_run_logger, dump_run_jsonl, flush as _flush_logs


SCHEMA = {
    "type": "function",
    "function": {
        "name": "sub_agent_merge",
        "description": (
            "Merge a completed sub-agent's learned ring state back into the primary PCNA. "
            "Pass run_id (preferred — uuid returned by sub_agent_spawn) or agent_id (legacy short tag). "
            "Auto-archives the run's full agent_logs stream as a JSONL log artifact."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "agent_id": {"type": "string", "description": "Sub-agent short id."},
                "run_id": {"type": "string", "description": "Sub-agent run uuid (preferred)."},
                "result_summary": {
                    "type": "string",
                    "description": "Optional one-line summary of the sub-agent's outcome.",
                },
            },
            "required": [],
        },
    },
    "tier": "free",
    "approval_scope": None,
    "enabled": True,
    "category": "agent",
    "cost_hint": "low",
    "side_effects": [],
    "version": 2,
}


async def _resolve_run_id(agent_id: str, run_id: str) -> str | None:
    if run_id:
        return run_id
    if not agent_id:
        return None
    short = agent_id.replace("a0z-", "")[:8]
    try:
        from ...database import get_session
        async with get_session() as s:
            r = await s.execute(
                _sa_text("SELECT id FROM agent_runs WHERE id LIKE :pat LIMIT 1"),
                {"pat": short + "%"},
            )
            row = r.first()
            if row:
                return str(row[0])
    except Exception:
        return None
    return None


async def handle(agent_id: str = "", run_id: str = "", result_summary: str = "", **_) -> str:
    rid = await _resolve_run_id(agent_id, run_id)
    if not rid:
        return "[sub_agent_merge: agent_id or run_id required and must resolve]"

    logger = get_run_logger()
    logger.emit("merge", {"run_id": rid, "summary": result_summary[:500]}, run_id=rid)
    try:
        await _flush_logs()
    except Exception as exc:
        return json.dumps({"ok": False, "stage": "log_flush", "error": str(exc)})

    stats: dict = {}
    try:
        from ...database import get_session
        async with get_session() as s:
            r = await s.execute(
                _sa_text(
                    "SELECT depth, root_run_id, total_tokens, total_cost_usd "
                    "FROM agent_runs WHERE id = :id LIMIT 1"
                ),
                {"id": rid},
            )
            row = r.mappings().first()
            if row:
                stats = dict(row)
            await s.execute(
                _sa_text(
                    "UPDATE agent_runs SET status = 'merged', "
                    "ended_at = CURRENT_TIMESTAMP WHERE id = :id"
                ),
                {"id": rid},
            )
            cnt_r = await s.execute(
                _sa_text("SELECT COUNT(*) FROM agent_logs WHERE run_id = :id"),
                {"id": rid},
            )
            total_logs = int(cnt_r.scalar_one() or 0)
    except Exception as exc:
        return json.dumps({"ok": False, "stage": "update_run", "error": str(exc)})

    artifact_id = None
    try:
        log_bytes = await dump_run_jsonl(rid)
        if log_bytes:
            from ..artifacts import archive_artifact
            art = await archive_artifact(
                data=log_bytes,
                kind="log",
                tool_name="sub_agent_merge",
                filename=f"run_{rid}.jsonl",
                mime="application/x-ndjson",
                provenance={
                    "run_id": rid,
                    "root_run_id": stats.get("root_run_id"),
                    "depth": stats.get("depth"),
                    "total_logs": total_logs,
                    "total_tokens": stats.get("total_tokens"),
                    "total_cost": stats.get("total_cost_usd"),
                    "summary": result_summary,
                },
            )
            artifact_id = art.get("id")
    except Exception as exc:
        return json.dumps({
            "ok": True, "run_id": rid, "status": "merged",
            "log_archive_warning": f"failed to archive logs: {exc!s}",
        })

    return json.dumps({
        "ok": True, "run_id": rid, "status": "merged",
        "total_logs": total_logs,
        "log_artifact_id": artifact_id,
        "note": "Ring state consolidated; run log stream archived to artifacts.",
    })
# N:M
