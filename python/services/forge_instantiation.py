# 21:2
from __future__ import annotations

from collections.abc import Mapping

from fastapi import HTTPException

from .energy_registry import energy_registry


def require_forge_user_id(headers: Mapping[str, str]) -> str:
    """Require caller identity for forge operations."""
    uid = headers.get("x-user-id") or headers.get("X-User-Id")
    if not uid:
        raise HTTPException(401, "Sign in required to use the Forge.")
    return uid


def resolve_forge_model_id(model_id: str | None) -> str:
    """Resolve model id for forge creation from body or active provider."""
    resolved = model_id or energy_registry.get_active_provider()
    if not resolved:
        raise HTTPException(
            status_code=503,
            detail=(
                "Cannot instantiate forge agent: no model_id provided and no "
                "active_provider configured. Set one via "
                "POST /api/agents/active-provider."
            ),
        )
    return resolved
# 21:2
