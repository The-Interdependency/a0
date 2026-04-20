# 22:1
"""pcna_reward — apply a reward signal to the PCNA engine."""
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
    from ...main import get_pcna as _get
    pcna = _get()
    score = float(score)
    pcna.reward(winner="agent", outcome=score)
    return json.dumps({
        "applied_score": score,
        "reason": reason or "not specified",
        "reward_count": pcna.reward_count,
        "last_coherence": round(pcna.last_coherence, 4),
    })
# 22:1
