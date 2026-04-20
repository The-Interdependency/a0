# 73:1
"""set_user_tier — admin-only DB tier override."""
import json

SCHEMA = {
    "type": "function",
    "function": {
        "name": "set_user_tier",
        "description": (
            "Admin-only: set a user's subscription tier immediately, bypassing Stripe. "
            "Use to promote, demote, or correct a user's access level. "
            "Valid tiers: free, supporter, ws, admin."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "user_id": {
                    "type": "string",
                    "description": "The UUID of the user whose tier should change.",
                },
                "tier": {
                    "type": "string",
                    "enum": ["free", "supporter", "ws", "admin"],
                    "description": "The new subscription tier to assign.",
                },
            },
            "required": ["user_id", "tier"],
        },
    },
    "tier": "admin",
    "approval_scope": None,
    "enabled": True,
    "category": "admin",
    "cost_hint": "free",
    "side_effects": ["change_permissions"],
    "version": 1,
}

_VALID = ("free", "supporter", "ws", "admin")


async def handle(user_id: str = "", tier: str = "", **_) -> str:
    from ...database import engine
    from sqlalchemy import text as sa_text
    from ..tool_executor import get_approval_scope_user_id

    if not user_id:
        return json.dumps({"ok": False, "error": "user_id is required"})
    if tier not in _VALID:
        return json.dumps({"ok": False, "error": f"Invalid tier '{tier}'. Valid: {_VALID}"})

    caller_uid = get_approval_scope_user_id()
    if not caller_uid:
        return json.dumps({"ok": False, "error": "No user context — must be called within a chat request"})

    async with engine.connect() as conn:
        admin_row = await conn.execute(
            sa_text(
                "SELECT 1 FROM admin_emails WHERE email = "
                "(SELECT email FROM users WHERE id = :uid)"
            ),
            {"uid": caller_uid},
        )
        if not admin_row.first():
            return json.dumps({"ok": False, "error": "Admin access required"})

    async with engine.begin() as conn:
        res = await conn.execute(
            sa_text(
                "UPDATE users SET subscription_tier = :tier WHERE id = :uid "
                "RETURNING id, email, subscription_tier"
            ),
            {"tier": tier, "uid": user_id},
        )
        updated = res.mappings().first()

    if not updated:
        return json.dumps({"ok": False, "error": f"User '{user_id}' not found"})
    return json.dumps({
        "ok": True,
        "user_id": updated["id"],
        "email": updated["email"],
        "tier": updated["subscription_tier"],
    })
# 73:1
