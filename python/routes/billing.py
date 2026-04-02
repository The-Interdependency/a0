import os
import hashlib
import stripe
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
from sqlalchemy import text, select, update
from ..database import engine
from ..services.stripe_service import STRIPE_SECRET_KEY, PRODUCTS

UI_META = {
    "tab_id": "billing",
    "label": "Billing",
    "icon": "CreditCard",
    "order": 7,
    "sections": [
        {
            "id": "subscription",
            "label": "Subscription",
            "endpoint": "/api/v1/billing/subscription",
            "fields": [
                {"key": "tier", "type": "badge", "label": "Tier"},
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
                {"key": "lookup_key", "type": "badge", "label": "Key"},
            ],
        },
    ],
}

DATA_SCHEMA = {
    "endpoints": [
        {"method": "GET", "path": "/api/v1/billing/subscription"},
        {"method": "GET", "path": "/api/v1/billing/plans"},
        {"method": "POST", "path": "/api/v1/billing/checkout"},
        {"method": "POST", "path": "/api/v1/billing/portal"},
        {"method": "POST", "path": "/api/v1/billing/byok"},
        {"method": "POST", "path": "/api/v1/billing/webhook"},
    ],
}

router = APIRouter(prefix="/api/v1/billing", tags=["billing"])


def _user_id(request: Request) -> Optional[str]:
    return request.headers.get("x-replit-user-id")


@router.get("/status")
async def get_status(request: Request):
    return await get_subscription(request)


@router.get("/subscription")
async def get_subscription(request: Request):
    uid = _user_id(request)
    if not uid:
        return {"tier": "free", "status": "active", "byok_enabled": False, "founder_slot": None, "is_admin": False}
    async with engine.connect() as conn:
        row = await conn.execute(
            text("SELECT subscription_tier, subscription_status, byok_enabled, founder_slot FROM users WHERE id = :id"),
            {"id": uid},
        )
        rec = row.mappings().first()
    admin_uid = os.environ.get("ADMIN_USER_ID", "")
    is_admin = bool(admin_uid and uid == admin_uid)

    if not rec:
        return {"tier": "free", "status": "active", "byok_enabled": False, "founder_slot": None, "is_admin": is_admin}
    return {
        "tier": rec["subscription_tier"],
        "status": rec["subscription_status"],
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
            "lookup_key": p["lookup_key"],
            "amount": amount,
            "amount_display": display,
            "interval": p["interval"],
            "description": p["description"],
        })
    return plans


class CheckoutBody(BaseModel):
    lookup_key: str
    success_url: str
    cancel_url: str


@router.post("/checkout")
async def create_checkout(body: CheckoutBody, request: Request):
    uid = _user_id(request)
    if not uid:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if not STRIPE_SECRET_KEY:
        raise HTTPException(status_code=503, detail="Stripe not configured")
    stripe.api_key = STRIPE_SECRET_KEY

    prices = stripe.Price.list(lookup_keys=[body.lookup_key], limit=1)
    if not prices.data:
        raise HTTPException(status_code=404, detail="Plan not found")
    price = prices.data[0]

    async with engine.connect() as conn:
        row = await conn.execute(text("SELECT email, stripe_customer_id FROM users WHERE id = :id"), {"id": uid})
        rec = row.mappings().first()

    customer_id = rec["stripe_customer_id"] if rec else None
    email = rec["email"] if rec else None

    mode = "subscription" if price.recurring else "payment"
    session_kwargs: dict = {
        "mode": mode,
        "line_items": [{"price": price.id, "quantity": 1}],
        "success_url": body.success_url,
        "cancel_url": body.cancel_url,
        "metadata": {"user_id": uid, "lookup_key": body.lookup_key},
    }
    if customer_id:
        session_kwargs["customer"] = customer_id
    elif email:
        session_kwargs["customer_email"] = email

    session = stripe.checkout.Session.create(**session_kwargs)
    return {"url": session.url}


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


TIER_MAP = {
    "tier_seeker_monthly": "seeker",
    "tier_operator_monthly": "operator",
    "tier_patron_monthly": "patron",
    "tier_founder_lifetime": "founder",
    "addon_byok_monthly": None,
}


@router.post("/webhook")
async def stripe_webhook(request: Request):
    webhook_secret = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")

    if not STRIPE_SECRET_KEY:
        raise HTTPException(status_code=503, detail="Stripe not configured")
    stripe.api_key = STRIPE_SECRET_KEY

    try:
        if webhook_secret:
            event = stripe.Webhook.construct_event(payload, sig, webhook_secret)
        else:
            import json
            event = stripe.Event.construct_from(json.loads(payload), stripe.api_key)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        uid = session.get("metadata", {}).get("user_id")
        lookup_key = session.get("metadata", {}).get("lookup_key", "")
        customer_id = session.get("customer")
        subscription_id = session.get("subscription")

        if uid:
            tier = TIER_MAP.get(lookup_key)
            async with engine.begin() as conn:
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
                if updates:
                    set_clause = ", ".join(f"{k} = :{k}" for k in updates)
                    updates["uid"] = uid
                    await conn.execute(
                        text(f"UPDATE users SET {set_clause} WHERE id = :uid"),
                        updates,
                    )

    elif event["type"] in ("customer.subscription.updated", "customer.subscription.created"):
        sub = event["data"]["object"]
        customer_id = sub.get("customer")
        status = sub.get("status", "active")
        if customer_id:
            price_id = None
            items = sub.get("items", {}).get("data", [])
            if items:
                price_id = items[0].get("price", {}).get("id")
            tier = None
            if price_id:
                try:
                    price = stripe.Price.retrieve(price_id)
                    lk = price.get("lookup_key", "")
                    tier = TIER_MAP.get(lk)
                except Exception:
                    pass
            async with engine.begin() as conn:
                updates: dict = {"status": status}
                if tier:
                    updates["subscription_tier"] = tier
                set_parts = ["subscription_status = :status"]
                if tier:
                    set_parts.append("subscription_tier = :subscription_tier")
                updates["cid"] = customer_id
                await conn.execute(
                    text(f"UPDATE users SET {', '.join(set_parts)} WHERE stripe_customer_id = :cid"),
                    updates,
                )

    elif event["type"] == "customer.subscription.deleted":
        sub = event["data"]["object"]
        customer_id = sub.get("customer")
        if customer_id:
            async with engine.begin() as conn:
                await conn.execute(
                    text("UPDATE users SET subscription_tier = 'free', subscription_status = 'canceled' WHERE stripe_customer_id = :cid"),
                    {"cid": customer_id},
                )

    elif event["type"] == "invoice.payment_failed":
        invoice = event["data"]["object"]
        customer_id = invoice.get("customer")
        if customer_id:
            async with engine.begin() as conn:
                await conn.execute(
                    text("UPDATE users SET subscription_status = 'past_due' WHERE stripe_customer_id = :cid"),
                    {"cid": customer_id},
                )

    elif event["type"] == "invoice.paid":
        invoice = event["data"]["object"]
        customer_id = invoice.get("customer")
        if customer_id:
            async with engine.begin() as conn:
                await conn.execute(
                    text("UPDATE users SET subscription_status = 'active' WHERE stripe_customer_id = :cid AND subscription_status = 'past_due'"),
                    {"cid": customer_id},
                )

    return {"received": True}
