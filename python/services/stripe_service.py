# 29:0
import os
import stripe

STRIPE_SECRET_KEY = os.environ.get("STRIPE_SECRET_KEY", "")

PRODUCTS = [
    {
        "name": "Free",
        "product_key": "free",
        "lookup_key": "tier_free",
        "amount": 0,
        "interval": None,
        "currency": "usd",
        "description": "Free tier — full console access",
    },
]

PRICE_ID_CACHE: dict[str, str] = {}


async def ensure_stripe_products() -> list[dict]:
    if not STRIPE_SECRET_KEY:
        print("[stripe] STRIPE_SECRET_KEY not set — skipping product bootstrap")
        return []
    print("[stripe] Supporter tier uses dynamic price_data — no product bootstrap needed")
    return []


def get_tier_context_name(tier: str) -> str:
    mapping = {
        "free": "tier_free",
        "supporter": "tier_supporter",
        "ws": "tier_ws",
        "admin": "tier_ws",
    }
    return mapping.get(tier, "tier_free")
# 29:0
