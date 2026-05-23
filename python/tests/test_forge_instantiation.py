from __future__ import annotations

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from python.routes import forge


def _request_with_headers(headers: list[tuple[bytes, bytes]]) -> Request:
    return Request({"type": "http", "headers": headers})


@pytest.mark.asyncio
async def test_instantiate_requires_signed_in_user() -> None:
    body = forge.InstantiateRequest(
        template_id=forge.ARCHETYPES[0]["id"],
        name="NoAuth",
    )
    req = _request_with_headers([])

    with pytest.raises(HTTPException) as exc:
        await forge.instantiate(req, body)

    assert exc.value.status_code == 401
    assert "Sign in required" in str(exc.value.detail)


@pytest.mark.asyncio
async def test_instantiate_requires_model_or_active_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    body = forge.InstantiateRequest(
        template_id=forge.ARCHETYPES[0]["id"],
        name="NoModel",
    )
    req = _request_with_headers([(b"x-user-id", b"u-test")])

    monkeypatch.setattr(forge.energy_registry, "get_active_provider", lambda: None)

    with pytest.raises(HTTPException) as exc:
        await forge.instantiate(req, body)

    assert exc.value.status_code == 503
    detail = str(exc.value.detail)
    assert "no model_id provided" in detail
    assert "active_provider configured" in detail
