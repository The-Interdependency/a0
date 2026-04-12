import os
import re
from typing import Any

from ..config.policy_loader import (
    get_roles,
    get_routing_rules,
    get_default_role,
    get_approval_gate_actions,
    get_defaults,
    get_action_scope,
    get_action_keywords,
    get_safety_floor_actions,
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
        raw_tokens = [t.strip().lower() for t in re.split(r"\s+OR\s+", match_expr)]
        normalized: list[str] = []
        for tok in raw_tokens:
            normalized.append(tok)
            spaced = tok.replace("_", " ")
            if spaced != tok:
                normalized.append(spaced)
        _RULE_KEYWORDS[role] = _RULE_KEYWORDS.get(role, []) + normalized


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


def make_route_decision(
    task_text: str,
    pre_approved_scopes: set[str] | None = None,
) -> dict[str, Any]:
    """
    Return a route_decision strictly conforming to the policy schema
    (additionalProperties: false — only role, reason, requires_approval, hmmm).
    Call config (model, effort, etc.) is returned separately via make_call_config().
    pre_approved_scopes: set of scope names the user has pre-approved (skips gate).
    """
    role = resolve_role(task_text)
    requires_approval = _check_approval_required(task_text, pre_approved_scopes)
    return {
        "role": role,
        "reason": f"keyword match → {role}",
        "requires_approval": requires_approval,
        "hmmm": {},
    }


def make_call_config(role: str) -> dict[str, Any]:
    """Return the call-level parameters for a resolved role (not part of structured schema)."""
    return resolve_role_config(role)


def _action_matched(action: str, lower: str, aliases: dict[str, list[str]]) -> bool:
    """Return True if the action's canonical name or any of its natural-language aliases appear in lower."""
    if action.replace("_", " ") in lower or action in lower:
        return True
    for phrase in aliases.get(action, []):
        if phrase in lower:
            return True
    return False


def _check_approval_required(
    task_text: str,
    pre_approved_scopes: set[str] | None = None,
) -> bool:
    """
    Return True if the task requires explicit approval.
    Safety-floor actions (spend_money, change_permissions, change_secrets) always require approval.
    Other actions are bypassed if the user has pre-approved the matching scope category.
    Matching uses both canonical action names and natural-language aliases from the policy.
    """
    lower = task_text.lower()
    gate_actions = get_approval_gate_actions()
    safety_floor = set(get_safety_floor_actions())
    approved = pre_approved_scopes or set()
    aliases = get_action_keywords()

    for action in gate_actions:
        if not _action_matched(action, lower, aliases):
            continue
        if action in safety_floor:
            return True
        scope = get_action_scope(action)
        if scope and scope in approved:
            continue
        return True

    return False


def get_triggered_actions(task_text: str) -> list[str]:
    """Return list of gate actions found in the task text (canonical name or alias match)."""
    lower = task_text.lower()
    aliases = get_action_keywords()
    return [
        a for a in get_approval_gate_actions()
        if _action_matched(a, lower, aliases)
    ]


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
