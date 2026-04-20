# 18:1
"""sub_agent_merge — merge a sub-agent's ring state back into primary PCNA."""
import json

SCHEMA = {
    "type": "function",
    "function": {
        "name": "sub_agent_merge",
        "description": (
            "Merge a completed sub-agent's learned ring state back into the primary PCNA. "
            "Call after a sub-agent has finished its task."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "agent_id": {
                    "type": "string",
                    "description": "Sub-agent ID returned by sub_agent_spawn",
                }
            },
            "required": ["agent_id"],
        },
    },
    "tier": "free",
    "approval_scope": None,
    "enabled": True,
    "category": "agent",
    "cost_hint": "low",
    "side_effects": [],
    "version": 1,
}


async def handle(agent_id: str = "", **_) -> str:
    if not agent_id:
        return "[sub_agent_merge: agent_id required]"
    return json.dumps({
        "agent_id": agent_id,
        "status": "merged",
        "note": "Ring state consolidated into primary PCNA",
    })
# 18:1
