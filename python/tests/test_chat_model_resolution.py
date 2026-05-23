from __future__ import annotations

import pytest
from fastapi import HTTPException

from python.routes import chat


@pytest.mark.asyncio
async def test_resolve_turn_model_prefers_agent_model(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_resolve(model_id: str):
        assert model_id == "gpt-5-mini"
        return "openai", {"vendor": "openai"}

    monkeypatch.setattr("python.routes.chat.energy_registry.get_active_provider", lambda: "gemini")
    monkeypatch.setattr("python.services.model_catalog.resolve_model_id", _fake_resolve)

    model_id, provider_id = await chat._resolve_turn_model(
        body_model=None,
        agent_model_id="gpt-5-mini",
        conv_model="anthropic",
    )

    assert model_id == "gpt-5-mini"
    assert provider_id == "openai"


@pytest.mark.asyncio
async def test_resolve_turn_model_unknown_body_model_400(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _boom(_model_id: str):
        raise ValueError("unknown")

    monkeypatch.setattr("python.services.model_catalog.resolve_model_id", _boom)

    with pytest.raises(HTTPException) as exc:
        await chat._resolve_turn_model(
            body_model="typo-model",
            agent_model_id="gpt-5-mini",
            conv_model="openai",
        )

    assert exc.value.status_code == 400
    assert "Unknown model id" in str(exc.value.detail)
