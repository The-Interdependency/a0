# 127:22
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

# Env vars per role for OpenAI provider
# perform reuses OPENAI_MODEL_CONDUCT as the high-stakes model (same tier)
_MODEL_ENV_MAP = {
    "conduct": "OPENAI_MODEL_CONDUCT",
    "perform": "OPENAI_MODEL_CONDUCT",
    "practice": "OPENAI_MODEL_PRACTICE",
    "record": "OPENAI_MODEL_RECORD",
    "derive": "OPENAI_MODEL_DERIVE",
}

# Backward-compat: if new env vars not set, fall back to old names
_MODEL_ENV_FALLBACK = {
    "OPENAI_MODEL_CONDUCT": "OPENAI_MODEL_ROOT",
    "OPENAI_MODEL_PRACTICE": "OPENAI_MODEL_WORKER",
    "OPENAI_MODEL_RECORD": "OPENAI_MODEL_CLASSIFIER",
    "OPENAI_MODEL_DERIVE": "OPENAI_MODEL_DEEP",
}

# Legacy alias support (old role names still honored if policy cache has them)
_LEGACY_ROLE_MAP = {
    "root_orchestrator": "conduct",
    "high_risk_gate": "perform",
    "worker": "practice",
    "classifier": "record",
    "deep_pass": "derive",
}

_RULE_KEYWORDS: dict[str, list[str]] = {}


def _build_keyword_index() -> None:
    global _RULE_KEYWORDS
    if _RULE_KEYWORDS:
        return
    for rule in get_routing_rules():
        match_expr = rule.get("match", "")
        role = rule.get("route_to", "")
        # normalize legacy role names
        role = _LEGACY_ROLE_MAP.get(role, role)
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
    default = get_default_role()
    return _LEGACY_ROLE_MAP.get(default, default)


def resolve_model(role: str, provider_id: str = "openai") -> str:
    """
    Resolve model for a given role + provider.
    Priority: env var > old env var fallback > provider seed route_config > policy default > hardcoded fallback
    """
    # Normalize legacy role names
    role = _LEGACY_ROLE_MAP.get(role, role)

    if provider_id == "openai":
        env_key = _MODEL_ENV_MAP.get(role, "OPENAI_MODEL_CONDUCT")
        env_val = os.environ.get(env_key, "")
        if not env_val:
            fallback_key = _MODEL_ENV_FALLBACK.get(env_key, "")
            env_val = os.environ.get(fallback_key, "") if fallback_key else ""
        if env_val:
            return env_val
        # Fall through to seed / policy default
        roles = get_roles()
        role_cfg = roles.get(role, {})
        model_default = role_cfg.get("model_default", "")
        if model_default:
            return model_default
        return "gpt-5.4"

    # For other providers, delegate to energy_registry seed resolution
    try:
        from .energy_registry import energy_registry
        return energy_registry.resolve_model_for_role(provider_id, role)
    except Exception:
        return _provider_fallback_model(provider_id)


def _provider_fallback_model(provider_id: str) -> str:
    defaults = {
        "grok": "grok-4-1-fast-non-reasoning",
        "gemini": "gemini-2.5-flash",
        "claude": "claude-3-5-haiku-20241022",
    }
    return defaults.get(provider_id, "gpt-5.4")


def resolve_role_config(role: str, provider_id: str = "openai") -> dict:
    """Return call-level config (not part of structured route_decision schema)."""
    role = _LEGACY_ROLE_MAP.get(role, role)
    roles = get_roles()
    default_role = get_default_role()
    default_role = _LEGACY_ROLE_MAP.get(default_role, default_role)
    role_cfg = roles.get(role, roles.get(default_role, {}))
    defaults = get_defaults()
    return {
        "model": resolve_model(role, provider_id),
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


def make_call_config(role: str, provider_id: str = "openai") -> dict[str, Any]:
    """Return the call-level parameters for a resolved role (not part of structured schema)."""
    return resolve_role_config(role, provider_id)


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
# 127:22
