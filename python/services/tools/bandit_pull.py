# 26:1
"""bandit_pull — query EDCM bandit router for recommended energy provider."""
import json

SCHEMA = {
    "type": "function",
    "function": {
        "name": "bandit_pull",
        "description": (
            "Query the EDCM bandit router for the recommended energy provider "
            "based on current ring coherence. Returns the selected provider ID and score."
        ),
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
    "tier": "free",
    "approval_scope": None,
    "enabled": True,
    "category": "routing",
    "cost_hint": "free",
    "side_effects": [],
    "version": 1,
}


async def handle(**_) -> str:
    from ..energy_registry import energy_registry
    provider = energy_registry.get_active_provider()
    return json.dumps({
        "recommended_provider": provider,
        "note": "Bandit router defers to coherence-weighted active provider",
    })
# 26:1
