# 23:0
from __future__ import annotations

import pytest
from fastapi import HTTPException

from python.services.forge_instantiation import (
    require_forge_user_id,
    resolve_forge_model_id,
)


def test_require_forge_user_id_requires_signin() -> None:
    with pytest.raises(HTTPException) as exc:
        require_forge_user_id({})

    assert exc.value.status_code == 401
    assert "Sign in required" in str(exc.value.detail)


def test_resolve_forge_model_id_requires_model_or_active_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "python.services.forge_instantiation.energy_registry.get_active_provider",
        lambda: None,
    )

    with pytest.raises(HTTPException) as exc:
        resolve_forge_model_id(None)

    assert exc.value.status_code == 503
    detail = str(exc.value.detail)
    assert "no model_id provided" in detail
    assert "active_provider configured" in detail
# 23:0
