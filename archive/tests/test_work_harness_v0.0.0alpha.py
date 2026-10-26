# 206:29 0:0 0:1
"""Witnesses for the continuous A0 work harness.

Usage:
    uv run pytest -q tests/test_work_harness_v0.0.0alpha.py
"""
from __future__ import annotations

# === CHECKS ===
# id: check_harness_continuity_preserves_identity
#   proves: harness_continuity_preserves_identity, harness_checkpoint_is_bounded
#   call: self::test_continuity_keeps_anchor_recent_and_bounded_checkpoint
#   requires: python3
#   timeout: 10
#   mutates: none
#   cleanup: none
#
# id: check_harness_explicit_pin_never_falls_back
#   proves: harness_explicit_pin_never_falls_back
#   call: self::test_explicit_pin_never_falls_back
#   requires: python3
#   timeout: 10
#   mutates: none
#   cleanup: none
#
# id: check_harness_auto_fallback_replays_only_safe_turns
#   proves: harness_auto_fallback_replays_only_safe_turns
#   call: self::test_auto_mode_falls_back_on_preflight_failure
#   requires: python3
#   timeout: 10
#   mutates: none
#   cleanup: none
# === END CHECKS ===

from unittest.mock import AsyncMock

import httpx
import pytest

from python.services import tool_executor, work_harness
from python.services.provider_failure import ProviderFailureText, mark_provider_failure


def _messages(n: int) -> list[dict]:
    return [
        {
            "id": i + 1,
            "role": "user" if i % 2 == 0 else "assistant",
            "content": f"message-{i + 1} " + ("x" * 80),
        }
        for i in range(n)
    ]


def test_continuity_keeps_anchor_recent_and_bounded_checkpoint() -> None:
    messages = _messages(80)
    history, state = work_harness.prepare_continuity(messages)
    assert state is not None
    assert history[0]["content"] == messages[0]["content"]
    assert history[-1]["content"] == messages[-1]["content"]
    assert history[1]["role"] == "user"
    assert "A0 HARNESS CONTINUITY" in history[1]["content"]
    assert state["through_message_id"] == messages[-work_harness.RECENT_MESSAGES - 1]["id"]
    assert state["compacted_messages"] == 55
    assert len(state["content"]) <= work_harness.CHECKPOINT_MAX_CHARS
    assert "persisted transcript" in state["hmmm"]


def test_continuity_incrementally_advances_checkpoint() -> None:
    first, state = work_harness.prepare_continuity(_messages(60))
    assert state is not None
    _, next_state = work_harness.prepare_continuity(_messages(62), previous_state=state)
    assert next_state is not None
    assert next_state["through_message_id"] > state["through_message_id"]
    assert next_state["compacted_messages"] > state["compacted_messages"]
    assert first[0]["content"].startswith("message-1")


class _FakeInstance:
    failures: dict[str, BaseException] = {}
    calls: list[str] = []

    def __init__(self, model_id: str):
        self.model_id = model_id
        self.provider_id = None
        self.use_tools = True

    async def ensure_resolved(self) -> str:
        self.provider_id = "seed-provider" if self.model_id == "seed" else "fallback-provider"
        return self.provider_id

    async def run(self, messages, **kwargs):
        self.calls.append(self.model_id)
        failure = self.failures.get(self.model_id)
        if failure is not None:
            raise failure
        self.provider_id = "fallback-provider" if self.model_id != "seed" else "seed-provider"
        return "ok", {"input_tokens": 1, "output_tokens": 1, "provider_id": self.provider_id}


@pytest.fixture(autouse=True)
def _fake_instances(monkeypatch: pytest.MonkeyPatch):
    _FakeInstance.failures = {}
    _FakeInstance.calls = []

    def factory(model_id: str, **kwargs):
        return _FakeInstance(model_id)

    monkeypatch.setattr(work_harness.AgentInstance, "from_model", factory)
    monkeypatch.setattr(work_harness, "cheap_provider", lambda: "fallback-provider")
    monkeypatch.setattr(
        work_harness,
        "list_models_for_user",
        AsyncMock(return_value={
            "providers": [{
                "provider_id": "fallback-provider",
                "enabled": True,
                "key_present": True,
                "tier_blocked": False,
                "models": [{"model_id": "fallback", "is_primary": True, "disabled": False}],
            }]
        }),
    )





@pytest.mark.asyncio
async def test_registry_dispatch_marks_execution_boundary(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_dispatch(name: str, **kwargs):
        return f"ok:{name}"

    token = work_harness.current_tool_executions.set(0)
    monkeypatch.setattr(tool_executor, "_registry_dispatch", fake_dispatch)
    try:
        result = await tool_executor._execute_tool_inner("harness_probe", {})
        assert result == "ok:harness_probe"
        assert work_harness.current_tool_executions.get() == 1
    finally:
        work_harness.current_tool_executions.reset(token)


def test_provider_failure_marker_is_string_compatible() -> None:
    marker = mark_provider_failure("[seed error: quota]", "seed-provider", RuntimeError("quota"))
    assert isinstance(marker, str)
    assert isinstance(marker, ProviderFailureText)
    assert marker.provider == "seed-provider"
    assert marker.error_type == "RuntimeError"
    assert str(marker) == "[seed error: quota]"


@pytest.mark.asyncio
async def test_auto_mode_falls_back_on_typed_provider_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def marked_run(self, messages, **kwargs):
        self.calls.append(self.model_id)
        if self.model_id == "seed":
            return (
                mark_provider_failure(
                    "[seed error: RateLimitError]", "seed-provider", RuntimeError("quota")
                ),
                {"input_tokens": 1},
            )
        self.provider_id = "fallback-provider"
        return "ok", {"input_tokens": 1, "output_tokens": 1}

    monkeypatch.setattr(_FakeInstance, "run", marked_run)
    content, usage, provider = await work_harness.run_single_turn(
        model_id="seed",
        messages=[{"role": "user", "content": "continue"}],
        user_id="u1",
        system_prompt=None,
        pin_requested_provider=False,
        use_tools=True,
    )
    assert content == "ok"
    assert provider == "fallback-provider"
    assert _FakeInstance.calls == ["seed", "fallback"]
    assert usage["harness"]["fallback_count"] == 1


@pytest.mark.asyncio
async def test_auto_mode_falls_back_on_preflight_failure() -> None:
    _FakeInstance.failures["seed"] = RuntimeError(
        "seed-provider unavailable: env var SEED_API_KEY is not set"
    )
    content, usage, provider = await work_harness.run_single_turn(
        model_id="seed",
        messages=[{"role": "user", "content": "continue"}],
        user_id="u1",
        system_prompt=None,
        pin_requested_provider=False,
        use_tools=True,
    )
    assert content == "ok"
    assert provider == "fallback-provider"
    assert _FakeInstance.calls == ["seed", "fallback"]
    assert usage["harness"]["fallback_count"] == 1


@pytest.mark.asyncio
async def test_explicit_pin_never_falls_back() -> None:
    _FakeInstance.failures["seed"] = RuntimeError(
        "seed-provider unavailable: env var SEED_API_KEY is not set"
    )
    with pytest.raises(RuntimeError, match="unavailable"):
        await work_harness.run_single_turn(
            model_id="seed",
            messages=[{"role": "user", "content": "continue"}],
            user_id="u1",
            system_prompt=None,
            pin_requested_provider=True,
            use_tools=False,
        )
    assert _FakeInstance.calls == ["seed"]


@pytest.mark.asyncio
async def test_agentic_transient_failure_before_tools_can_fall_back() -> None:
    _FakeInstance.failures["seed"] = httpx.TimeoutException("timed out")
    content, usage, provider = await work_harness.run_single_turn(
        model_id="seed",
        messages=[{"role": "user", "content": "continue"}],
        user_id="u1",
        system_prompt=None,
        pin_requested_provider=False,
        use_tools=True,
    )
    assert content == "ok"
    assert provider == "fallback-provider"
    assert _FakeInstance.calls == ["seed", "fallback"]
    assert usage["harness"]["tool_executions"] == 0


@pytest.mark.asyncio
async def test_agentic_transient_failure_after_tool_boundary_is_not_replayed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def unsafe_run(self, messages, **kwargs):
        self.calls.append(self.model_id)
        work_harness.current_tool_executions.set(1)
        raise httpx.TimeoutException("timed out")

    monkeypatch.setattr(_FakeInstance, "run", unsafe_run)
    content, usage, provider = await work_harness.run_single_turn(
        model_id="seed",
        messages=[{"role": "user", "content": "continue"}],
        user_id="u1",
        system_prompt=None,
        pin_requested_provider=False,
        use_tools=True,
    )
    assert content.startswith("hmmm:")
    assert "may have mutated state" in content
    assert provider == "seed-provider"
    assert usage["harness"]["status"] == "hmmm"
    assert _FakeInstance.calls == ["seed"]
    assert work_harness.current_tool_executions.get() == 0


@pytest.mark.asyncio
async def test_tool_free_transient_failure_can_fall_back() -> None:
    _FakeInstance.failures["seed"] = httpx.TimeoutException("timed out")
    content, usage, provider = await work_harness.run_single_turn(
        model_id="seed",
        messages=[{"role": "user", "content": "continue"}],
        user_id="u1",
        system_prompt=None,
        pin_requested_provider=False,
        use_tools=False,
    )
    assert content == "ok"
    assert provider == "fallback-provider"
    assert usage["harness"]["fallback_count"] == 1
# 206:29 0:0 0:1
