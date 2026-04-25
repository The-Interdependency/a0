# 9:12
# DOC module: models
# DOC label: Models
# DOC description: Unified model catalog — every model the caller can actually use, with provider + role-assignment + tier provenance.
# DOC tier: free
# DOC endpoint: GET /api/v1/models | List every model the caller can invoke, grouped by provider, with provenance

from typing import Optional

from fastapi import APIRouter, Request

from ..services.model_catalog import list_models_for_user

router = APIRouter(prefix="/api/v1", tags=["models"])


def _uid(request: Request) -> Optional[str]:
    return request.headers.get("x-user-id") or request.headers.get("X-User-Id") or None


@router.get("/models")
async def list_models(request: Request) -> dict:
    """Single source of truth for model selection across Forge / chat / spawn.

    Returns every model from every provider, with: which roles it's
    assigned to, which optimizer presets surface it, whether it was
    discovered, whether the provider's API key is present, whether the
    user's tier permits the provider, and whether the model is in the
    user's disabled_models list.
    """
    return await list_models_for_user(_uid(request))
# 9:12
