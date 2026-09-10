# 398:1 0:0 0:0
"""Routing and catalog tests for registry-driven compatible providers."""

import ast
from pathlib import Path
from types import SimpleNamespace

import pytest


class _Dump:
    def __init__(self, data: dict) -> None:
        self._data = data
        self.output_text = ""

    def model_dump(self) -> dict:
        return self._data


def _clear_provider_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    from python.services.energy_registry import BUILTIN_PROVIDERS

    for spec in BUILTIN_PROVIDERS.values():
        api_key_env = spec.get("api_key_env")
        if api_key_env:
            monkeypatch.delenv(api_key_env, raising=False)


def test_cheap_provider_prefers_deepseek_before_expensive_fallback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from python.services.energy_registry import cheap_provider

    _clear_provider_keys(monkeypatch)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "expensive-secret")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "cheap-secret")

    assert cheap_provider() == "deepseek"


def test_approval_replays_preserve_explicit_provider_pin() -> None:
    root = Path(__file__).resolve().parents[1]
    tree = ast.parse((root / "python/routes/chat.py").read_text(encoding="utf-8"))
    replay_calls = [
        node
        for node in ast.walk(tree)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id == "call_provider"
    ]
    assert len(replay_calls) == 2
    assert all(
        any(keyword.arg == "pin_requested_provider" for keyword in call.keywords)
        for call in replay_calls
    )
    assert all(
        any(keyword.arg == "model_override" for keyword in call.keywords)
        for call in replay_calls
    )

    instance_runs = [
        node
        for node in ast.walk(tree)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr == "run"
    ]
    assert any(
        any(keyword.arg == "pin_requested_provider" for keyword in call.keywords)
        for call in instance_runs
    )

    pending_writes = [
        node
        for node in ast.walk(tree)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id == "_store_pending_gate"
    ]
    declared_pending_writes = [
        call for call in pending_writes
        if isinstance(call.args[1], ast.Call)
        and isinstance(call.args[1].func, ast.Attribute)
        and call.args[1].func.attr == "pending_gate_entry"
    ]
    assert len(declared_pending_writes) == 3


def test_chat_routed_tier_denial_is_a_clean_403() -> None:
    root = Path(__file__).resolve().parents[1]
    source = (root / "python/routes/chat.py").read_text(encoding="utf-8")
    assert "except PermissionError as exc:" in source
    assert "DELETE FROM messages " in source
    assert "HTTPException(status_code=403, detail=str(exc))" in source


@pytest.mark.asyncio
async def test_call_model_leaves_auto_selected_provider_unpinned(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from python.services import call_fn

    async def resolve_model_id(model_id: str):
        assert model_id == "auto-seed"
        return "deepseek", {}

    captured: dict = {}

    async def call_provider(**kwargs):
        captured.update(kwargs)
        return "routed", {}

    monkeypatch.setattr(call_fn, "resolve_model_id", resolve_model_id)
    monkeypatch.setattr(call_fn, "call_provider", call_provider)

    content, _ = await call_fn.call_model(
        "auto-seed",
        [{"role": "user", "content": "practice this"}],
        enforce_tier=False,
        enforce_enabled=False,
        pin_requested_provider=False,
    )

    assert content == "routed"
    assert captured["pin_requested_provider"] is False


@pytest.mark.asyncio
async def test_auto_role_route_reapplies_tier_and_reports_effective_provider(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from python.services import inference, openai_router
    from python.services.providers import openai_compatible_provider as provider

    async def practice_slot(_slot: str):
        return "practice-memory", "deepseek-pro"

    async def no_memory(_provider_id: str):
        return ""

    monkeypatch.setattr(openai_router, "resolve_role", lambda _text: "practice")
    monkeypatch.setattr(inference, "_slot_routing_info", practice_slot)
    monkeypatch.setattr(inference, "_instance_memory_block", no_memory)

    with pytest.raises(PermissionError, match="requires tier 'ws'"):
        await inference.call_provider(
            "deepseek",
            [{"role": "user", "content": "practice this"}],
            use_tools=False,
            routed_user_tier="free",
        )

    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-secret")

    async def fake_call(messages, **kwargs):
        return "role-routed", {"total_tokens": 1}

    monkeypatch.setattr(provider, "call", fake_call)
    content, usage = await inference.call_provider(
        "deepseek",
        [{"role": "user", "content": "practice this"}],
        use_tools=False,
        routed_user_tier="ws",
    )

    assert content == "role-routed"
    assert usage["provider_id"] == "deepseek-pro"


@pytest.mark.asyncio
async def test_role_model_override_uses_concrete_owner_tier_and_provenance(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from python.services import inference, openai_router
    from python.services.providers import openai_compatible_provider as provider

    async def no_slot(_slot: str):
        return "", None

    async def no_memory(_provider_id: str):
        return ""

    monkeypatch.setattr(openai_router, "resolve_role", lambda _text: "practice")
    monkeypatch.setattr(inference, "_slot_routing_info", no_slot)
    monkeypatch.setattr(inference, "_instance_memory_block", no_memory)
    monkeypatch.setenv("DEEPSEEK_MODEL_PRACTICE", "deepseek-v4-pro")

    with pytest.raises(PermissionError, match="deepseek-v4-pro.*tier 'ws'"):
        await inference.call_provider(
            "deepseek",
            [{"role": "user", "content": "practice this"}],
            use_tools=False,
            routed_user_tier="free",
        )

    captured: dict = {}
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-secret")

    async def fake_call(messages, **kwargs):
        captured.update(kwargs)
        return "pro-routed", {"total_tokens": 1}

    monkeypatch.setattr(provider, "call", fake_call)
    content, usage = await inference.call_provider(
        "deepseek",
        [{"role": "user", "content": "practice this"}],
        use_tools=False,
        routed_user_tier="ws",
    )

    assert content == "pro-routed"
    assert captured["provider_id"] == "deepseek-pro"
    assert captured["model_override"] == "deepseek-v4-pro"
    assert captured["pin_model_override"] is True
    assert usage["provider_id"] == "deepseek-pro"
    assert usage["model_id"] == "deepseek-v4-pro"


@pytest.mark.asyncio
async def test_agent_instance_caches_effective_routed_provider(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from python.services import agent_instance

    async def fake_call_model(*args, **kwargs):
        return "role-routed", {"provider_id": "deepseek-pro"}

    monkeypatch.setattr(agent_instance, "call_model", fake_call_model)
    instance = agent_instance.AgentInstance(model_id="deepseek-v4-flash")

    await instance.run(
        [{"role": "user", "content": "practice this"}],
        pin_requested_provider=False,
    )

    assert instance.provider_id == "deepseek-pro"


@pytest.mark.asyncio
async def test_explicit_openai_model_reaches_legacy_routed_branch(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from python.services import call_fn, inference

    captured: dict = {}

    async def no_memory(_provider_id: str):
        return ""

    async def fake_openai_routed(messages, system_prompt=None, **kwargs):
        captured.update(kwargs)
        return "pinned-openai", {}

    monkeypatch.setattr(inference, "_instance_memory_block", no_memory)
    monkeypatch.setattr(inference, "_call_openai_routed", fake_openai_routed)
    content, usage = await call_fn.call_model(
        "gpt-5-mini",
        [{"role": "user", "content": "hi"}],
        enforce_tier=False,
        enforce_enabled=False,
        use_tools=False,
    )

    assert content == "pinned-openai"
    assert captured["model_override"] == "gpt-5-mini"
    assert usage["provider_id"] == "openai"


@pytest.mark.asyncio
async def test_free_catalog_does_not_surface_cross_tier_deepseek_pro(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from python.services import energy_registry, model_catalog

    async def free_tier(user_id):
        return "free"

    async def active_provider():
        return "deepseek"

    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-secret")
    monkeypatch.setattr(model_catalog, "_user_tier", free_tier)
    monkeypatch.setattr(energy_registry, "active_provider", active_provider)

    catalog = await model_catalog.list_models_for_user(None)
    flash = next(item for item in catalog["providers"] if item["provider_id"] == "deepseek")
    pro = next(item for item in catalog["providers"] if item["provider_id"] == "deepseek-pro")

    assert "deepseek-v4-pro" not in {item["model_id"] for item in flash["models"]}
    assert pro["tier_blocked"] is True


@pytest.mark.asyncio
async def test_openai_wrapper_preserves_reasoning_and_store_contract(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from python.services.providers import openai_provider

    captured: dict = {}

    async def fake_compatible_call(messages, **kwargs):
        captured.update(kwargs)
        return "openai-ok", {}

    monkeypatch.setattr(
        openai_provider.openai_compatible_provider, "call", fake_compatible_call
    )
    content, usage = await openai_provider.call(
        [{"role": "user", "content": "hi"}],
        api_key="test-openai",
        model_override="gpt-test",
        reasoning_effort="high",
        store=True,
        pin_model_override=True,
    )

    assert (content, usage) == ("openai-ok", {})
    assert captured["provider_id"] == "openai"
    assert captured["reasoning_effort"] == "high"
    assert captured["store"] is True
    assert captured["pin_model_override"] is True


@pytest.mark.asyncio
async def test_inference_dispatches_adapter_field_without_database(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from python.services import inference, openai_router
    from python.services.providers import openai_compatible_provider as provider

    _clear_provider_keys(monkeypatch)
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-secret")
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setattr(openai_router, "resolve_role", lambda _text: "practice")
    captured: dict = {}

    async def fake_call(messages, **kwargs):
        captured.update(kwargs)
        return "routed", {"total_tokens": 1}

    monkeypatch.setattr(provider, "call", fake_call)
    content, usage = await inference.call_provider(
        "deepseek",
        [{"role": "user", "content": "hi"}],
        max_tokens=8,
        use_tools=False,
        skip_manifest=True,
    )

    assert content == "routed"
    assert usage == {
        "total_tokens": 1,
        "provider_id": "deepseek",
        "model_id": "deepseek-v4-flash",
    }
    assert captured["provider_id"] == "deepseek"
    assert captured["model_override"] == "deepseek-v4-flash"
    assert captured["role"] == "practice"


@pytest.mark.asyncio
async def test_fanout_bridge_pins_each_requested_provider(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from python.services import energy_registry, inference, openai_router
    from python.services.providers import openai_compatible_provider as provider

    _clear_provider_keys(monkeypatch)
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-secret")
    monkeypatch.setattr(openai_router, "resolve_role", lambda _text: "practice")

    async def conflicting_slot(_slot: str) -> tuple[str, str]:
        return "wrong-slot-memory", "openai"

    async def selected_memory(provider_id: str) -> str:
        assert provider_id == "deepseek-pro"
        return "selected-provider-memory"

    captured: dict = {}

    async def fake_call(messages, **kwargs):
        captured["messages"] = messages
        captured.update(kwargs)
        return "fanout-ok", {}

    monkeypatch.setattr(inference, "_slot_routing_info", conflicting_slot)
    monkeypatch.setattr(inference, "_instance_memory_block", selected_memory)
    monkeypatch.setattr(provider, "call", fake_call)

    content = await energy_registry._aimmh_call_fn(
        "deepseek-pro",
        [{"role": "user", "content": "practice this"}],
    )

    assert content == "fanout-ok"
    assert captured["provider_id"] == "deepseek-pro"
    system_text = captured["messages"][0]["content"]
    assert "selected-provider-memory" in system_text
    assert "wrong-slot-memory" not in system_text


@pytest.mark.asyncio
async def test_call_model_pins_the_explicit_model_provider(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from python.services import call_fn, inference, openai_router
    from python.services.providers import openai_compatible_provider as provider

    _clear_provider_keys(monkeypatch)
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-secret")
    monkeypatch.setattr(openai_router, "resolve_role", lambda _text: "practice")

    async def conflicting_slot(_slot: str) -> tuple[str, str]:
        return "wrong-slot-memory", "deepseek-pro"

    async def selected_memory(provider_id: str) -> str:
        assert provider_id == "deepseek"
        return "flash-memory"

    captured: dict = {}

    async def fake_call(messages, **kwargs):
        captured["messages"] = messages
        captured.update(kwargs)
        return "single-ok", {}

    monkeypatch.setattr(inference, "_slot_routing_info", conflicting_slot)
    monkeypatch.setattr(inference, "_instance_memory_block", selected_memory)
    monkeypatch.setattr(provider, "call", fake_call)

    content, _ = await call_fn.call_model(
        "deepseek-v4-flash",
        [{"role": "user", "content": "practice this"}],
        enforce_tier=False,
        enforce_enabled=False,
    )

    assert content == "single-ok"
    assert captured["provider_id"] == "deepseek"
    assert captured["pin_model_override"] is True
    system_text = captured["messages"][0]["content"]
    assert "flash-memory" in system_text
    assert "wrong-slot-memory" not in system_text


@pytest.mark.asyncio
async def test_explicit_model_pin_ignores_cross_tier_role_override(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from python.services.providers import openai_compatible_provider as provider

    captured: dict = {}

    class FakeAsyncOpenAI:
        def __init__(self, **kwargs):
            async def create(**request):
                captured.update(request)
                return _Dump({
                    "output": [{
                        "type": "message",
                        "content": [{"type": "output_text", "text": "pinned"}],
                    }],
                    "usage": {},
                })

            self.responses = SimpleNamespace(create=create)

    monkeypatch.setattr(provider, "AsyncOpenAI", FakeAsyncOpenAI)
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-secret")
    monkeypatch.setenv("DEEPSEEK_MODEL_PRACTICE", "deepseek-v4-pro")

    content, _ = await provider.call(
        [{"role": "user", "content": "practice this"}],
        provider_id="deepseek",
        role="practice",
        model_override="deepseek-v4-flash",
        pin_model_override=True,
        use_tools=False,
    )

    assert content == "pinned"
    assert captured["model"] == "deepseek-v4-flash"


@pytest.mark.asyncio
async def test_catalog_resolver_pricing_and_missing_key_are_fail_closed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from python.services.energy_registry import estimate_cost, get_model_pricing
    from python.services.model_catalog import resolve_model_id, routed_model_owner
    from python.services.openai_router import make_call_config
    from python.services.providers import openai_compatible_provider as provider

    _clear_provider_keys(monkeypatch)
    assert routed_model_owner(make_call_config("practice")["model"], "openai", "free") == "openai"
    assert routed_model_owner(make_call_config("record")["model"], "openai", "free") == "openai-nano"
    provider_id, spec = await resolve_model_id("deepseek-v4-pro")
    assert provider_id == "deepseek-pro"
    assert spec["model"] == "deepseek-v4-pro"
    assert get_model_pricing("deepseek", "deepseek-v4-flash")["input_per_1m"] == 0.44
    assert estimate_cost(
        "deepseek", 1_000_000, 1_000_000, model="deepseek-v4-flash"
    ) == pytest.approx(1.76)

    with pytest.raises(ValueError, match="DEEPSEEK_API_KEY not configured"):
        await provider.call(
            [{"role": "user", "content": "hi"}],
            provider_id="deepseek",
            use_tools=False,
        )
# 398:1 0:0 0:0
