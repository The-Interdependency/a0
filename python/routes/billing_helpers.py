"""
Billing webhook helpers: founder slot allocation and registry sync.
Extracted to keep billing.py under 400 lines.
"""
from typing import Optional
from sqlalchemy import text
from ..database import engine

FOUNDER_TIERS = ("founder", "patron")
MAX_SLOTS = 53


async def allocate_founder_slot(uid: str) -> Optional[int]:
    """
    Atomically assign the next available founder slot (1-53).
    Returns the slot number or None if already at capacity.
    Idempotent: returns existing slot if already assigned.
    """
    async with engine.begin() as conn:
        row = await conn.execute(
            text("SELECT founder_slot FROM users WHERE id = :uid FOR UPDATE"),
            {"uid": uid},
        )
        rec = row.mappings().first()
        if rec and rec["founder_slot"]:
            return int(rec["founder_slot"])

        cnt_row = await conn.execute(
            text("SELECT COUNT(*) FROM founders WHERE tier = 'founder' FOR UPDATE")
        )
        used = cnt_row.scalar() or 0
        if used >= MAX_SLOTS:
            return None
        return int(used) + 1


async def sync_founder_registry(uid: str, tier: str, action: str) -> None:
    """
    Upsert or downgrade a founders row based on tier transition.
    action='upsert': create/update for patron/founder.
    action='downgrade': mark non-founder rows inactive on cancellation.
    """
    async with engine.begin() as conn:
        if action == "upsert" and tier in FOUNDER_TIERS:
            await conn.execute(
                text("""
                    INSERT INTO founders (user_id, display_name, listed, subscribed_since, tier)
                    VALUES (:uid, '', false, CURRENT_TIMESTAMP, :tier)
                    ON CONFLICT (user_id) DO UPDATE
                      SET tier = EXCLUDED.tier
                """),
                {"uid": uid, "tier": tier},
            )
        elif action == "downgrade":
            await conn.execute(
                text("""
                    UPDATE founders
                    SET tier = 'free', listed = false
                    WHERE user_id = :uid AND tier != 'founder'
                """),
                {"uid": uid},
            )


def get_subscription_tier_from_items(items: list) -> Optional[str]:
    """Extract tier name from Stripe subscription item list by lookup_key."""
    from ..services.stripe_service import PRODUCTS
    lookup_map = {p["lookup_key"]: p["product_key"] for p in PRODUCTS}
    tier_map = {
        "tier_seeker_monthly": "seeker",
        "tier_operator_monthly": "operator",
        "tier_patron_monthly": "patron",
        "tier_founder_lifetime": "founder",
    }
    if not items:
        return None
    lk = items[0].get("price", {}).get("lookup_key", "")
    return tier_map.get(lk)


def is_addon_lookup_key(lk: str) -> bool:
    return lk == "addon_byok_monthly"
