# 27:8
# DOC module: docs
# DOC label: Docs
# DOC description: Living API reference. Each route module self-declares its documentation via # DOC comment blocks in its source file; this module aggregates and serves them. Minimum required fields per module: module, label, description, tier.
# DOC tier: free
# DOC endpoint: GET /api/v1/docs | Return all module documentation entries sorted by label
# DOC endpoint: GET /api/v1/docs/readme | Return replit.md content and per-module code:comment stats

import os
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


@router.get("/docs/readme")
async def get_readme(request: Request):
    """Return replit.md prose + per-module code:comment stats. Available to all authenticated users."""
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
# 27:8
