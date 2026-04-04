from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
from sqlalchemy import text
from ..database import engine

MAX_FOUNDER_SLOTS = 53
FOUNDER_TIERS = ("founder",)
LISTED_TIERS = ("founder", "patron")

UI_META = {
    "tab_id": "founders",
    "label": "Founders",
    "icon": "Star",
    "order": 9,
    "sections": [
        {
            "id": "founders_list",
            "label": "Founders",
            "endpoint": "/api/v1/founders",
            "fields": [
                {"key": "founder_slot", "type": "badge", "label": "Slot"},
                {"key": "display_name", "type": "text", "label": "Name"},
                {"key": "tier", "type": "badge", "label": "Tier"},
                {"key": "subscribed_since", "type": "text", "label": "Member Since"},
            ],
        }
    ],
}

DATA_SCHEMA = {
    "endpoints": [
        {"method": "GET", "path": "/api/v1/founders"},
        {"method": "GET", "path": "/api/v1/founders/count"},
        {"method": "PATCH", "path": "/api/v1/founders/me"},
    ],
}

router = APIRouter(prefix="/api/v1/founders", tags=["founders"])


async def _lifetime_count() -> int:
    async with engine.connect() as conn:
        row = await conn.execute(
            text("SELECT COUNT(*) FROM founders WHERE tier = 'founder'")
        )
        return row.scalar() or 0


@router.get("/count")
async def founder_count():
    cnt = await _lifetime_count()
    slots_remaining = max(0, MAX_FOUNDER_SLOTS - cnt)
    return {"count": cnt, "max": MAX_FOUNDER_SLOTS, "slots_remaining": slots_remaining}


@router.get("")
async def list_founders():
    async with engine.connect() as conn:
        rows = await conn.execute(
            text("""
                SELECT f.user_id, f.display_name, f.subscribed_since, f.tier,
                       u.founder_slot
                FROM founders f
                LEFT JOIN users u ON u.id = f.user_id
                WHERE f.listed = true
                  AND f.tier IN ('founder', 'patron')
                ORDER BY f.subscribed_since ASC
            """)
        )
        items = [dict(r) for r in rows.mappings()]

    cnt = await _lifetime_count()
    slots_remaining = max(0, MAX_FOUNDER_SLOTS - cnt)
    return {
        "founders": items,
        "lifetime_slots_remaining": slots_remaining,
        "total": cnt,
    }


class FounderPatch(BaseModel):
    listed: Optional[bool] = None
    display_name: Optional[str] = None


@router.patch("/me")
async def update_my_founder_profile(body: FounderPatch, request: Request):
    uid = request.headers.get("x-user-id", "")
    if not uid:
        raise HTTPException(status_code=401, detail="Not authenticated")

    async with engine.connect() as conn:
        row = await conn.execute(text("SELECT id FROM founders WHERE user_id = :uid"), {"uid": uid})
        rec = row.mappings().first()

    if not rec:
        raise HTTPException(status_code=404, detail="Not a founder")

    updates = {}
    if body.listed is not None:
        updates["listed"] = body.listed
    if body.display_name is not None:
        updates["display_name"] = body.display_name

    if updates:
        _ALLOWED_FOUNDER_COLS = {"listed", "display_name"}
        safe = {k: v for k, v in updates.items() if k in _ALLOWED_FOUNDER_COLS}
        if safe:
            set_clause = ", ".join(f"{k} = :{k}" for k in safe)
            safe["uid"] = uid
            async with engine.begin() as conn:
                await conn.execute(
                    text(f"UPDATE founders SET {set_clause} WHERE user_id = :uid"),
                    safe,
                )
    return {"ok": True}
