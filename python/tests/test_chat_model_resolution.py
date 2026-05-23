# 31:0
from __future__ import annotations

import pytest
from fastapi import HTTPException

from python.services.turn_model_resolution import resolve_turn_model


@pytest.mark.asyncio
async def test_resolve_turn_model_prefers_agent_model(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_resolve(model_id: str):
        assert model_id == "gpt-5-mini"
        return "openai", {"vendor": "openai"}

    monkeypatch.setattr("python.services.turn_model_resolution.energy_registry.get_active_provider", lambda: "gemini")

    model_id, provider_id = await resolve_turn_model(
        body_model=None,
        agent_model_id="gpt-5-mini",
        conv_model="anthropic",
        resolver=_fake_resolve,
    )

    assert model_id == "gpt-5-mini"
    assert provider_id == "openai"


@pytest.mark.asyncio
async def test_resolve_turn_model_unknown_body_model_400() -> None:
    async def _boom(_model_id: str):
        raise ValueError("unknown")

    with pytest.raises(HTTPException) as exc:
        await resolve_turn_model(
            body_model="typo-model",
            agent_model_id="gpt-5-mini",
            conv_model="openai",
            resolver=_boom,
        )

    assert exc.value.status_code == 400
    assert "Unknown model id" in str(exc.value.detail)
# 31:0
