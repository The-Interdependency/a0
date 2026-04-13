# 10:6
from fastapi import APIRouter, HTTPException, Request

from ..services.editable_registry import editable_registry

# DOC module: editable_schema
# DOC label: Editable Schema
# DOC description: Machine-readable index of all registered mutable backend fields. WSEM fetches this index on activation to know what is editable, what control type to render, and which endpoint to PATCH.
# DOC tier: ws
# DOC endpoint: GET /api/v1/editable-schema/index | Return all registered editable fields (ws/admin only)

_WS_TIERS = {"ws", "pro", "admin"}

router = APIRouter(prefix="/api/v1/editable-schema", tags=["editable-schema"])


@router.get("/index")
async def get_editable_schema_index(request: Request):
    """Return all registered editable fields. Requires ws/pro/admin tier."""
    tier = request.headers.get("x-subscription-tier", "free")
    if tier not in _WS_TIERS:
        raise HTTPException(status_code=403, detail="ws tier required")
    return editable_registry.get_all()
# 10:6
