import os
from typing import Optional
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text
from pydantic import BaseModel
from ..database import engine

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


def _user_id(request: Request) -> Optional[str]:
    return request.headers.get("x-user-id")


def _user_email(request: Request) -> Optional[str]:
    return request.headers.get("x-user-email")


def _user_role(request: Request) -> str:
    return request.headers.get("x-user-role", "user")


async def _is_admin(uid: str, email: Optional[str], role: str = "user") -> bool:
    if role == "admin":
        return True
    if not email:
        return False
    normalized = email.strip().lower()
    async with engine.connect() as conn:
        row = await conn.execute(
            text("SELECT 1 FROM admin_emails WHERE email = :email"), {"email": normalized}
        )
        return row.fetchone() is not None


class AddEmailBody(BaseModel):
    email: str


@router.get("/emails")
async def list_admin_emails(request: Request):
    uid = _user_id(request) or ""
    email = _user_email(request)
    role = _user_role(request)
    if not await _is_admin(uid, email, role):
        return JSONResponse(status_code=403, content={"error": "Forbidden"})
    async with engine.connect() as conn:
        rows = await conn.execute(
            text("SELECT id, email, added_at FROM admin_emails ORDER BY added_at ASC")
        )
        return [{"id": r.id, "email": r.email, "addedAt": r.added_at.isoformat() if r.added_at else None}
                for r in rows]


@router.post("/emails")
async def add_admin_email(request: Request, body: AddEmailBody):
    uid = _user_id(request) or ""
    email = _user_email(request)
    role = _user_role(request)
    if not await _is_admin(uid, email, role):
        return JSONResponse(status_code=403, content={"error": "Forbidden"})
    new_email = body.email.strip().lower()
    if not new_email or "@" not in new_email:
        return JSONResponse(status_code=400, content={"error": "Invalid email"})
    async with engine.begin() as conn:
        existing = await conn.execute(
            text("SELECT 1 FROM admin_emails WHERE email = :e"), {"e": new_email}
        )
        if existing.fetchone():
            return JSONResponse(status_code=409, content={"error": "Already an admin"})
        await conn.execute(
            text("INSERT INTO admin_emails (email) VALUES (:e)"), {"e": new_email}
        )
    return {"ok": True, "email": new_email}


@router.delete("/emails/{email:path}")
async def remove_admin_email(request: Request, email: str):
    uid = _user_id(request) or ""
    caller_email = _user_email(request)
    role = _user_role(request)
    if not await _is_admin(uid, caller_email, role):
        return JSONResponse(status_code=403, content={"error": "Forbidden"})
    target = email.strip().lower()
    if caller_email and target == caller_email.lower():
        return JSONResponse(status_code=400, content={"error": "Cannot remove yourself"})
    async with engine.begin() as conn:
        result = await conn.execute(
            text("DELETE FROM admin_emails WHERE email = :e"), {"e": target}
        )
        if result.rowcount == 0:
            return JSONResponse(status_code=404, content={"error": "Not found"})
    return {"ok": True, "email": target}
