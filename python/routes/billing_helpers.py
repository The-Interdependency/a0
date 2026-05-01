# 7:16
"""
Billing helpers — Supporter-tier shims kept alive only for legacy webhook traffic.

The Supporter recurring subscription tier was retired by Task #110.
These helpers no longer participate in any new sign-up flow; they exist
purely so that in-flight Stripe subscription webhooks for users who
subscribed before the retirement can still be classified as
"supporter metadata" and processed by `_handle_subscription_updated` /
`_handle_subscription_deleted` in `python/routes/billing.py`.

Do not call from new code.
"""
from typing import Optional


def get_subscription_tier_from_items(items: list) -> Optional[str]:
    """Legacy: every Stripe subscription line item maps to the retired
    Supporter tier. Kept so historical webhook code paths still
    resolve a tier string when needed."""
    if not items:
        return None
    return "supporter"


def is_supporter_subscription(metadata: dict) -> bool:
    """True iff a Stripe subscription's metadata identifies it as a
    legacy Supporter sub. Used to filter webhook events so we only
    touch rows that were actually Supporter subscribers."""
    return metadata.get("product_key") == "supporter"
# 7:16
