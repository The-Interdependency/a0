# 65:1
"""tool_result_fetch — read a chunk of a previously persisted tool result."""

SCHEMA = {
    "type": "function",
    "function": {
        "name": "tool_result_fetch",
        "description": (
            "Retrieve detail from a previous tool call's raw result that was "
            "lost to distillation. Use when a distilled tool result references "
            "a call_id (in the [distilled via ... call_id=...] header) and you "
            "need to inspect the original payload. Returns one chunk at a time "
            "with a header indicating total chunks. Do NOT use to re-fetch "
            "fresh data — the result is whatever was captured at original call time."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "call_id": {
                    "type": "string",
                    "description": "The call_id from a distillation header (e.g. 'call-a3f81b9c').",
                },
                "chunk": {
                    "type": "integer",
                    "description": "Zero-indexed chunk number to retrieve. Default 0.",
                    "default": 0,
                },
                "chunk_size": {
                    "type": "integer",
                    "description": "Bytes per chunk. Default 8000 (~2K tokens). Max 32000.",
                    "default": 8000,
                },
            },
            "required": ["call_id"],
        },
    },
    "tier": "free",
    "approval_scope": None,
    "enabled": True,
    "category": "introspection",
    "cost_hint": "free",
    "side_effects": [],
    "version": 1,
}


async def handle(call_id: str = "", chunk: int = 0, chunk_size: int = 8000, **_) -> str:
    if not call_id:
        return "[tool_result_fetch: missing call_id]"
    chunk_size = max(1024, min(32000, int(chunk_size)))
    try:
        from ...storage import storage
        row = await storage.get_tool_result(call_id)
    except Exception as exc:
        return f"[tool_result_fetch: storage error — {exc}]"
    if not row:
        return f"[tool_result_fetch: no result found for call_id={call_id}]"
    raw = row.get("raw_result") or ""
    total_bytes = len(raw.encode("utf-8"))
    n_chunks = max(1, (len(raw) + chunk_size - 1) // chunk_size)
    chunk = max(0, min(n_chunks - 1, int(chunk)))
    start = chunk * chunk_size
    end = start + chunk_size
    body = raw[start:end]
    tool_name = row.get("tool_name", "?")
    return (
        f"[tool_result_fetch · {tool_name} · call_id={call_id} · "
        f"chunk {chunk + 1}/{n_chunks} · {total_bytes // 1024} KB total]\n\n"
        f"{body}"
    )
# 65:1
