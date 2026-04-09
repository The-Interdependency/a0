from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional

from ..storage import storage
from ..config.policy_loader import get_scope_categories, get_safety_floor_actions

UI_META = {
    "tab_id": "approval_scopes",
    "label": "Approval Scopes",
    "icon": "ShieldCheck",
    "order": 12,
    "sections": [
        {
            "id": "scopes",
            "label": "Pre-Approved Scopes",
            "endpoint": "/api/v1/approval-scopes",
            "fields": [
                {"key": "scope", "type": "badge", "label": "Scope"},
                {"key": "granted_at", "type": "text", "label": "Granted"},
            ],
        },
        {
            "id": "catalog",
            "label": "Scope Catalog",
            "endpoint": "/api/v1/approval-scopes/catalog",
            "fields": [
                {"key": "scope", "type": "badge", "label": "Scope"},
                {"key": "label", "type": "text", "label": "Label"},
                {"key": "description", "type": "text", "label": "Description"},
                {"key": "safety_floor", "type": "badge", "label": "Safety Floor"},
            ],
        },
    ],
}

DATA_SCHEMA = {
    "endpoints": [
        {"method": "GET", "path": "/api/v1/approval-scopes"},
        {"method": "POST", "path": "/api/v1/approval-scopes"},
        {"method": "DELETE", "path": "/api/v1/approval-scopes/{scope}"},
        {"method": "GET", "path": "/api/v1/approval-scopes/catalog"},
    ],
}

router = APIRouter(prefix="/api/v1", tags=["approval-scopes"])


class GrantScopeBody(BaseModel):
    scope: str
    user_id: Optional[str] = None


def _get_uid(request: Request, body_uid: Optional[str] = None) -> str:
    uid = body_uid or request.headers.get("x-user-id", "")
    if not uid:
        raise HTTPException(status_code=400, detail="user_id required")
    return uid


@router.get("/approval-scopes/catalog")
async def list_scope_catalog():
    """Return all defined scope categories with descriptions."""
    categories = get_scope_categories()
    safety_floor = set(get_safety_floor_actions())
    return [
        {
            "scope": name,
            "label": meta["label"],
            "description": meta["description"],
            "covers": meta.get("covers", []),
            "safety_floor": False,
        }
        for name, meta in categories.items()
    ] + [
        {
            "scope": action,
            "label": action.replace("_", " ").title(),
            "description": "Always requires explicit per-gate approval — cannot be pre-approved.",
            "covers": [action],
            "safety_floor": True,
        }
        for action in safety_floor
    ]


@router.get("/approval-scopes")
async def list_approval_scopes(request: Request, user_id: Optional[str] = None):
    uid = _get_uid(request, user_id)
    return await storage.get_approval_scopes(uid)


@router.post("/approval-scopes")
async def grant_approval_scope(body: GrantScopeBody, request: Request):
    uid = _get_uid(request, body.user_id)
    valid_scopes = get_scope_categories()
    safety_floor = set(get_safety_floor_actions())

    if body.scope in safety_floor:
        raise HTTPException(
            status_code=403,
            detail=f"Scope '{body.scope}' is on the safety floor and cannot be pre-approved.",
        )
    if body.scope not in valid_scopes:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown scope '{body.scope}'. Valid: {list(valid_scopes)}",
        )

    record = await storage.grant_approval_scope(uid, body.scope)
    return {"ok": True, "record": record}


@router.delete("/approval-scopes/{scope}")
async def revoke_approval_scope(scope: str, request: Request, user_id: Optional[str] = None):
    uid = _get_uid(request, user_id)
    removed = await storage.revoke_approval_scope(uid, scope)
    if not removed:
        raise HTTPException(status_code=404, detail=f"Scope '{scope}' not found for this user.")
    return {"ok": True, "revoked": scope}
