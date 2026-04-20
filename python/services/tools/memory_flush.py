# 18:1
"""memory_flush — persist active memory seeds to checkpoint."""
import json

SCHEMA = {
    "type": "function",
    "function": {
        "name": "memory_flush",
        "description": (
            "Flush active memory seeds to checkpoint. "
            "Call this when important context should be persisted for future sessions."
        ),
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
    "tier": "free",
    "approval_scope": None,
    "enabled": True,
    "category": "memory",
    "cost_hint": "low",
    "side_effects": ["filesystem"],
    "version": 1,
}


async def handle(**_) -> str:
    from ...main import get_pcna as _get
    pcna = _get()
    await pcna.save_checkpoint()
    return json.dumps({
        "flushed": True,
        "checkpoint_key": pcna._checkpoint_key,
        "infer_count": pcna.infer_count,
    })
# 18:1
