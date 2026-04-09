import json
from pathlib import Path
from typing import Any

_POLICY_PATH = Path(__file__).parent / "openai_policy.json"
_policy: dict | None = None


def load_policy() -> dict:
    global _policy
    if _policy is None:
        with open(_POLICY_PATH, "r", encoding="utf-8") as f:
            _policy = json.load(f)
    return _policy


def get_defaults() -> dict:
    return load_policy().get("defaults", {})


def get_roles() -> dict:
    return load_policy().get("roles", {})


def get_routing_rules() -> list[dict]:
    return load_policy().get("routing", {}).get("rules", [])


def get_default_role() -> str:
    return load_policy().get("routing", {}).get("default_role", "root_orchestrator")


def get_approval_gate_actions() -> list[str]:
    return load_policy().get("approval_gates", {}).get("required_for", [])


def get_contracts() -> dict:
    return load_policy().get("contracts", {})


def get_structured_schemas() -> dict:
    return load_policy().get("structured_outputs", {}).get("schemas", {})


def get_hmmm_seed_items() -> list[dict]:
    return load_policy().get("hmmm", {}).get("items", [])


def get_scope_categories() -> dict:
    return load_policy().get("approval_gates", {}).get("scope_categories", {})


def get_safety_floor_actions() -> list[str]:
    return load_policy().get("approval_gates", {}).get("safety_floor", [])


def get_action_scope(action: str) -> str | None:
    """Return the scope category name that covers the given gate action, or None."""
    for scope_name, meta in get_scope_categories().items():
        if action in meta.get("covers", []):
            return scope_name
    return None


def get_version() -> str:
    return load_policy().get("version", "unknown")
