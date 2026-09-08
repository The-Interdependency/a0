# 63:10 0:0 0:0
"""Executable msdmd witness for the generic provider boundary."""

# === CHECKS ===
# id: check_openai_compatible_registry_wiring
#   proves: openai_compatible_registry_driven, a0_provider_selection, a0_openai_compatible_completion
#   call: self::check_openai_compatible_registry_wiring
#   requires: python3
#   timeout: 20
#   mutates: none
#   cleanup: none
# === END CHECKS ===

import asyncio
import os
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


class _Response:
    output_text = "witness-ok"

    def model_dump(self) -> dict:
        return {
            "output": [{
                "type": "message",
                "content": [{"type": "output_text", "text": "witness-ok"}],
            }],
            "usage": {"input_tokens": 1, "output_tokens": 1},
        }


def check_openai_compatible_registry_wiring() -> None:
    from a0.adapters import openai_compatible_adapter as standalone_adapter
    from a0.provider_registry import resolve_openai_compatible_provider
    from python.services.providers import openai_compatible_provider as service_adapter

    root = Path(__file__).resolve().parents[2]
    registry_text = (root / "python/config/providers.json").read_text(encoding="utf-8")
    assert "deepseek-v4-flash" in registry_text
    assert "deepseek-v4-pro" in registry_text
    assert "deepseek-chat" not in registry_text
    assert "deepseek-reasoner" not in registry_text
    assert not (root / "python/services/providers/deepseek_provider.py").exists()

    captured: dict = {}

    class FakeSyncOpenAI:
        def __init__(self, **kwargs):
            captured["sync_client"] = kwargs
            self.responses = SimpleNamespace(create=lambda **request: _Response())

    class FakeAsyncOpenAI:
        def __init__(self, **kwargs):
            captured["async_client"] = kwargs

            async def create(**request):
                captured["async_request"] = request
                return _Response()

            self.responses = SimpleNamespace(create=create)

    environment = {"DEEPSEEK_API_KEY": "witness-secret", "A0_PROVIDER": "deepseek-pro"}
    with patch.dict(os.environ, environment, clear=False):
        provider_id, spec = resolve_openai_compatible_provider()
        assert provider_id == "deepseek-pro"
        with patch.object(standalone_adapter, "OpenAI", FakeSyncOpenAI):
            result = standalone_adapter.OpenAICompatibleAdapter(provider_id, spec).complete(
                [{"role": "user", "content": "hi"}]
            )
        assert result["text"] == "witness-ok"
        assert "witness-secret" not in repr(result)

        async def run_service_call():
            return await service_adapter.call(
                [{"role": "user", "content": "hi"}],
                provider_id="deepseek-pro",
                use_tools=False,
            )

        with patch.object(service_adapter, "AsyncOpenAI", FakeAsyncOpenAI):
            content, usage = asyncio.run(run_service_call())

    assert content == "witness-ok"
    assert usage["output_tokens"] == 1
    assert captured["sync_client"]["base_url"] == "https://api.deepseek.com"
    assert captured["async_client"]["base_url"] == "https://api.deepseek.com"
    assert captured["async_request"]["model"] == "deepseek-v4-pro"


def test_openai_compatible_registry_wiring() -> None:
    check_openai_compatible_registry_wiring()
# 63:10 0:0 0:0
