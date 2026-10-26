# 187:1 0:0 0:0
"""Standalone a0 selection and OpenAI-compatible adapter contracts."""

from contextlib import asynccontextmanager
from pathlib import Path
import sys

from types import SimpleNamespace

import pytest

from a0.contract import A0Request


class _Dump:
    output_text = "standalone-ok"

    def model_dump(self) -> dict:
        return {"output": [], "usage": {"input_tokens": 1, "output_tokens": 1}}


def test_registry_auto_selects_flash_and_canonicalizes_legacy_pro_alias(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from a0 import resolve_openai_compatible_provider

    monkeypatch.delenv("A0_PROVIDER", raising=False)
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-secret")
    provider_id, spec = resolve_openai_compatible_provider()
    assert provider_id == "deepseek"
    assert spec["model"] == "deepseek-flash"
    assert spec["supports_vision"] is True

    monkeypatch.setenv("A0_PROVIDER", "deepseek-pro")
    provider_id, spec = resolve_openai_compatible_provider()
    assert provider_id == "deepseek"
    assert spec["model"] == "deepseek-flash"


@pytest.mark.asyncio
async def test_multi_provider_selection_canonicalizes_and_dedupes_aliases() -> None:
    from python.services.energy_registry import resolve_providers

    assert await resolve_providers(["deepseek-pro", "deepseek"]) == ["deepseek"]


def test_hidden_provider_aliases_are_omitted_from_registry_rosters() -> None:
    from python.services.energy_registry import BUILTIN_PROVIDERS
    from python.services.model_catalog import visible_provider_specs

    visible = visible_provider_specs(BUILTIN_PROVIDERS)
    assert "deepseek" in visible
    assert "deepseek-pro" not in visible
    source = (Path(__file__).parents[1] / "python/routes/instances_api.py").read_text()
    assert "providers = visible_provider_specs" in source


def test_responses_formatter_converts_chat_style_vision_parts() -> None:
    from python.services.providers.openai_compatible_provider import (
        _format_responses_messages,
    )

    messages = [{"role": "user", "content": [
        {"type": "text", "text": "inspect"},
        {"type": "image_url", "image_url": {"url": "data:image/png;base64,eA=="}},
    ]}]
    assert _format_responses_messages(messages)[0]["content"] == [
        {"type": "input_text", "text": "inspect"},
        {"type": "input_image", "image_url": "data:image/png;base64,eA=="},
    ]


@pytest.mark.asyncio
async def test_legacy_model_instance_memory_survives_canonical_routing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from python.services import inference

    calls: list[tuple[str, dict]] = []

    class Result:
        def __init__(self, *, first=None, rows=None):
            self._first = first
            self._rows = rows or []

        def mappings(self):
            return self

        def first(self):
            return self._first

        def all(self):
            return self._rows

    class Session:
        async def execute(self, statement, params):
            calls.append((str(statement), params))
            if len(calls) == 1:
                return Result(first={"id": "legacy", "swarm_context": "swarm"})
            return Result(rows=[{"tier": "seed", "content": "memory"}])

    @asynccontextmanager
    async def get_session():
        yield Session()

    monkeypatch.setitem(sys.modules, "python.database", SimpleNamespace(get_session=get_session))
    assert await inference._instance_memory_block("deepseek") == "swarm\n[SEED] memory"
    assert calls[0][1]["mid"] == "deepseek-flash"
    assert "deepseek-v4-pro" in calls[0][1]["mids"]
    assert "deepseek-pro" in calls[0][1]["mids"]


def test_edcm_slot_uses_catalog_alias_resolution() -> None:
    source = (Path(__file__).parents[1] / "python/services/edcm_explainer.py").read_text()
    assert "resolved_provider_id, _ = await resolve_model_id" in source


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
    assert result["raw"]["provider"] == "deepseek"
    assert "test-secret" not in repr(result)
    assert captured["client"] == {
        "api_key": "test-secret",
        "base_url": "https://api.deepseek.com",
    }
    assert captured["request"]["model"] == "deepseek-flash"
    assert captured["request"]["reasoning"] == {"effort": "high"}

    adapter.complete(
        [{"role": "user", "content": "disable thinking"}],
        reasoning_effort="none",
    )
    assert captured["request"]["reasoning"] == {"effort": "none"}

    def fail_with_secret(**request):
        raise RuntimeError("upstream echoed test-secret")

    adapter._client.responses.create = fail_with_secret
    with pytest.raises(RuntimeError, match="deepseek request failed") as caught:
        adapter.complete([{"role": "user", "content": "fail"}])
    assert caught.value.__cause__ is None
    assert "test-secret" not in str(caught.value)

    def value_error_with_secret(**request):
        raise ValueError("upstream echoed test-secret")

    adapter._client.responses.create = value_error_with_secret
    with pytest.raises(RuntimeError, match="deepseek request failed") as caught:
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

    monkeypatch.setenv("A0_PROVIDER", "openai-5.5-pro")
    provider_id, spec = resolve_openai_compatible_provider()
    pro_adapter = adapter_module.OpenAICompatibleAdapter(provider_id, spec)
    pro_adapter.complete([{"role": "user", "content": "use the configured floor"}])
    assert captured["request"]["reasoning"] == {"effort": "high"}


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
# 187:1 0:0 0:0
