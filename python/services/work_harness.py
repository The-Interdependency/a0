# 298:82 0:0 1:3
"""Continuous A0 work harness.

The conversation is the durable work identity. Model/provider selection is an
internal execution detail unless the caller explicitly pins a model.

Usage guidance:
    history, state = prepare_continuity(messages, attachments, previous_state)
    content, usage, provider_id = await run_single_turn(
        model_id="deepseek",
        messages=history,
        user_id=user_id,
        system_prompt=system_prompt,
        pin_requested_provider=False,
        use_tools=True,
    )

Persist `state` on the owning conversation. Pass it back on the next turn.
The bounded checkpoint is continuity aid, not transcript authority; the full
persisted message transcript remains authoritative and replayable.
"""
from __future__ import annotations

# === MODULE_BUILD ===
# id: a0_service_work_harness
#   module_name: work_harness
#   module_kind: service
#   summary: Keeps one durable conversation identity across bounded context and internally routed provider execution.
#   owner: Erin Spencer
#   public_surface: prepare_continuity, run_single_turn, continuity_state_summary
#   internal_surface: _checkpoint_line, _fallback_candidates, _safe_to_replay
#   auth_boundary: none
#   storage_boundary: read
#   network_boundary: external
#   user_data_boundary: write
#   admin_only: false
#   tests: tests/test_work_harness_v0.0.0alpha.py
#   rollout: default_enabled
#   rollback: Revert the chat integration and remove this service; persisted harness_state can remain inert.
#   requires: a0_service_agent_instance, a0_service_model_catalog
#   since: 2026-09-23
#   unresolved: provider quota APIs are not uniformly queryable before a call; unsafe post-tool replay remains hmmm
# === END MODULE_BUILD ===

# === BOUNDARIES ===
# id: work_harness_runtime_boundary
#   summary: Reads conversation state and may invoke configured providers; tool-enabled calls can cross downstream mutating-tool boundaries while this service itself performs no persistence.
#   auth_boundary: delegates tier enforcement and tool approvals to existing runtime gates
#   storage_boundary: read
#   network_boundary: external
#   user_data_boundary: write
#   admin_only: false
#   pii: possible
#   secrets: none
#   owner: platform-runtime
# === END BOUNDARIES ===

# === CONTRACTS ===
# id: harness_continuity_preserves_identity
#   given: a conversation exceeds the exact-history window
#   then: the original task anchor and recent messages remain in-role while older turns are represented by one bounded historical checkpoint tied to the same conversation
#   class: correctness
#
# id: harness_checkpoint_is_bounded
#   given: arbitrarily many old text turns are compacted
#   then: the continuity checkpoint stays within CHECKPOINT_MAX_CHARS and declares the persisted transcript authoritative
#   class: resource
#
# id: harness_explicit_pin_never_falls_back
#   given: a caller explicitly pins a model/provider and that call fails
#   then: the harness propagates the failure without silently substituting another provider
#   class: correctness
#
# id: harness_auto_fallback_replays_only_safe_turns
#   given: an unpinned call fails before any registry tool executes, including a transient provider quota or transport failure
#   then: the harness may retry an entitled configured provider; after a registry tool executes, transient failures are not automatically replayed
#   class: safety
# === END CONTRACTS ===

from typing import Any, Optional

import httpx

from .agent_instance import AgentInstance
from .energy_registry import cheap_provider
from .model_catalog import list_models_for_user
from .provider_failure import ProviderCallFailure, ProviderFailureText
from .run_context import current_tool_executions


EXACT_HISTORY_LIMIT = 40
RECENT_MESSAGES = 24
CHECKPOINT_MAX_CHARS = 12_000
CHECKPOINT_ENTRY_MAX_CHARS = 1_000
CHECKPOINT_VERSION = 1


def _history_entry(message: dict[str, Any], attachments: dict[int, list[dict]]) -> dict[str, Any]:
    entry: dict[str, Any] = {
        "role": message["role"],
        "content": str(message.get("content") or ""),
    }
    mid = message.get("id")
    atts = attachments.get(mid, []) if isinstance(mid, int) else []
    if atts:
        entry["attachments"] = [
            {"storage_url": a.get("storage_url"), "mime_type": a.get("mime_type")}
            for a in atts
        ]
    return entry


def _checkpoint_line(message: dict[str, Any], attachment_count: int) -> str:
    content = " ".join(str(message.get("content") or "").split())
    if len(content) > CHECKPOINT_ENTRY_MAX_CHARS:
        content = content[: CHECKPOINT_ENTRY_MAX_CHARS - 1].rstrip() + "…"
    role = str(message.get("role") or "unknown").upper()
    mid = message.get("id", "?")
    suffix = f" [attachments:{attachment_count}]" if attachment_count else ""
    return f"{role}[{mid}]{suffix}: {content}"


def _bounded_checkpoint(text: str) -> str:
    if len(text) <= CHECKPOINT_MAX_CHARS:
        return text
    marker = "[earlier checkpoint text omitted; persisted transcript remains authoritative]\n"
    keep = CHECKPOINT_MAX_CHARS - len(marker)
    return marker + text[-keep:]


def prepare_continuity(
    messages: list[dict[str, Any]],
    attachments_by_message: Optional[dict[int, list[dict]]] = None,
    previous_state: Optional[dict[str, Any]] = None,
) -> tuple[list[dict[str, Any]], Optional[dict[str, Any]]]:
    """Build bounded provider history without changing conversation identity.

    The latest 24 messages and the first task-anchor message remain exact.
    Older messages enter a bounded, explicitly historical checkpoint. The raw
    database transcript remains the authority for lossless inspection.
    """
    attachments = attachments_by_message or {}
    eligible = [m for m in messages if m.get("role") in ("user", "assistant")]
    if len(eligible) <= EXACT_HISTORY_LIMIT:
        return [_history_entry(m, attachments) for m in eligible], None

    older = eligible[1:-RECENT_MESSAGES]
    recent = eligible[-RECENT_MESSAGES:]
    previous = previous_state if isinstance(previous_state, dict) else {}
    previous_valid = (
        previous.get("version") == CHECKPOINT_VERSION
        and isinstance(previous.get("content"), str)
        and isinstance(previous.get("through_message_id"), int)
    )

    old_ids = [m.get("id") for m in older if isinstance(m.get("id"), int)]
    through = previous.get("through_message_id") if previous_valid else None
    if previous_valid and through is not None and old_ids and through <= old_ids[-1]:
        additions = [m for m in older if isinstance(m.get("id"), int) and m["id"] > through]
        checkpoint_text = previous["content"]
    else:
        additions = older
        checkpoint_text = ""

    lines = [
        _checkpoint_line(m, len(attachments.get(m.get("id"), [])))
        for m in additions
    ]
    if lines:
        checkpoint_text = "\n".join(part for part in (checkpoint_text, *lines) if part)
    checkpoint_text = _bounded_checkpoint(checkpoint_text)

    state = {
        "version": CHECKPOINT_VERSION,
        "through_message_id": old_ids[-1] if old_ids else 0,
        "compacted_messages": len(older),
        "content": checkpoint_text,
        "hmmm": (
            "bounded continuity is intentionally lossy; the persisted transcript "
            "remains authoritative and old attachment payloads are represented only by count"
        ),
    }
    checkpoint_message = {
        "role": "user",
        "content": (
            "[A0 HARNESS CONTINUITY — historical transcript excerpts, not a new request. "
            "USER lines are earlier user statements; ASSISTANT lines are earlier assistant output.]\n"
            + checkpoint_text
        ),
    }
    history = [
        _history_entry(eligible[0], attachments),
        checkpoint_message,
        *[_history_entry(m, attachments) for m in recent],
    ]
    return history, state


def continuity_state_summary(state: Optional[dict[str, Any]]) -> Optional[dict[str, Any]]:
    """Return non-content checkpoint provenance safe to duplicate into usage metadata."""
    if not state:
        return None
    return {
        "version": state.get("version"),
        "through_message_id": state.get("through_message_id"),
        "compacted_messages": state.get("compacted_messages"),
        "hmmm": state.get("hmmm"),
    }


def _preflight_failure(exc: BaseException) -> bool:
    text = str(exc).lower()
    if isinstance(exc, PermissionError):
        return any(token in text for token in ("tier", "disabled", "provider"))
    if isinstance(exc, ValueError):
        return any(token in text for token in ("unknown model", "no routed model", "no call path"))
    if isinstance(exc, RuntimeError):
        return any(token in text for token in ("unavailable:", "api key", "env var", "no spec"))
    return False


def _transient_transport_failure(exc: BaseException) -> bool:
    if isinstance(exc, (httpx.TimeoutException, httpx.NetworkError)):
        return True
    if isinstance(exc, httpx.HTTPStatusError):
        try:
            return exc.response.status_code == 429 or exc.response.status_code >= 500
        except Exception:
            return False
    text = str(exc).lower()
    return any(token in text for token in ("rate limit", "quota", "overloaded", "timed out", "timeout"))


def _safe_to_replay(exc: BaseException, *, tool_executions: int) -> bool:
    if tool_executions != 0:
        return False
    if isinstance(exc, ProviderCallFailure) or _preflight_failure(exc):
        return True
    return _transient_transport_failure(exc)


def _marked_failure(content: str, usage: dict[str, Any]) -> Optional[ProviderCallFailure]:
    if isinstance(content, ProviderFailureText):
        return ProviderCallFailure(content, usage)
    return None


def _boundary_result(
    *, provider: str, attempts: list[str], tool_executions: int,
    reason: str, usage: Optional[dict[str, Any]] = None,
) -> tuple[str, dict[str, Any], str]:
    traced = dict(usage or {})
    traced["harness"] = {
        "mode": "continuous-auto",
        "attempted_models": list(attempts),
        "fallback_count": max(0, len(attempts) - 1),
        "actual_provider": provider,
        "tool_executions": tool_executions,
        "status": "hmmm",
    }
    return f"hmmm: {reason}", traced, provider


async def _fallback_candidates(user_id: Optional[str], seed_provider: Optional[str]) -> list[str]:
    roster = await list_models_for_user(user_id)
    rows = [
        p for p in roster.get("providers", [])
        if p.get("enabled") and p.get("key_present") and not p.get("tier_blocked")
        and p.get("provider_id") != seed_provider
    ]
    cheap = cheap_provider()
    rows.sort(key=lambda p: (p.get("provider_id") != cheap, str(p.get("provider_id") or "")))
    candidates: list[str] = []
    for provider in rows:
        models = provider.get("models") or []
        primary = next((m for m in models if m.get("is_primary") and not m.get("disabled")), None)
        if primary and primary.get("model_id"):
            candidates.append(str(primary["model_id"]))
    return candidates


async def run_single_turn(
    *,
    model_id: str,
    messages: list[dict[str, Any]],
    user_id: Optional[str],
    system_prompt: Optional[str],
    pin_requested_provider: bool,
    use_tools: bool,
    max_tokens: int = 8000,
    reasoning_effort: Optional[str] = None,
) -> tuple[str, dict[str, Any], str]:
    """Run one turn while keeping provider substitution behind the harness.

    Explicit pins never fall back. Auto mode may recover from pre-dispatch
    failures, including transient quota/transport failures before any registry
    tool executes. After a tool boundary, transient failure remains hmmm
    because replay could duplicate an external side effect.
    """
    attempts: list[str] = [model_id]
    primary = AgentInstance.from_model(
        model_id=model_id,
        user_id=user_id,
        enforce_tier=False,
        enforce_enabled=False,
    )
    primary.use_tools = use_tools
    seed_provider = await primary.ensure_resolved()
    tool_token = current_tool_executions.set(0)
    try:
        try:
            content, usage = await primary.run(
                messages,
                system_prompt_override=system_prompt,
                max_tokens=max_tokens,
                reasoning_effort=reasoning_effort,
                pin_requested_provider=pin_requested_provider,
                enforce_routed_tier=True,
            )
            actual_provider = primary.provider_id or seed_provider
            marked = _marked_failure(content, usage)
            if marked is not None and not pin_requested_provider:
                raise marked
        except Exception as first_exc:
            if pin_requested_provider:
                raise
            executed = current_tool_executions.get()
            if not _safe_to_replay(first_exc, tool_executions=executed):
                if executed > 0 and (
                    isinstance(first_exc, ProviderCallFailure)
                    or _transient_transport_failure(first_exc)
                ):
                    return _boundary_result(
                        provider=getattr(first_exc, "provider", seed_provider),
                        attempts=attempts,
                        tool_executions=executed,
                        reason=(
                            "provider failure followed a tool execution boundary; automatic "
                            "replay was withheld because the preceding tool may have mutated state. "
                            "Conversation state is preserved for continuation."
                        ),
                        usage=getattr(first_exc, "usage", None),
                    )
                raise

            last_exc: BaseException = first_exc
            candidates = await _fallback_candidates(user_id, seed_provider)
            for fallback_model in candidates:
                attempts.append(fallback_model)
                try:
                    inst = AgentInstance.from_model(
                        model_id=fallback_model,
                        user_id=user_id,
                        enforce_tier=True,
                        enforce_enabled=True,
                    )
                    inst.use_tools = use_tools
                    content, usage = await inst.run(
                        messages,
                        system_prompt_override=system_prompt,
                        max_tokens=max_tokens,
                        reasoning_effort=reasoning_effort,
                        pin_requested_provider=True,
                        enforce_routed_tier=True,
                    )
                    actual_provider = inst.provider_id or await inst.ensure_resolved()
                    marked = _marked_failure(content, usage)
                    if marked is not None:
                        raise marked
                    break
                except Exception as exc:
                    last_exc = exc
                    executed = current_tool_executions.get()
                    if not _safe_to_replay(exc, tool_executions=executed):
                        if executed > 0 and (
                            isinstance(exc, ProviderCallFailure)
                            or _transient_transport_failure(exc)
                        ):
                            return _boundary_result(
                                provider=getattr(exc, "provider", fallback_model),
                                attempts=attempts,
                                tool_executions=executed,
                                reason=(
                                    "fallback provider failure followed a tool execution boundary; "
                                    "further replay was withheld because the preceding tool may "
                                    "have mutated state. Conversation state is preserved for continuation."
                                ),
                                usage=getattr(exc, "usage", None),
                            )
                        raise
            else:
                if isinstance(last_exc, ProviderCallFailure):
                    return _boundary_result(
                        provider=last_exc.provider,
                        attempts=attempts,
                        tool_executions=current_tool_executions.get(),
                        reason=(
                            "every eligible provider failed before a tool execution boundary; "
                            f"last sanitized provider response was {last_exc.safe_text}"
                        ),
                        usage=last_exc.usage,
                    )
                return _boundary_result(
                    provider=seed_provider,
                    attempts=attempts,
                    tool_executions=current_tool_executions.get(),
                    reason=(
                        "every eligible provider failed before a tool execution boundary; "
                        f"last failure type was {type(last_exc).__name__}"
                    ),
                )

        tool_executions = current_tool_executions.get()
    finally:
        current_tool_executions.reset(tool_token)

    traced = dict(usage or {})
    traced["harness"] = {
        "mode": "explicit-pin" if pin_requested_provider else "continuous-auto",
        "attempted_models": attempts,
        "fallback_count": max(0, len(attempts) - 1),
        "actual_provider": actual_provider,
        "tool_executions": tool_executions,
    }
    return content, traced, actual_provider
# 298:82 0:0 1:3
