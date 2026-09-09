# 116:1 0:0 0:0
"""Standalone a0 selection and OpenAI-compatible adapter contracts."""

from types import SimpleNamespace

import pytest

from a0.contract import A0Request


class _Dump:
    output_text = "standalone-ok"

    def model_dump(self) -> dict:
        return {"output": [], "usage": {"input_tokens": 1, "output_tokens": 1}}


def test_registry_auto_selects_flash_and_explicitly_selects_pro(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from a0 import resolve_openai_compatible_provider

    monkeypatch.delenv("A0_PROVIDER", raising=False)
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-secret")
    provider_id, spec = resolve_openai_compatible_provider()
    assert provider_id == "deepseek"
    assert spec["model"] == "deepseek-v4-flash"

    monkeypatch.setenv("A0_PROVIDER", "deepseek-pro")
    provider_id, spec = resolve_openai_compatible_provider()
    assert provider_id == "deepseek-pro"
    assert spec["model"] == "deepseek-v4-pro"


def test_explicit_unknown_and_noncompatible_provider_fail_closed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from a0 import resolve_openai_compatible_provider

    monkeypatch.setenv("A0_PROVIDER", "missing-provider")
    with pytest.raises(ValueError, match="Unknown A0_PROVIDER"):
        resolve_openai_compatible_provider()

    monkeypatch.setenv("A0_PROVIDER", "claude")
    with pytest.raises(ValueError, match="does not use the openai-compatible adapter"):
        resolve_openai_compatible_provider()


def test_adapter_uses_registry_transport_and_sanitizes_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from a0.adapters import openai_compatible_adapter as adapter_module
    from a0 import resolve_openai_compatible_provider

    captured: dict = {}

    class FakeOpenAI:
        def __init__(self, **kwargs):
            captured["client"] = kwargs

            def create(**request):
                captured["request"] = request
                return _Dump()

            self.responses = SimpleNamespace(create=create)

    monkeypatch.setattr(adapter_module, "OpenAI", FakeOpenAI)
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-secret")
    monkeypatch.setenv("A0_PROVIDER", "deepseek-pro")
    provider_id, spec = resolve_openai_compatible_provider()
    adapter = adapter_module.OpenAICompatibleAdapter(provider_id, spec)
    result = adapter.complete([{"role": "user", "content": "hi"}])

    assert result["text"] == "standalone-ok"
    assert result["raw"]["provider"] == "deepseek-pro"
    assert "test-secret" not in repr(result)
    assert captured["client"] == {
        "api_key": "test-secret",
        "base_url": "https://api.deepseek.com",
    }
    assert captured["request"]["model"] == "deepseek-v4-pro"
    assert captured["request"]["reasoning"] == {"effort": "high"}

    def fail_with_secret(**request):
        raise RuntimeError("upstream echoed test-secret")

    adapter._client.responses.create = fail_with_secret
    with pytest.raises(RuntimeError, match="deepseek-pro request failed") as caught:
        adapter.complete([{"role": "user", "content": "fail"}])
    assert caught.value.__cause__ is None
    assert "test-secret" not in str(caught.value)

    def value_error_with_secret(**request):
        raise ValueError("upstream echoed test-secret")

    adapter._client.responses.create = value_error_with_secret
    with pytest.raises(RuntimeError, match="deepseek-pro request failed") as caught:
        adapter.complete([{"role": "user", "content": "fail-value"}])
    assert caught.value.__cause__ is None
    assert "test-secret" not in str(caught.value)

    monkeypatch.setenv("OPENAI_API_KEY", "standalone-openai-secret")
    monkeypatch.setenv("A0_PROVIDER", "openai")
    provider_id, spec = resolve_openai_compatible_provider()
    openai_adapter = adapter_module.OpenAICompatibleAdapter(provider_id, spec)
    openai_adapter.complete([{"role": "user", "content": "private by default"}])
    assert captured["request"]["store"] is False
    openai_adapter.complete(
        [{"role": "user", "content": "explicit retention"}], store=True
    )
    assert captured["request"]["store"] is True

    monkeypatch.setenv("OPENAI_API_KEY", "openai-test-secret")
    monkeypatch.setenv("A0_PROVIDER", "openai")
    provider_id, spec = resolve_openai_compatible_provider()
    openai_adapter = adapter_module.OpenAICompatibleAdapter(provider_id, spec)
    openai_adapter.complete([{"role": "user", "content": "private by default"}])
    assert captured["request"]["store"] is False
    openai_adapter.complete(
        [{"role": "user", "content": "explicit storage"}], store=True
    )
    assert captured["request"]["store"] is True


def test_router_prefers_configured_generic_adapter(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from a0.adapters import openai_compatible_adapter as adapter_module
    from a0.router import _select_adapter

    class FakeOpenAI:
        def __init__(self, **kwargs):
            self.responses = SimpleNamespace(create=lambda **request: _Dump())

    monkeypatch.setattr(adapter_module, "OpenAI", FakeOpenAI)
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-secret")
    monkeypatch.delenv("A0_PROVIDER", raising=False)
    request = A0Request(task_id="adapter-select", input={"text": "hi"})

    selected = _select_adapter(request)
    assert isinstance(selected, adapter_module.OpenAICompatibleAdapter)
    assert selected.provider_id == "deepseek"


def test_explicit_provider_missing_key_fails_closed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from a0.router import _select_adapter

    monkeypatch.setenv("A0_PROVIDER", "deepseek-pro")
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    request = A0Request(task_id="missing-key", input={"text": "hi"})

    with pytest.raises(ValueError, match="DEEPSEEK_API_KEY not configured"):
        _select_adapter(request)
# 116:1 0:0 0:0
