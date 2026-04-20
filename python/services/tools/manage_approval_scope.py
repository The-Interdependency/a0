# 76:5
"""manage_approval_scope — grant/revoke pre-approved action scopes."""
import json

SCHEMA = {
    "type": "function",
    "function": {
        "name": "manage_approval_scope",
        "description": (
            "Grant or revoke a pre-approved action scope for the current user, removing the need to "
            "type 'APPROVE gate-xxx' for every action in that category. "
            "Available scopes: 'github_write' (push, PRs, issues), 'publish' (post/publish content), "
            "'email_send' (send emails), 'outreach' (contact humans). "
            "Safety-floor scopes (spend_money, change_permissions, change_secrets) cannot be pre-approved. "
            "action='grant' adds the scope; action='revoke' removes it."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["grant", "revoke", "list"],
                    "description": "Whether to grant, revoke, or list approval scopes.",
                },
                "scope": {
                    "type": "string",
                    "description": "The scope name to grant or revoke (omit for 'list').",
                },
            },
            "required": ["action"],
        },
    },
    "tier": "free",
    "approval_scope": None,
    "enabled": True,
    "category": "governance",
    "cost_hint": "free",
    "side_effects": ["change_permissions"],
    "version": 1,
}


async def handle(action: str = "list", scope: str | None = None, **_) -> str:
    from ...storage import storage
    from ...config.policy_loader import get_scope_categories, get_safety_floor_actions
    from ..tool_executor import get_approval_scope_user_id

    uid = get_approval_scope_user_id()
    if not uid:
        return "[manage_approval_scope: no user context — tool must be called within a chat request]"

    categories = get_scope_categories()
    safety_floor = set(get_safety_floor_actions())

    if action == "list":
        granted = await storage.get_approval_scopes(uid)
        if not granted:
            available = ", ".join(categories.keys())
            return json.dumps({
                "granted": [],
                "available": list(categories.keys()),
                "note": f"No scopes pre-approved. Available: {available}",
            })
        return json.dumps({
            "granted": [r["scope"] for r in granted],
            "available": list(categories.keys()),
        })

    if not scope:
        return "[manage_approval_scope: 'scope' is required for grant/revoke]"

    scope = scope.lower().strip()

    if action == "grant":
        if scope in safety_floor:
            return json.dumps({
                "ok": False,
                "error": f"'{scope}' is on the safety floor and cannot be pre-approved.",
            })
        if scope not in categories:
            return json.dumps({
                "ok": False,
                "error": f"Unknown scope '{scope}'. Valid: {list(categories.keys())}",
            })
        from ...storage.domain import check_scope_grant_tier
        try:
            await check_scope_grant_tier(uid)
        except ValueError as _tier_err:
            return json.dumps({"ok": False, "error": str(_tier_err)})
        await storage.grant_approval_scope(uid, scope)
        meta = categories[scope]
        return json.dumps({
            "ok": True,
            "scope": scope,
            "label": meta["label"],
            "description": meta["description"],
        })

    if action == "revoke":
        from ...storage.domain import check_scope_grant_tier
        try:
            await check_scope_grant_tier(uid)
        except ValueError as _tier_err:
            return json.dumps({"ok": False, "error": str(_tier_err)})
        removed = await storage.revoke_approval_scope(uid, scope)
        return json.dumps({"ok": removed, "scope": scope, "revoked": removed})

    return f"[manage_approval_scope: unknown action '{action}']"
# 76:5
