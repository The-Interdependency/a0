import pytest


def _clear_provider_keys(monkeypatch):
    from python.services.energy_registry import BUILTIN_PROVIDERS

    for spec in BUILTIN_PROVIDERS.values():
        env_key = spec.get("env_key")
        if env_key:
            monkeypatch.delenv(env_key, raising=False)


def test_deepseek_is_default_when_key_is_present(monkeypatch):
    from python.services.energy_registry import (
        BUILTIN_PROVIDERS,
        cheap_provider,
        default_provider,
    )

    _clear_provider_keys(monkeypatch)
    monkeypatch.setenv("OPENAI_API_KEY", "test-openai")
    monkeypatch.setenv("XAI_API_KEY", "test-xai")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-deepseek")

    assert next(iter(BUILTIN_PROVIDERS)) == "deepseek"
    assert default_provider() == "deepseek"

    _clear_provider_keys(monkeypatch)
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-deepseek")
    assert cheap_provider() == "deepseek"


@pytest.mark.asyncio
async def test_deepseek_catalog_routing_and_pricing(monkeypatch):
    from python.services import call_fn
    from python.services.energy_registry import estimate_cost, get_model_pricing
    from python.services.model_catalog import list_models_for_user, resolve_model_id

    _clear_provider_keys(monkeypatch)
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-deepseek")

    catalog = await list_models_for_user(None)
    providers = {p["provider_id"]: p for p in catalog["providers"]}

    assert catalog["providers"][0]["provider_id"] == "deepseek"
    assert providers["deepseek"]["key_present"] is True
    assert providers["deepseek"]["models"][0]["model_id"] == "deepseek-v4-flash"
    assert providers["deepseek-pro"]["key_present"] is True
    assert providers["deepseek-pro"]["models"][0]["model_id"] == "deepseek-v4-pro"
    assert providers["deepseek-pro"]["tier_blocked"] is True

    provider_id, spec = await resolve_model_id("deepseek-v4-pro")
    assert provider_id == "deepseek-pro"
    assert spec["model"] == "deepseek-v4-pro"

    pricing = get_model_pricing("deepseek", "deepseek-v4-flash")
    assert pricing is not None
    assert pricing["input_per_1m"] == 0.44
    assert estimate_cost(
        "deepseek",
        1_000_000,
        1_000_000,
        model="deepseek-v4-flash",
    ) == pytest.approx(1.76)

    captured = {}

    async def fake_call_provider(**kwargs):
        captured.update(kwargs)
        return "ok", {}

    monkeypatch.setattr(call_fn, "call_provider", fake_call_provider)
    content, _usage = await call_fn.call_model(
        "deepseek-v4-pro",
        [{"role": "user", "content": "hi"}],
        enforce_tier=False,
    )
    assert content == "ok"
    assert captured["provider_id"] == "deepseek-pro"


@pytest.mark.asyncio
async def test_deepseek_role_override(monkeypatch):
    from python.services.providers._resolver import resolve_model_for_role

    _clear_provider_keys(monkeypatch)
    monkeypatch.setenv("DEEPSEEK_MODEL_CONDUCT", "deepseek-v4-pro")

    assert await resolve_model_for_role("deepseek", "conduct") == "deepseek-v4-pro"


@pytest.mark.asyncio
async def test_deepseek_provider_uses_responses_base_url(monkeypatch):
    from python.services.providers import deepseek_provider

    captured = {}

    async def fake_call_responses(**kwargs):
        captured.update(kwargs)
        return "ok", {"input_tokens": 1, "output_tokens": 1}

    monkeypatch.setattr(deepseek_provider, "_call_responses", fake_call_responses)
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-deepseek")

    content, usage = await deepseek_provider.call(
        [{"role": "user", "content": "hi"}],
        provider_id="deepseek-pro",
        model_override="deepseek-v4-pro",
        reasoning_effort="medium",
        use_tools=False,
    )

    assert content == "ok"
    assert usage == {"input_tokens": 1, "output_tokens": 1}
    assert captured["model"] == "deepseek-v4-pro"
    assert captured["base_url"] == "https://api.deepseek.com"
    assert captured["provider_name"] == "deepseek-pro"
    assert captured["reasoning_effort"] == "high"
    assert captured["use_tools"] is False
    assert all(tool["type"] == "function" for tool in captured["tools_override"])


@pytest.mark.asyncio
async def test_active_provider_no_database_url_fails_cleanly(monkeypatch):
    from python.services.energy_registry import active_provider

    monkeypatch.delenv("DATABASE_URL", raising=False)

    with pytest.raises(RuntimeError, match="No instantiation selected"):
        await active_provider()


@pytest.mark.asyncio
async def test_call_provider_deepseek_without_database_url(monkeypatch):
    from python.services import inference
    from python.services.providers import deepseek_provider

    _clear_provider_keys(monkeypatch)
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-deepseek")
    monkeypatch.delenv("DATABASE_URL", raising=False)

    async def fake_deepseek_call(*args, **kwargs):
        return "ok", {"total_tokens": 1}

    monkeypatch.setattr(deepseek_provider, "call", fake_deepseek_call)

    content, usage = await inference.call_provider(
        "deepseek",
        [{"role": "user", "content": "hi"}],
        max_tokens=8,
        use_tools=False,
        skip_manifest=True,
    )

    assert content == "ok"
    assert usage == {"total_tokens": 1}
