# 75:23 0:0 0:0
"""Shared approval-gate construction for every tool-capable model transport."""
from __future__ import annotations

# === MODULE_BUILD ===
# id: a0_service_approval_gate
#   module_name: approval_gate_service
#   module_kind: service
#   summary: Builds the policy route decision and pending approval response shared by legacy OpenAI and registry-driven compatible-provider transports.
#   owner: Erin Spencer
#   public_surface: approval_gate_result
#   internal_surface: _message_text
#   auth_boundary: user approval scopes
#   storage_boundary: read/write audit
#   network_boundary: none
#   user_data_boundary: read
#   admin_only: false
#   tests: tests/test_appr_tool_disp_v0.0.0alpha.py
#   rollout: default_enabled
#   rollback: Revert compatible-provider gate wiring and restore the legacy OpenAI-local gate builder.
#   requires: a0_service_openai_router
#   since: 2026-09-09
#   unresolved: none
# === END MODULE_BUILD ===

import json
from typing import Any, Optional


def _message_text(content: Any) -> str:
    """Extract only textual parts from provider-normalized message content."""
    if isinstance(content, str):
        return content
    if not isinstance(content, list):
        return ""
    parts: list[str] = []
    for item in content:
        if isinstance(item, str):
            parts.append(item)
        elif isinstance(item, dict) and isinstance(item.get("text"), str):
            parts.append(item["text"])
    return "\n".join(parts)


async def approval_gate_result(
    messages: list[dict], *, user_id: Optional[str], skip_approval: bool,
    provider_id: str, model_id: str, reasoning_effort: Optional[str],
) -> tuple[dict, Optional[tuple[str, dict]]]:
    """Return the shared route decision and, when required, a pending gate."""
    from .openai_router import (
        get_triggered_actions, make_approval_packet, make_route_decision,
    )
    from ..config.policy_loader import (
        get_action_scope, get_hmmm_seed_items, get_scope_categories,
    )
    from ..logger import log_openai_event, seed_openai_hmmm_if_empty

    await seed_openai_hmmm_if_empty(get_hmmm_seed_items())
    task_text = " ".join(
        _message_text(m.get("content"))
        for m in messages
        if m.get("role") == "user"
    )
    pre_approved_scopes: set[str] = set()
    if user_id:
        try:
            from ..storage import storage
            pre_approved_scopes = await storage.get_approval_scope_names(user_id)
        except Exception as scope_err:
            print(f"[approval_scopes] failed to load scopes for {user_id}: {scope_err}")
    route_decision = make_route_decision(
        task_text, pre_approved_scopes=pre_approved_scopes
    )
    if skip_approval or not route_decision["requires_approval"]:
        return route_decision, None

    import uuid
    gate_id = f"gate-{uuid.uuid4().hex[:8]}"
    packet = make_approval_packet(task_text, gate_id)
    await log_openai_event(
        role=route_decision["role"], model=model_id,
        reasoning_effort=reasoning_effort or "medium",
        input_text=json.dumps({"task": task_text}),
        output_text=json.dumps(packet), approval_state="pending",
    )
    usage = {
        "approval_state": "pending", "gate_id": gate_id,
        "approval_packet": packet, "route_decision": route_decision,
        "provider_id": provider_id, "model_id": model_id,
    }
    scope_categories = get_scope_categories()
    scope_hints: list[str] = []
    seen_scopes: set[str] = set()
    for action in get_triggered_actions(task_text):
        scope = get_action_scope(action)
        if scope and scope not in seen_scopes and scope in scope_categories:
            label = scope_categories[scope]["label"]
            scope_hints.append(f"  Pre-approve all {label}: APPROVE SCOPE {scope}")
            seen_scopes.add(scope)
    scope_section = "\n" + "\n".join(scope_hints) if scope_hints else ""
    content = (
        f"[APPROVAL REQUIRED — gate_id: {gate_id}]\n"
        f"Action: {packet['action'][:120]}\nImpact: {packet['impact']}\n"
        f"Rollback: {packet['rollback']}\n"
        f"To approve this action: APPROVE {gate_id}{scope_section}"
    )
    return route_decision, (content, usage)
# 75:23 0:0 0:0
