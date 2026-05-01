# 16:20
"""Stripe configuration shim.

Donations-only after Task #110: there is no recurring "Supporter"
subscription product to bootstrap any more. The /donate endpoint uses
dynamic price_data per checkout session, so no static product list is
required. This module is kept as the canonical home for STRIPE_SECRET_KEY
and the tier→prompt-context mapping used by chat.
"""
import os

STRIPE_SECRET_KEY = os.environ.get("STRIPE_SECRET_KEY", "")

# Empty list — donations are dynamic price_data; no Stripe product
# bootstrap required. Kept as an exported name so callers that import
# it for inspection don't break.
PRODUCTS: list[dict] = []

PRICE_ID_CACHE: dict[str, str] = {}


async def ensure_stripe_products() -> list[dict]:
    """No-op since the Supporter recurring product was retired (Task #110).

    Donations use dynamic price_data per session; nothing to provision
    in Stripe at boot.
    """
    if not STRIPE_SECRET_KEY:
        print("[stripe] STRIPE_SECRET_KEY not set — donations endpoint will 503")
    return []


def get_tier_context_name(tier: str) -> str:
    """Map a runtime tier to a prompt_contexts row name.

    'supporter' is no longer assignable as a new tier (Task #110), but
    legacy rows in the users table may still hold the value until their
    Stripe subscription is canceled. Map it to tier_ws so they keep the
    contextual experience they had before retirement.
    """
    mapping = {
        "free": "tier_free",
        "supporter": "tier_ws",
        "ws": "tier_ws",
        "admin": "tier_ws",
    }
    return mapping.get(tier, "tier_free")
# 16:20
