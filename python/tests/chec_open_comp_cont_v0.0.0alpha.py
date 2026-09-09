# 101:19 0:0 0:0
"""Executable msdmd witness for the generic provider boundary."""

# === CHECKS ===
# id: check_openai_compatible_registry_wiring
#   proves: openai_compatible_registry_driven, a0_provider_selection, a0_openai_compatible_completion
#   call: self::check_openai_compatible_registry_wiring
#   requires: python3
#   timeout: 20
#   mutates: none
#   cleanup: none
#
# id: check_openai_compatible_repair_regressions
#   proves: a0_openai_compatible_error_suppresses_secret_cause, a0_openai_compatible_store_defaults_off, call_fn_resolved_model_pins_provider, call_fn_auto_model_keeps_role_slot_routing, inference_tool_repeat_fingerprint_ignores_transport_ids, inference_compatible_provider_receives_classified_role, inference_fanout_preserves_requested_provider, openai_compatible_responses_preserves_reasoning_items, openai_stateless_reasoning_is_replayable, openai_compatible_caller_provider_is_scoped, cheap_provider_prefers_configured_low_cost_provider, chat_approval_replay_preserves_provider_pin
#   call: self::check_openai_compatible_repair_regressions
#   requires: python3, pytest
#   timeout: 60
#   mutates: none
#   cleanup: none
# === END CHECKS ===

import asyncio
import os
from pathlib import Path
import subprocess
import sys
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
    from a0 import resolve_openai_compatible_provider
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


def check_openai_compatible_repair_regressions() -> None:
    """Execute the focused pytest witnesses claimed by this CHECKS block."""

    root = Path(__file__).resolve().parents[2]
    provider_tests = "tests/test_open_comp_prov_v0.0.0alpha.py"
    routing_tests = "tests/test_open_comp_rout_v0.0.0alpha.py"
    adapter_tests = "tests/test_aone_open_comp_adap_v0.0.0alpha.py"
    nodes = [
        f"{provider_tests}::test_repeat_fingerprint_excludes_volatile_transport_ids",
        f"{provider_tests}::test_stateless_openai_reasoning_requests_encrypted_state",
        f"{provider_tests}::test_first_responses_tool_call_executes_before_repeat_detection",
        f"{provider_tests}::test_responses_transport_uses_registry_base_url_model_and_effort",
        f"{provider_tests}::test_transport_redacts_configured_key_from_outward_error",
        f"{routing_tests}::test_inference_dispatches_adapter_field_without_database",
        f"{routing_tests}::test_fanout_bridge_pins_each_requested_provider",
        f"{routing_tests}::test_call_model_pins_the_explicit_model_provider",
        f"{routing_tests}::test_explicit_model_pin_ignores_cross_tier_role_override",
        f"{routing_tests}::test_cheap_provider_prefers_deepseek_before_expensive_fallback",
        f"{routing_tests}::test_approval_replays_preserve_explicit_provider_pin",
        f"{routing_tests}::test_call_model_leaves_auto_selected_provider_unpinned",
        f"{adapter_tests}::test_adapter_uses_registry_transport_and_sanitizes_failure",
    ]
    environment = dict(os.environ)
    environment["PYTHONDONTWRITEBYTECODE"] = "1"
    subprocess.run(
        [
            sys.executable,
            "-m",
            "pytest",
            "-q",
            "-p",
            "no:cacheprovider",
            *nodes,
        ],
        cwd=root,
        env=environment,
        check=True,
    )


def test_openai_compatible_registry_wiring() -> None:
    check_openai_compatible_registry_wiring()
# 101:19 0:0 0:0
