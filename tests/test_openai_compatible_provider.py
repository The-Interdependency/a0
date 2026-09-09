# 369:1 0:0 0:0
"""Contract tests for registry-driven OpenAI-compatible providers."""

from pathlib import Path
from types import SimpleNamespace

import pytest


class _Dump:
    def __init__(self, data: dict, output_text: str = "") -> None:
        self._data = data
        self.output_text = output_text

    def model_dump(self) -> dict:
        return self._data


def _clear_provider_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    from python.services.energy_registry import BUILTIN_PROVIDERS

    for spec in BUILTIN_PROVIDERS.values():
        api_key_env = spec.get("api_key_env")
        if api_key_env:
            monkeypatch.delenv(api_key_env, raising=False)


def test_repeat_fingerprint_excludes_volatile_transport_ids() -> None:
    from python.services.inference import _canonical_tool_calls

    first = [{
        "type": "function_call",
        "name": "sys.pwd",
        "arguments": '{"depth": 1}',
        "call_id": "call-first",
        "id": "item-first",
    }]
    repeated = [{
        "type": "function_call",
        "name": "sys.pwd",
        "arguments": '{"depth":1}',
        "call_id": "call-second",
        "id": "item-second",
    }]

    assert _canonical_tool_calls(first) == _canonical_tool_calls(repeated)


def test_deepseek_is_configuration_not_a_provider_specific_adapter() -> None:
    from python.services.energy_registry import BUILTIN_PROVIDERS

    root = Path(__file__).resolve().parents[1]
    assert not (root / "python/services/providers/deepseek_provider.py").exists()

    flash = BUILTIN_PROVIDERS["deepseek"]
    pro = BUILTIN_PROVIDERS["deepseek-pro"]
    assert flash["adapter"] == pro["adapter"] == "openai-compatible"
    assert flash["base_url"] == pro["base_url"] == "https://api.deepseek.com"
    assert flash["api_key_env"] == pro["api_key_env"] == "DEEPSEEK_API_KEY"
    assert flash["model"] == "deepseek-v4-flash"
    assert pro["model"] == "deepseek-v4-pro"

    registry_text = (root / "python/config/providers.json").read_text(encoding="utf-8")
    assert "deepseek-chat" not in registry_text
    assert "deepseek-reasoner" not in registry_text


@pytest.mark.asyncio
async def test_responses_transport_uses_registry_base_url_model_and_effort(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from python.services.providers import openai_compatible_provider as provider

    captured: dict = {"requests": []}

    class FakeAsyncOpenAI:
        def __init__(self, **kwargs):
            captured["client"] = kwargs

            async def create(**request):
                captured["requests"].append(request)
                return _Dump({
                    "output": [{
                        "type": "message",
                        "content": [{"type": "output_text", "text": "ok"}],
                    }],
                    "usage": {"input_tokens": 2, "output_tokens": 1},
                })

            self.responses = SimpleNamespace(create=create)

    monkeypatch.setattr(provider, "AsyncOpenAI", FakeAsyncOpenAI)
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-secret")

    content, usage = await provider.call(
        [{"role": "user", "content": "hi"}],
        provider_id="deepseek-pro",
        use_tools=False,
        reasoning_effort="medium",
    )

    assert content == "ok"
    assert usage == {"input_tokens": 2, "output_tokens": 1}
    assert captured["client"] == {
        "api_key": "test-secret",
        "base_url": "https://api.deepseek.com",
    }
    request = captured["requests"][0]
    assert request["model"] == "deepseek-v4-pro"
    assert request["reasoning"] == {"effort": "high"}
    assert "store" not in request
    assert "tools" not in request


@pytest.mark.asyncio
async def test_dispatcher_primary_placeholder_still_honors_model_env_override(
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
                        "content": [{"type": "output_text", "text": "override-ok"}],
                    }],
                    "usage": {},
                })

            self.responses = SimpleNamespace(create=create)

    monkeypatch.setattr(provider, "AsyncOpenAI", FakeAsyncOpenAI)
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-secret")
    monkeypatch.setenv("DEEPSEEK_MODEL_CONDUCT", "deepseek-v4-flash-override")

    content, _ = await provider.call(
        [{"role": "user", "content": "hi"}],
        provider_id="deepseek",
        role="conduct",
        model_override="deepseek-v4-flash",
        use_tools=False,
    )

    assert content == "override-ok"
    assert captured["model"] == "deepseek-v4-flash-override"


@pytest.mark.asyncio
async def test_first_responses_tool_call_executes_before_repeat_detection(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from python.services import tool_executor
    from python.services.providers import openai_compatible_provider as provider

    responses: list[dict] = []
    executed: list[tuple[str, dict]] = []

    class FakeAsyncOpenAI:
        def __init__(self, **kwargs):
            async def create(**request):
                responses.append(request)
                if len(responses) == 1:
                    return _Dump({
                        "output": [{
                            "type": "function_call",
                            "name": "sys.pwd",
                            "arguments": "{}",
                            "call_id": "call-1",
                        }],
                        "usage": {},
                    })
                return _Dump({
                    "output": [{
                        "type": "message",
                        "content": [{"type": "output_text", "text": "tool-ok"}],
                    }],
                    "usage": {},
                })

            self.responses = SimpleNamespace(create=create)

    async def fake_execute(name: str, arguments: dict) -> str:
        executed.append((name, arguments))
        return "pwd-ok"

    monkeypatch.setattr(provider, "AsyncOpenAI", FakeAsyncOpenAI)
    monkeypatch.setattr(provider, "_response_tools", lambda profile: [{"type": "function", "name": "sys.pwd"}])
    monkeypatch.setattr(tool_executor, "execute_tool", fake_execute)
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-secret")

    content, _ = await provider.call(
        [{"role": "user", "content": "use a tool"}],
        provider_id="deepseek",
        use_tools=True,
    )

    assert content == "tool-ok"
    assert executed == [("sys.pwd", {})]
    assert len(responses) == 2


@pytest.mark.asyncio
async def test_repeated_responses_tool_call_with_new_ids_executes_once(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from python.services import tool_executor
    from python.services.providers import openai_compatible_provider as provider

    responses: list[dict] = []
    executed: list[tuple[str, dict]] = []

    class FakeAsyncOpenAI:
        def __init__(self, **kwargs):
            async def create(**request):
                responses.append(request)
                call_number = len(responses)
                return _Dump({
                    "output": [{
                        "type": "function_call",
                        "name": "sys.pwd",
                        "arguments": "{}",
                        "call_id": f"call-{call_number}",
                        "id": f"item-{call_number}",
                    }],
                    "usage": {},
                })

            self.responses = SimpleNamespace(create=create)

    async def fake_execute(name: str, arguments: dict) -> str:
        executed.append((name, arguments))
        return "pwd-ok"

    monkeypatch.setattr(provider, "AsyncOpenAI", FakeAsyncOpenAI)
    monkeypatch.setattr(
        provider,
        "_response_tools",
        lambda profile: [{"type": "function", "name": "sys.pwd"}],
    )
    monkeypatch.setattr(tool_executor, "execute_tool", fake_execute)
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-secret")

    content, _ = await provider.call(
        [{"role": "user", "content": "repeat a tool"}],
        provider_id="deepseek",
        use_tools=True,
    )

    assert content == "[noticed repeat tool call — answering directly]"
    assert executed == [("sys.pwd", {})]
    assert len(responses) == 2


@pytest.mark.asyncio
async def test_generic_transport_supports_chat_completions(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from python.services.energy_registry import BUILTIN_PROVIDERS
    from python.services.providers import openai_compatible_provider as provider

    captured: dict = {}

    class FakeAsyncOpenAI:
        def __init__(self, **kwargs):
            captured["client"] = kwargs

            async def create(**request):
                captured["request"] = request
                return _Dump({
                    "choices": [{"message": {"content": "chat-ok"}}],
                    "usage": {"prompt_tokens": 2, "completion_tokens": 1},
                })

            self.chat = SimpleNamespace(completions=SimpleNamespace(create=create))

    spec = {
        "id": "compatible-chat-test",
        "model": "compatible-model",
        "adapter": "openai-compatible",
        "vendor": "openai-compatible",
        "base_url": "https://compatible.invalid/v1",
        "api_key_env": "COMPATIBLE_TEST_KEY",
        "api_family": "chat_completions",
        "supports_reasoning_effort": True,
        "reasoning_efforts": ["low", "high"],
        "default_reasoning_effort": "low",
    }
    monkeypatch.setitem(BUILTIN_PROVIDERS, spec["id"], spec)
    monkeypatch.setattr(provider, "AsyncOpenAI", FakeAsyncOpenAI)
    monkeypatch.setenv("COMPATIBLE_TEST_KEY", "test-secret")

    content, usage = await provider.call(
        [{"role": "user", "content": "hi"}],
        provider_id=spec["id"],
        use_tools=False,
    )

    assert content == "chat-ok"
    assert usage["completion_tokens"] == 1
    assert captured["client"]["base_url"] == "https://compatible.invalid/v1"
    assert captured["request"]["model"] == "compatible-model"
    assert captured["request"]["reasoning_effort"] == "low"


@pytest.mark.asyncio
async def test_transport_redacts_configured_key_from_outward_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from python.services.providers import openai_compatible_provider as provider

    class FailingAsyncOpenAI:
        def __init__(self, **kwargs):
            async def create(**request):
                raise RuntimeError("upstream echoed witness-secret")

            self.responses = SimpleNamespace(create=create)

    monkeypatch.setattr(provider, "AsyncOpenAI", FailingAsyncOpenAI)
    monkeypatch.setenv("DEEPSEEK_API_KEY", "witness-secret")
    content, usage = await provider.call(
        [{"role": "user", "content": "hi"}],
        provider_id="deepseek",
        use_tools=False,
    )

    assert "witness-secret" not in content
    assert "[redacted]" in content
    assert usage == {}


@pytest.mark.asyncio
async def test_transport_redacts_opaque_key_before_error_truncation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from python.services.providers import openai_compatible_provider as provider

    api_key = "opaque-provider-key-abcdefghijklmnopqrstuvwxyz"

    class FailingAsyncOpenAI:
        def __init__(self, **kwargs):
            async def create(**request):
                raise RuntimeError("x" * 180 + api_key + " tail")

            self.responses = SimpleNamespace(create=create)

    monkeypatch.setattr(provider, "AsyncOpenAI", FailingAsyncOpenAI)
    monkeypatch.setenv("DEEPSEEK_API_KEY", api_key)
    content, _ = await provider.call(
        [{"role": "user", "content": "hi"}],
        provider_id="deepseek",
        use_tools=False,
    )

    assert api_key not in content
    assert api_key[:20] not in content
    assert "[redacted]" in content


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

    monkeypatch.setattr(openai_provider, "_compatible_call", fake_compatible_call)
    content, usage = await openai_provider.call(
        [{"role": "user", "content": "hi"}],
        api_key="test-openai",
        model_override="gpt-test",
        reasoning_effort="high",
        store=True,
    )

    assert (content, usage) == ("openai-ok", {})
    assert captured["provider_id"] == "openai"
    assert captured["reasoning_effort"] == "high"
    assert captured["store"] is True


@pytest.mark.asyncio
async def test_inference_dispatches_adapter_field_without_database(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from python.services import inference
    from python.services.providers import openai_compatible_provider as provider

    _clear_provider_keys(monkeypatch)
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-secret")
    monkeypatch.delenv("DATABASE_URL", raising=False)
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
    assert usage == {"total_tokens": 1}
    assert captured["provider_id"] == "deepseek"
    assert captured["model_override"] == "deepseek-v4-flash"


@pytest.mark.asyncio
async def test_catalog_resolver_pricing_and_missing_key_are_fail_closed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from python.services.energy_registry import estimate_cost, get_model_pricing
    from python.services.model_catalog import resolve_model_id
    from python.services.providers import openai_compatible_provider as provider

    _clear_provider_keys(monkeypatch)
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
# 369:1 0:0 0:0
