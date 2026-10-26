# 142:45 0:0 0:0
"""Shared approval-gate construction for every tool-capable model transport."""
from __future__ import annotations

# === MODULE_BUILD ===
# id: a0_service_approval_gate
#   module_name: approval_gate_service
#   module_kind: service
#   summary: Builds current-turn pending approvals and converts scoped tool-dispatch denials from every transport into exact-scope replay gates.
#   owner: Erin Spencer
#   public_surface: approval_gate_result, capture_tool_approval, pending_gate_entry
#   internal_surface: _message_text, _current_user_text, _pending_gate, _tool_approval_gate_result
#   auth_boundary: user approval scopes
#   storage_boundary: read/write audit
#   network_boundary: none
#   user_data_boundary: read
#   admin_only: false
#   tests: tests/test_appr_tool_disp_v0.0.0alpha.py
#   rollout: default_enabled
#   rollback: Revert shared transport capture and restore the legacy OpenAI-local gate builder.
#   requires: a0_service_openai_router, a0_service_run_context, a0_service_tool_executor
#   since: 2026-09-09
#   unresolved: none
# === END MODULE_BUILD ===

# === CONTRACTS ===
# id: approval_gate_uses_current_user_turn
#   given: conversation history contains an earlier gated request and a later unrelated user turn
#   then: approval classification evaluates only the latest user turn while replay retains that original turn as the latest history entry
#   class: security
#   since: 2026-09-10
#
# id: approval_gate_replay_is_scope_bound
#   given: a user approves one pending action and replay reaches a registered scoped tool
#   then: dispatch is cleared only when the tool's declared scope exactly matches a scope recorded by that pending gate
#   class: security
#   since: 2026-09-10
#
# id: approval_gate_dispatch_denial_becomes_pending
#   given: any tool-capable provider selects a scoped tool that text preflight did not identify
#   then: the denial becomes a pending gate carrying the concrete tool and scope instead of an inert tool-result string
#   class: security
#   since: 2026-09-10
# === END CONTRACTS ===

import json
from typing import Any, Awaitable, Optional, Sequence


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


def _current_user_text(messages: list[dict]) -> str:
    """Return text from the latest user turn only."""
    return next(
        (
            _message_text(message.get("content"))
            for message in reversed(messages)
            if message.get("role") == "user"
        ),
        "",
    )


def pending_gate_entry(
    usage: dict, *, history: list[dict], system_prompt: Optional[str],
    provider_id: str, uid: Optional[str], enabled_tools: Optional[list[str]],
) -> dict:
    """Build the single deterministic chat continuation shape for a pending gate."""
    model_id = usage.get("model_id")
    return {
        "gate_id": usage.get("gate_id"), "history": history,
        "system_prompt": system_prompt,
        "provider_id": usage.get("provider_id") or provider_id,
        "pin_requested_provider": bool(model_id), "model_override": model_id,
        "approval_scopes": usage.get("approval_scopes", []),
        "approval_tool": usage.get("approval_tool"),
        "uid": uid, "enabled_tools": enabled_tools,
    }


async def _pending_gate(
    task_text: str, *, route_decision: dict, provider_id: str, model_id: str,
    reasoning_effort: Optional[str], approval_scopes: Sequence[str],
    approval_tool: Optional[str] = None,
) -> tuple[dict, tuple[str, dict]]:
    from .openai_router import make_approval_packet
    from ..config.policy_loader import get_scope_categories
    from ..logger import log_openai_event

    import uuid
    gate_id = f"gate-{uuid.uuid4().hex[:8]}"
    packet = make_approval_packet(task_text, gate_id)
    await log_openai_event(
        role=route_decision["role"], model=model_id,
        reasoning_effort=reasoning_effort or "medium",
        input_text=json.dumps({"task": task_text}),
        output_text=json.dumps(packet), approval_state="pending",
    )
    scopes = sorted(set(approval_scopes))
    usage = {
        "approval_state": "pending", "gate_id": gate_id,
        "approval_packet": packet, "route_decision": route_decision,
        "provider_id": provider_id, "model_id": model_id,
        "approval_scopes": scopes, "approval_tool": approval_tool,
    }
    categories = get_scope_categories()
    scope_hints = [
        f"  Pre-approve all {categories[scope]['label']}: APPROVE SCOPE {scope}"
        for scope in scopes if scope in categories
    ]
    scope_section = "\n" + "\n".join(scope_hints) if scope_hints else ""
    content = (
        f"[APPROVAL REQUIRED — gate_id: {gate_id}]\n"
        f"Action: {packet['action'][:120]}\nImpact: {packet['impact']}\n"
        f"Rollback: {packet['rollback']}\n"
        f"To approve this action: APPROVE {gate_id}{scope_section}"
    )
    return route_decision, (content, usage)


async def approval_gate_result(
    messages: list[dict], *, user_id: Optional[str], skip_approval: bool,
    provider_id: str, model_id: str, reasoning_effort: Optional[str],
) -> tuple[dict, Optional[tuple[str, dict]]]:
    """Return the shared route decision and, when required, a pending gate."""
    from .openai_router import get_triggered_actions, make_route_decision
    from ..config.policy_loader import (
        get_action_scope, get_hmmm_seed_items,
    )
    from ..logger import seed_openai_hmmm_if_empty

    await seed_openai_hmmm_if_empty(get_hmmm_seed_items())
    task_text = _current_user_text(messages)
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
    scopes = [
        scope for action in get_triggered_actions(task_text)
        if (scope := get_action_scope(action))
    ]
    return await _pending_gate(
        task_text, route_decision=route_decision, provider_id=provider_id,
        model_id=model_id, reasoning_effort=reasoning_effort,
        approval_scopes=scopes,
    )


async def _tool_approval_gate_result(
    messages: list[dict], *, provider_id: str, model_id: str,
    reasoning_effort: Optional[str], tool_name: str, approval_scope: str,
) -> tuple[str, dict]:
    from .openai_router import make_route_decision

    task_text = _current_user_text(messages)
    route_decision = {
        **make_route_decision(task_text),
        "requires_approval": True,
    }
    _, pending = await _pending_gate(
        task_text, route_decision=route_decision, provider_id=provider_id,
        model_id=model_id, reasoning_effort=reasoning_effort,
        approval_scopes=(approval_scope,), approval_tool=tool_name,
    )
    return pending


async def capture_tool_approval(
    transport: Awaitable[tuple[str, dict]], *, messages: list[dict],
    provider_id: str, model_id: str, reasoning_effort: Optional[str],
    approved_tool_scopes: Optional[Sequence[str]] = None,
) -> tuple[str, dict]:
    """Scope one transport and turn a dispatch denial into a pending gate."""
    from .run_context import current_approval_gate_scopes
    from .tool_executor import ToolApprovalRequired

    token = current_approval_gate_scopes.set(frozenset(approved_tool_scopes or ()))
    try:
        try:
            return await transport
        except ToolApprovalRequired as denied:
            return await _tool_approval_gate_result(
                messages, provider_id=provider_id, model_id=model_id,
                reasoning_effort=reasoning_effort,
                tool_name=denied.tool_name, approval_scope=denied.approval_scope,
            )
    finally:
        current_approval_gate_scopes.reset(token)
# 142:45 0:0 0:0
