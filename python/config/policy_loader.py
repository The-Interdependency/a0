# 43:6
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
    return load_policy().get("routing", {}).get("default_role", "conduct")


def get_approval_gate_actions() -> list[str]:
    return load_policy().get("approval_gates", {}).get("required_for", [])


def get_contracts() -> dict:
    return load_policy().get("contracts", {})


def get_structured_schemas() -> dict:
    return load_policy().get("structured_outputs", {}).get("schemas", {})


def get_hmmm_seed_items() -> list[dict]:
    return load_policy().get("hmmm", {}).get("items", [])


def get_scope_categories() -> dict:
    """Return scope category definitions from approval_gates.pre_approved_scopes.
    Falls back to legacy 'scope_categories' key for backward compatibility.
    """
    gates = load_policy().get("approval_gates", {})
    return gates.get("pre_approved_scopes", gates.get("scope_categories", {}))


def get_pre_approved_scopes() -> dict:
    """Canonical alias — returns approval_gates.pre_approved_scopes."""
    return get_scope_categories()


def get_safety_floor_actions() -> list[str]:
    return load_policy().get("approval_gates", {}).get("safety_floor", [])


def get_action_keywords() -> dict[str, list[str]]:
    """Return action → list of natural language keyword phrases that should trigger that gate action."""
    return load_policy().get("approval_gates", {}).get("action_keywords", {})


def get_action_scope(action: str) -> str | None:
    """Return the scope category name that covers the given gate action, or None."""
    for scope_name, meta in get_scope_categories().items():
        if action in meta.get("covers", []):
            return scope_name
    return None


def get_version() -> str:
    return load_policy().get("version", "unknown")
# 43:6
