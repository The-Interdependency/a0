# 38:8
import os
from fastapi import APIRouter, HTTPException, Request

from ..services.editable_registry import editable_registry

# DOC module: editable_schema
# DOC label: Editable Schema
# DOC description: Machine-readable index of all registered mutable backend fields. WSEM fetches this index on activation to know what is editable, what control type to render, and which endpoint to PATCH. Also serves the project README with live per-module code:comment stats.
# DOC tier: ws
# DOC endpoint: GET /api/v1/editable-schema/index | Return all registered editable fields in camelCase (ws/admin only)
# DOC endpoint: GET /api/v1/editable-schema/readme | Return replit.md content and per-module stats (all authenticated users)

_WS_TIERS = {"ws", "admin"}

router = APIRouter(prefix="/api/v1/editable-schema", tags=["editable-schema"])


@router.get("/index")
async def get_editable_schema_index(request: Request):
    """Return all registered editable fields. Requires ws or admin tier."""
    tier = request.headers.get("x-subscription-tier", "free")
    if tier not in _WS_TIERS:
        raise HTTPException(status_code=403, detail="ws or admin tier required")
    fields = editable_registry.get_all()
    return [
        {
            "key": f["key"],
            "label": f["label"],
            "description": f["description"],
            "controlType": f["control_type"],
            "module": f["module"],
            "getEndpoint": f["get_endpoint"],
            "patchEndpoint": f["patch_endpoint"],
            "queryKey": f["query_key"],
            "options": f["options"],
        }
        for f in fields
    ]


@router.get("/readme")
async def get_editable_schema_readme(request: Request):
    """Return replit.md prose + per-module code:comment stats. Open to all authenticated users."""
    from python.routes import collect_doc_meta
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    for candidate in ("replit.md", "README.md"):
        path = os.path.join(root, candidate)
        if os.path.exists(path):
            content = open(path, encoding="utf-8").read()
            break
    else:
        content = "# a0p\n\nNo README found."
    modules = collect_doc_meta()
    return {"content": content, "modules": modules}
# 38:8
