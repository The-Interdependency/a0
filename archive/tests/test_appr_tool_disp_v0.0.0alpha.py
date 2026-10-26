# 185:1 0:0 0:0
"""Focused approval-dispatch and routed-owner regression witnesses."""
from pathlib import Path
import sys
from types import SimpleNamespace

import pytest


@pytest.mark.asyncio
async def test_scoped_tool_dispatch_requires_grant_or_cleared_gate(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from python.services import tool_executor
    from python.services.run_context import current_approval_gate_scopes
    from python.services.tool_executor import ToolApprovalRequired

    calls: list[tuple[str, dict]] = []

    async def fake_dispatch(name: str, **kwargs):
        calls.append((name, kwargs))
        return "mutated"

    monkeypatch.setattr(
        tool_executor, "_registry",
        lambda: {
            "github_write_file": SimpleNamespace(approval_scope="code_self_modify"),
            "post_tweet": SimpleNamespace(approval_scope="publish"),
        },
    )
    monkeypatch.setattr(tool_executor, "_registry_dispatch", fake_dispatch)
    tool_executor.set_approval_scope_user_id(None)
    with pytest.raises(ToolApprovalRequired, match="code_self_modify"):
        await tool_executor._execute_tool_inner("github_write_file", {"path": "README.md"})
    assert calls == []

    token = current_approval_gate_scopes.set(frozenset({"publish"}))
    try:
        with pytest.raises(ToolApprovalRequired, match="code_self_modify"):
            await tool_executor._execute_tool_inner("github_write_file", {})
        assert await tool_executor._execute_tool_inner("post_tweet", {}) == "mutated"
    finally:
        current_approval_gate_scopes.reset(token)

    token = current_approval_gate_scopes.set(frozenset({"code_self_modify"}))
    try:
        allowed = await tool_executor._execute_tool_inner(
            "github_write_file", {"path": "README.md"}
        )
    finally:
        current_approval_gate_scopes.reset(token)
    assert allowed == "mutated"
    assert calls == [
        ("post_tweet", {}),
        ("github_write_file", {"path": "README.md"}),
    ]


@pytest.mark.asyncio
async def test_scoped_tool_dispatch_accepts_persisted_user_scope(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from python.services import tool_executor

    async def fake_dispatch(name: str, **_kwargs):
        return name

    async def scopes(_user_id: str):
        return {"code_self_modify"}

    monkeypatch.setattr(
        tool_executor, "_registry",
        lambda: {"github_write_file": SimpleNamespace(approval_scope="code_self_modify")},
    )
    monkeypatch.setattr(tool_executor, "_registry_dispatch", fake_dispatch)
    monkeypatch.setitem(
        sys.modules, "python.storage",
        SimpleNamespace(storage=SimpleNamespace(get_approval_scope_names=scopes)),
    )
    tool_executor.set_approval_scope_user_id("user-1")
    try:
        result = await tool_executor._execute_tool_inner("github_write_file", {})
    finally:
        tool_executor.set_approval_scope_user_id(None)
    assert result == "github_write_file"


@pytest.mark.asyncio
async def test_multimodal_approval_text_uses_only_text_parts(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from python import logger
    from python.services import approval_gate_service

    async def noop(*_args, **_kwargs):
        return None

    monkeypatch.setattr(logger, "seed_openai_hmmm_if_empty", noop)
    route, pending = await approval_gate_service.approval_gate_result(
        [{"role": "user", "content": [
            {"type": "text", "text": "publish the release note"},
            {"type": "image_url", "image_url": {"url": "data:image/png;base64,AA=="}},
        ]}],
        user_id=None, skip_approval=True, provider_id="openai-5.5",
        model_id="gpt-5.5", reasoning_effort="low",
    )
    assert pending is None
    assert route["role"] == "perform"


@pytest.mark.asyncio
async def test_approval_gate_uses_only_latest_user_turn(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from python import logger
    from python.services import approval_gate_service

    async def noop(*_args, **_kwargs):
        return None

    monkeypatch.setattr(logger, "seed_openai_hmmm_if_empty", noop)
    route, pending = await approval_gate_service.approval_gate_result(
        [
            {"role": "user", "content": "publish the release"},
            {"role": "assistant", "content": "done"},
            {"role": "user", "content": "summarize the result"},
        ],
        user_id=None, skip_approval=False, provider_id="claude",
        model_id="claude-test", reasoning_effort=None,
    )
    assert route["requires_approval"] is False
    assert pending is None


@pytest.mark.asyncio
async def test_dispatch_denial_becomes_scope_bound_pending_gate(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from python import logger
    from python.services import approval_gate_service
    from python.services.run_context import current_approval_gate_scopes
    from python.services.tool_executor import ToolApprovalRequired

    async def noop(*_args, **_kwargs):
        return None

    async def denied_transport():
        assert current_approval_gate_scopes.get() == frozenset({"publish"})
        raise ToolApprovalRequired("github_write_file", "code_self_modify")

    monkeypatch.setattr(logger, "log_openai_event", noop)
    content, usage = await approval_gate_service.capture_tool_approval(
        denied_transport(),
        messages=[{"role": "user", "content": "Update README."}],
        provider_id="claude", model_id="claude-test", reasoning_effort=None,
        approved_tool_scopes=("publish",),
    )
    assert "APPROVAL REQUIRED" in content
    assert usage["approval_state"] == "pending"
    assert usage["approval_scopes"] == ["code_self_modify"]
    assert usage["approval_tool"] == "github_write_file"
    assert current_approval_gate_scopes.get() == frozenset()


@pytest.mark.asyncio
async def test_legacy_openai_route_transports_through_concrete_owner(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from python import logger
    from python.services import inference, openai_router
    from python.services.providers import openai_compatible_provider

    async def noop(*_args, **_kwargs):
        return None

    captured: dict = {}

    async def fake_call(messages, **kwargs):
        captured.update(kwargs)
        return "nano", {}

    def fake_build(messages, provider_id):
        captured["attachment_provider"] = provider_id
        return messages

    monkeypatch.setattr(logger, "seed_openai_hmmm_if_empty", noop)
    monkeypatch.setattr(logger, "log_openai_event", noop)
    monkeypatch.setattr(openai_router, "resolve_role", lambda _text: "record")
    monkeypatch.setattr(openai_compatible_provider, "call", fake_call)
    monkeypatch.setattr(inference, "_build_provider_messages", fake_build)
    monkeypatch.setenv("OPENAI_API_KEY", "test-secret")
    content, usage = await inference._call_openai_routed(
        [{"role": "user", "content": "classify this"}],
        use_tools=False, skip_approval=True, routed_user_tier="free",
    )
    assert content == "nano"
    assert captured["provider_id"] == "openai-nano"
    assert captured["attachment_provider"] == "openai-nano"
    assert captured["model_override"] == "gpt-5-nano"
    assert usage["provider_id"] == "openai-nano"


def test_pending_replay_pins_every_resolved_model() -> None:
    from python.services import approval_gate_service

    source = (
        Path(__file__).resolve().parents[1] / "python/routes/chat.py"
    ).read_text(encoding="utf-8")
    assert "approval_gate_service.pending_gate_entry" in source
    assert 'approved_tool_scopes=pending.get("approval_scopes")' in source
    entry = approval_gate_service.pending_gate_entry(
        {
            "gate_id": "gate-test", "provider_id": "deepseek",
            "model_id": "deepseek-v4-pro", "approval_scopes": ["publish"],
            "approval_tool": "post_tweet",
        },
        history=[], system_prompt=None, provider_id="seed", uid="user-1",
        enabled_tools=["post_tweet"],
    )
    assert entry["pin_requested_provider"] is True
    assert entry["model_override"] == "deepseek-v4-pro"
    assert entry["approval_scopes"] == ["publish"]
    assert entry["approval_tool"] == "post_tweet"
# 185:1 0:0 0:0
