import os
import re
from typing import Any

from ..config.policy_loader import (
    get_roles,
    get_routing_rules,
    get_default_role,
    get_approval_gate_actions,
    get_defaults,
)

_MODEL_ENV_MAP = {
    "root_orchestrator": "OPENAI_MODEL_ROOT",
    "high_risk_gate": "OPENAI_MODEL_ROOT",
    "worker": "OPENAI_MODEL_WORKER",
    "classifier": "OPENAI_MODEL_CLASSIFIER",
    "deep_pass": "OPENAI_MODEL_DEEP",
}

_RULE_KEYWORDS: dict[str, list[str]] = {}


def _build_keyword_index() -> None:
    global _RULE_KEYWORDS
    if _RULE_KEYWORDS:
        return
    for rule in get_routing_rules():
        match_expr = rule.get("match", "")
        role = rule.get("route_to", "")
        tokens = [t.strip().lower() for t in re.split(r"\s+OR\s+", match_expr)]
        _RULE_KEYWORDS[role] = _RULE_KEYWORDS.get(role, []) + tokens


def resolve_role(task_text: str) -> str:
    _build_keyword_index()
    lower = task_text.lower()
    for role, keywords in _RULE_KEYWORDS.items():
        if any(kw in lower for kw in keywords):
            return role
    return get_default_role()


def resolve_model(role: str) -> str:
    env_key = _MODEL_ENV_MAP.get(role, "OPENAI_MODEL_ROOT")
    return os.environ.get(env_key, "gpt-5.4")


def resolve_role_config(role: str) -> dict:
    """Return call-level config (not part of structured route_decision schema)."""
    roles = get_roles()
    role_cfg = roles.get(role, roles.get(get_default_role(), {}))
    defaults = get_defaults()
    return {
        "model": resolve_model(role),
        "store": role_cfg.get("store", defaults.get("store", False)),
        "temperature": role_cfg.get("temperature", defaults.get("temperature", 1)),
        "max_output_tokens": role_cfg.get(
            "max_output_tokens", defaults.get("max_output_tokens", 4000)
        ),
        "reasoning_effort": role_cfg.get("reasoning", {}).get(
            "effort", defaults.get("reasoning", {}).get("effort", "low")
        ),
    }


def make_route_decision(task_text: str) -> dict[str, Any]:
    """
    Return a route_decision strictly conforming to the policy schema
    (additionalProperties: false — only role, reason, requires_approval, hmmm).
    Call config (model, effort, etc.) is returned separately via make_call_config().
    """
    role = resolve_role(task_text)
    requires_approval = _check_approval_required(task_text)
    return {
        "role": role,
        "reason": f"keyword match → {role}",
        "requires_approval": requires_approval,
        "hmmm": {},
    }


def make_call_config(role: str) -> dict[str, Any]:
    """Return the call-level parameters for a resolved role (not part of structured schema)."""
    return resolve_role_config(role)


def _check_approval_required(task_text: str) -> bool:
    lower = task_text.lower()
    gate_actions = get_approval_gate_actions()
    return any(action.replace("_", " ") in lower or action in lower for action in gate_actions)


def make_approval_packet(task_text: str, gate_id: str) -> dict[str, Any]:
    """
    Return an approval_packet strictly conforming to the policy schema
    (additionalProperties: false — gate_id, action, impact, rollback, artifacts, hmmm).
    approval_state is NOT included in the packet (it is a separate channel in usage metadata).
    """
    return {
        "gate_id": gate_id,
        "action": task_text[:200],
        "impact": "External write or high-risk action detected — requires explicit approval.",
        "rollback": "Revert by discarding the pending action; no external state has been modified.",
        "artifacts": [],
        "hmmm": {},
    }
