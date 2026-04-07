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
    "high_risk_gate": "OPENAI_MODEL_GATE",
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
    role = resolve_role(task_text)
    requires_approval = _check_approval_required(task_text)
    cfg = resolve_role_config(role)
    return {
        "role": role,
        "reason": f"keyword match → {role}",
        "requires_approval": requires_approval,
        "model": cfg["model"],
        "reasoning_effort": cfg["reasoning_effort"],
        "max_output_tokens": cfg["max_output_tokens"],
        "temperature": cfg["temperature"],
        "store": cfg["store"],
        "hmmm": {},
    }


def _check_approval_required(task_text: str) -> bool:
    lower = task_text.lower()
    gate_actions = get_approval_gate_actions()
    return any(action.replace("_", " ") in lower or action in lower for action in gate_actions)


def make_approval_packet(task_text: str, gate_id: str) -> dict[str, Any]:
    return {
        "gate_id": gate_id,
        "action": task_text[:200],
        "impact": "External write or high-risk action detected — requires explicit approval.",
        "rollback": "Revert by discarding the pending action; no external state has been modified.",
        "artifacts": [],
        "approval_state": "pending",
        "hmmm": {},
    }
