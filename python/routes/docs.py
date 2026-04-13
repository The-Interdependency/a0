# 13:6
# DOC module: docs
# DOC label: Docs
# DOC description: Living API reference. Each route module self-declares its documentation via # DOC comment blocks in its source file; this module aggregates and serves them. Minimum required fields per module: module, label, description, tier.
# DOC tier: free
# DOC endpoint: GET /api/v1/docs | Return all module documentation entries sorted by label

from fastapi import APIRouter, Request

UI_META = {
    "tab_id": "docs",
    "label": "Docs",
    "icon": "BookOpen",
    "order": 13,
    "sections": [],
}

router = APIRouter(prefix="/api/v1", tags=["docs"])


@router.get("/docs")
async def get_docs(request: Request):
    """Return all module documentation entries. Available to all authenticated users."""
    from python.routes import collect_doc_meta
    return collect_doc_meta()
# 13:6
