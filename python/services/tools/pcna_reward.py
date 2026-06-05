# 47:28 0:0 0:2
"""pcna_reward — apply a reward signal to the PCNA engine."""

# === MODULE_BUILD ===
# id: a0_service_tools_pcna_reward
#   module_name: pcna_reward
#   module_kind: service
#   summary: pcna_reward tool — applies a reward signal (score + reason) to the active PCNA engine's reward backprop, targeting the primary core or a sub-agent's forked core.
#   owner: Erin Spencer
#   public_surface: SCHEMA, handle
#   internal_surface: none
#   auth_boundary: none
#   storage_boundary: none
#   network_boundary: none
#   user_data_boundary: none
#   admin_only: false
#   tests: hmmm
#   rollout: default_enabled
#   rollback: Revert this file; removes the pcna_reward tool from the registry.
#   requires: a0_engine_pcna
#   since: 2026-06-02
#   unresolved: none
# === END MODULE_BUILD ===

import json

SCHEMA = {
    "type": "function",
    "function": {
        "name": "pcna_reward",
        "description": (
            "Apply a reward signal to the PCNA engine. "
            "Use after evaluating the quality of a response — positive values reinforce, negative values correct."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "score": {
                    "type": "number",
                    "description": "Reward value, typically -1.0 to 1.0",
                },
                "reason": {
                    "type": "string",
                    "description": "Brief explanation of why this reward is being applied",
                },
            },
            "required": ["score"],
        },
    },
    "tier": "free",
    "approval_scope": None,
    "enabled": True,
    "category": "pcna",
    "cost_hint": "low",
    "side_effects": [],
    "version": 1,
}


async def handle(score: float = 0.0, reason: str = "", **_) -> str:
    """Route reward to the caller's provider core if active, else primary.

    Honest dual-routing: caller_provider is set by the inference dispatcher
    during a chat turn, so a reward fired inside a turn lands on that
    provider's forked core. Tools fired outside any chat context (admin
    invocation, batch jobs, etc.) reward primary. Both paths are observable
    in the returned `routed_to` field — no silent fallback.
    """
    from ...main import get_pcna
    from ..tool_distill import get_caller_provider
    score = float(score)
    caller = get_caller_provider()
    target = get_pcna()
    routed_to = f"primary (caller={caller})" if caller else "primary"
    target.reward(winner="agent", outcome=score)
    return json.dumps({
        "applied_score": score,
        "reason": reason or "not specified",
        "reward_count": target.reward_count,
        "last_coherence": round(target.last_coherence, 4),
        "routed_to": routed_to,
    })
# 47:28 0:0 0:2
