# 18:1
"""sub_agent_spawn — fork a ZFAE sub-agent for a parallel task."""
import json
import uuid

SCHEMA = {
    "type": "function",
    "function": {
        "name": "sub_agent_spawn",
        "description": (
            "Spawn a ZFAE sub-agent with a forked PCNA instance to handle a specific task in parallel. "
            "Returns the sub-agent ID."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "task": {
                    "type": "string",
                    "description": "Description of the task for the sub-agent to execute",
                }
            },
            "required": ["task"],
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


async def handle(task: str = "", **_) -> str:
    agent_id = f"a0z-{uuid.uuid4().hex[:8]}"
    return json.dumps({
        "agent_id": agent_id,
        "task": task,
        "status": "spawned",
        "note": "Sub-agent forked PCNA — call sub_agent_merge with this ID when complete",
    })
# 18:1
