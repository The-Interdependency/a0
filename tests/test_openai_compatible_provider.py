# 196:1 0:0 0:0
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
# 196:1 0:0 0:0
