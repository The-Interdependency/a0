import os
import hashlib
import stripe
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
from sqlalchemy import text
from ..database import engine
from ..services.stripe_service import STRIPE_SECRET_KEY, PRODUCTS, PRICE_ID_CACHE

UI_META = {
    "tab_id": "billing",
    "label": "Billing",
    "icon": "CreditCard",
    "order": 7,
    "sections": [
        {
            "id": "subscription",
            "label": "Subscription",
            "endpoint": "/api/v1/billing/status",
            "fields": [
                {"key": "plan", "type": "badge", "label": "Plan"},
                {"key": "status", "type": "badge", "label": "Status"},
                {"key": "byok_enabled", "type": "text", "label": "BYOK"},
            ],
        },
        {
            "id": "plans",
            "label": "Plans",
            "endpoint": "/api/v1/billing/plans",
            "fields": [
                {"key": "name", "type": "text", "label": "Plan"},
                {"key": "amount_display", "type": "text", "label": "Price"},
                {"key": "product_key", "type": "badge", "label": "Key"},
            ],
        },
    ],
}

DATA_SCHEMA = {
    "endpoints": [
        {"method": "GET", "path": "/api/v1/billing/status"},
        {"method": "GET", "path": "/api/v1/billing/plans"},
        {"method": "POST", "path": "/api/v1/billing/checkout"},
        {"method": "POST", "path": "/api/v1/billing/portal"},
        {"method": "POST", "path": "/api/v1/billing/byok"},
        {"method": "POST", "path": "/api/v1/billing/webhook"},
    ],
}

router = APIRouter(prefix="/api/v1/billing", tags=["billing"])

TIER_MAP = {
    "tier_seeker_monthly": "seeker",
    "tier_operator_monthly": "operator",
    "tier_patron_monthly": "patron",
    "tier_founder_lifetime": "founder",
}


def _user_id(request: Request) -> Optional[str]:
    return request.headers.get("x-replit-user-id")


def _user_email(request: Request) -> Optional[str]:
    return request.headers.get("x-replit-user-email")


def _check_admin(uid: str, email: Optional[str]) -> bool:
    admin_uid = os.environ.get("ADMIN_USER_ID", "")
    admin_email = os.environ.get("ADMIN_EMAIL", "")
    if admin_uid and uid == admin_uid:
        return True
    if admin_email and email and email == admin_email:
        return True
    return False


@router.get("/status")
async def get_status(request: Request):
    uid = _user_id(request)
    email = _user_email(request)
    is_admin = _check_admin(uid or "", email)

    if not uid:
        return {
            "plan": "free",
            "status": "active",
            "provider_pool": "standard",
            "byok_enabled": False,
            "founder_slot": None,
            "is_admin": is_admin,
        }

    async with engine.connect() as conn:
        row = await conn.execute(
            text("SELECT subscription_tier, subscription_status, byok_enabled, founder_slot FROM users WHERE id = :id"),
            {"id": uid},
        )
        rec = row.mappings().first()

    if not rec:
        return {
            "plan": "free",
            "status": "active",
            "provider_pool": "standard",
            "byok_enabled": False,
            "founder_slot": None,
            "is_admin": is_admin,
        }

    tier = rec["subscription_tier"]
    provider_pool = "patron" if tier in ("patron", "founder") else tier if tier != "free" else "standard"
    return {
        "plan": tier,
        "status": rec["subscription_status"],
        "provider_pool": provider_pool,
        "byok_enabled": rec["byok_enabled"],
        "founder_slot": rec["founder_slot"],
        "is_admin": is_admin,
    }


@router.get("/plans")
async def list_plans():
    plans = []
    for p in PRODUCTS:
        amount = p["amount"]
        if amount == 0:
            display = "Free"
        elif p["interval"]:
            display = f"${amount // 100}/mo"
        else:
            display = f"${amount // 100} one-time"
        plans.append({
            "name": p["name"],
            "product_key": p["product_key"],
            "lookup_key": p["lookup_key"],
            "amount": amount,
            "amount_display": display,
            "interval": p["interval"],
            "description": p["description"],
        })
    return plans


_DEFAULT_SUCCESS_PATH = "/console?billing=success"
_DEFAULT_CANCEL_PATH = "/pricing"


class CheckoutBody(BaseModel):
    product: str
    success_url: Optional[str] = None
    cancel_url: Optional[str] = None


@router.post("/checkout")
async def create_checkout(body: CheckoutBody, request: Request):
    uid = _user_id(request)
    if not uid:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if not STRIPE_SECRET_KEY:
        raise HTTPException(status_code=503, detail="Stripe not configured")
    stripe.api_key = STRIPE_SECRET_KEY

    spec = next((p for p in PRODUCTS if p["product_key"] == body.product), None)
    if not spec or spec["amount"] == 0:
        raise HTTPException(status_code=404, detail="Plan not found")

    origin = request.headers.get("origin") or "https://a0p.replit.app"
    success_url = body.success_url or f"{origin}{_DEFAULT_SUCCESS_PATH}"
    cancel_url = body.cancel_url or f"{origin}{_DEFAULT_CANCEL_PATH}"

    price_id = PRICE_ID_CACHE.get(body.product)
    if not price_id:
        prices = stripe.Price.list(lookup_keys=[spec["lookup_key"]], limit=1)
        if not prices.data:
            raise HTTPException(status_code=404, detail="Price not found in Stripe")
        price_id = prices.data[0].id
        PRICE_ID_CACHE[body.product] = price_id

    price = stripe.Price.retrieve(price_id)

    async with engine.connect() as conn:
        row = await conn.execute(text("SELECT email, stripe_customer_id FROM users WHERE id = :id"), {"id": uid})
        rec = row.mappings().first()

    customer_id = rec["stripe_customer_id"] if rec else None
    user_email = rec["email"] if rec else None

    mode = "subscription" if price.recurring else "payment"
    session_kwargs: dict = {
        "mode": mode,
        "line_items": [{"price": price_id, "quantity": 1}],
        "success_url": success_url,
        "cancel_url": cancel_url,
        "metadata": {"user_id": uid, "product_key": body.product, "lookup_key": spec["lookup_key"]},
    }
    if customer_id:
        session_kwargs["customer"] = customer_id
    elif user_email:
        session_kwargs["customer_email"] = user_email

    session = stripe.checkout.Session.create(**session_kwargs)
    return {"checkout_url": session.url}


class PortalBody(BaseModel):
    return_url: str


@router.post("/portal")
async def customer_portal(body: PortalBody, request: Request):
    uid = _user_id(request)
    if not uid:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if not STRIPE_SECRET_KEY:
        raise HTTPException(status_code=503, detail="Stripe not configured")
    stripe.api_key = STRIPE_SECRET_KEY

    async with engine.connect() as conn:
        row = await conn.execute(text("SELECT stripe_customer_id FROM users WHERE id = :id"), {"id": uid})
        rec = row.mappings().first()

    if not rec or not rec["stripe_customer_id"]:
        raise HTTPException(status_code=404, detail="No billing account found")

    session = stripe.billing_portal.Session.create(
        customer=rec["stripe_customer_id"],
        return_url=body.return_url,
    )
    return {"url": session.url}


class ByokBody(BaseModel):
    provider: str
    api_key: str


@router.post("/byok")
async def save_byok(body: ByokBody, request: Request):
    uid = _user_id(request)
    if not uid:
        raise HTTPException(status_code=401, detail="Not authenticated")

    async with engine.connect() as conn:
        row = await conn.execute(
            text("SELECT byok_enabled FROM users WHERE id = :id"), {"id": uid}
        )
        rec = row.mappings().first()

    if not rec or not rec["byok_enabled"]:
        raise HTTPException(status_code=403, detail="BYOK add-on not active")

    key_hash = hashlib.sha256(body.api_key.encode()).hexdigest()
    async with engine.begin() as conn:
        await conn.execute(
            text("""
                INSERT INTO byok_keys (user_id, provider, key_hash)
                VALUES (:uid, :provider, :key_hash)
                ON CONFLICT (user_id, provider) DO UPDATE SET key_hash = EXCLUDED.key_hash
            """),
            {"uid": uid, "provider": body.provider, "key_hash": key_hash},
        )
    return {"ok": True}


@router.post("/webhook")
async def stripe_webhook(request: Request):
    webhook_secret = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")

    if not STRIPE_SECRET_KEY:
        raise HTTPException(status_code=503, detail="Stripe not configured")
    if not webhook_secret:
        raise HTTPException(status_code=503, detail="Webhook secret not configured")
    stripe.api_key = STRIPE_SECRET_KEY

    try:
        event = stripe.Webhook.construct_event(payload, sig, webhook_secret)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    etype = event["type"]

    if etype == "checkout.session.completed":
        sess = event["data"]["object"]
        uid = sess.get("metadata", {}).get("user_id")
        lookup_key = sess.get("metadata", {}).get("lookup_key", "")
        customer_id = sess.get("customer")
        subscription_id = sess.get("subscription")

        if uid:
            tier = TIER_MAP.get(lookup_key)
            updates: dict = {}
            if customer_id:
                updates["stripe_customer_id"] = customer_id
            if subscription_id:
                updates["stripe_subscription_id"] = subscription_id
            if tier:
                updates["subscription_tier"] = tier
                updates["subscription_status"] = "active"
            if lookup_key == "addon_byok_monthly":
                updates["byok_enabled"] = True

            if tier == "founder":
                slot = await _allocate_founder_slot(uid)
                if slot:
                    updates["founder_slot"] = slot

            if updates:
                set_clause = ", ".join(f"{k} = :{k}" for k in updates)
                updates["uid"] = uid
                async with engine.begin() as conn:
                    await conn.execute(
                        text(f"UPDATE users SET {set_clause} WHERE id = :uid"),
                        updates,
                    )

            if tier in ("founder", "patron"):
                await _sync_founder_registry(uid, tier, action="upsert")

    elif etype in ("customer.subscription.updated", "customer.subscription.created"):
        sub = event["data"]["object"]
        customer_id = sub.get("customer")
        status = sub.get("status", "active")
        if customer_id:
            items = sub.get("items", {}).get("data", [])
            tier = None
            if items:
                lk = items[0].get("price", {}).get("lookup_key", "")
                tier = TIER_MAP.get(lk)
            set_parts = ["subscription_status = :status"]
            params: dict = {"status": status, "cid": customer_id}
            if tier:
                set_parts.append("subscription_tier = :tier")
                params["tier"] = tier
            async with engine.begin() as conn:
                uid_row = await conn.execute(
                    text("SELECT id FROM users WHERE stripe_customer_id = :cid"),
                    {"cid": customer_id},
                )
                uid_rec = uid_row.mappings().first()
                await conn.execute(
                    text(f"UPDATE users SET {', '.join(set_parts)} WHERE stripe_customer_id = :cid"),
                    params,
                )
            if tier in ("founder", "patron") and uid_rec:
                await _sync_founder_registry(uid_rec["id"], tier, action="upsert")

    elif etype == "customer.subscription.deleted":
        customer_id = event["data"]["object"].get("customer")
        if customer_id:
            async with engine.begin() as conn:
                uid_row = await conn.execute(
                    text("SELECT id FROM users WHERE stripe_customer_id = :cid"),
                    {"cid": customer_id},
                )
                uid_rec = uid_row.mappings().first()
                await conn.execute(
                    text("UPDATE users SET subscription_tier = 'free', subscription_status = 'canceled' WHERE stripe_customer_id = :cid"),
                    {"cid": customer_id},
                )
            if uid_rec:
                await _sync_founder_registry(uid_rec["id"], "free", action="downgrade")

    elif etype == "invoice.payment_failed":
        customer_id = event["data"]["object"].get("customer")
        if customer_id:
            async with engine.begin() as conn:
                await conn.execute(
                    text("UPDATE users SET subscription_status = 'past_due' WHERE stripe_customer_id = :cid"),
                    {"cid": customer_id},
                )

    elif etype == "invoice.paid":
        customer_id = event["data"]["object"].get("customer")
        if customer_id:
            async with engine.begin() as conn:
                await conn.execute(
                    text("UPDATE users SET subscription_status = 'active' WHERE stripe_customer_id = :cid AND subscription_status = 'past_due'"),
                    {"cid": customer_id},
                )

    return {"received": True}


async def _allocate_founder_slot(uid: str) -> Optional[int]:
    """Assign the next available founder slot (1-53). Idempotent."""
    async with engine.begin() as conn:
        row = await conn.execute(
            text("SELECT founder_slot FROM users WHERE id = :uid"),
            {"uid": uid},
        )
        rec = row.mappings().first()
        if rec and rec["founder_slot"]:
            return rec["founder_slot"]

        cnt_row = await conn.execute(
            text("SELECT COUNT(*) FROM founders WHERE tier = 'founder'")
        )
        used = cnt_row.scalar() or 0
        if used >= 53:
            return None
        return int(used) + 1


async def _sync_founder_registry(uid: str, tier: str, action: str) -> None:
    """Create/update founders table entry for patron or founder tier users."""
    async with engine.begin() as conn:
        if action == "upsert" and tier in ("founder", "patron"):
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
                text("UPDATE founders SET tier = 'free', listed = false WHERE user_id = :uid AND tier != 'founder'"),
                {"uid": uid},
            )
