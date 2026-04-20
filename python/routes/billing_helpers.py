# 7:4
"""
Billing helpers: subscription tier extraction from Stripe webhook data.
"""
from typing import Optional


def get_subscription_tier_from_items(items: list) -> Optional[str]:
    """For supporter tier, all subscriptions map to 'supporter'."""
    if not items:
        return None
    return "supporter"


def is_supporter_subscription(metadata: dict) -> bool:
    return metadata.get("product_key") == "supporter"
# 7:4
