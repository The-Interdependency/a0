# 371:80
import os
import math
import stripe
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
from sqlalchemy import text
from ..database import engine
from ..services.stripe_service import STRIPE_SECRET_KEY
from .billing_helpers import is_supporter_subscription

# DOC module: billing
# DOC label: Billing
# DOC description: Stripe-backed billing. Free tier always on. Supporter tier uses user-chosen weekly donation billed weekly, monthly, quarterly, bi-annually, or annually. ws tier auto-assigned to @interdependentway.org accounts.
# DOC tier: free
# DOC endpoint: GET /api/v1/billing/status | Get current user billing status and tier
# DOC endpoint: GET /api/v1/billing/plans | List available tiers and intervals
# DOC endpoint: POST /api/v1/billing/checkout | Create embedded Stripe checkout session for supporter tier
# DOC endpoint: POST /api/v1/billing/portal | Open Stripe customer portal for subscribers
# DOC endpoint: POST /api/v1/billing/webhook | Stripe webhook receiver
# DOC endpoint: PATCH /api/v1/billing/admin/users/tier | (admin) Set a user tier directly

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
        {"method": "POST", "path": "/api/v1/billing/webhook"},
    ],
}

router = APIRouter(prefix="/api/v1/billing", tags=["billing"])

# Interval config — weeks_per_period defines the effective weekly rate for the period.
# Longer commitments charge fewer effective weeks per month (discount).
INTERVAL_CONFIG: dict[str, dict] = {
    "week":     {"stripe_interval": "week",  "interval_count": 1, "weeks_per_period": 1.0},
    "month":    {"stripe_interval": "month", "interval_count": 1, "weeks_per_period": 4.0},
    "quarter":  {"stripe_interval": "month", "interval_count": 3, "weeks_per_period": 11.25},
    "biannual": {"stripe_interval": "month", "interval_count": 6, "weeks_per_period": 21.0},
    "annual":   {"stripe_interval": "year",  "interval_count": 1, "weeks_per_period": 39.0},
}

INTERVAL_LABELS: dict[str, str] = {
    "week":     "Weekly",
    "month":    "Monthly",
    "quarter":  "Quarterly",
    "biannual": "Bi-annually",
    "annual":   "Annually",
}

_DEFAULT_RETURN_PATH = "/pricing?billing=success"
_WS_DOMAIN = "interdependentway.org"
_ALLOWED_USER_COLS = {"stripe_customer_id", "stripe_subscription_id", "subscription_tier", "subscription_status"}

VALID_TIERS = ("free", "supporter", "ws", "admin")


def _user_id(request: Request) -> Optional[str]:
    return request.headers.get("x-user-id")


def _user_email(request: Request) -> Optional[str]:
    return request.headers.get("x-user-email")


def _user_role(request: Request) -> str:
    return request.headers.get("x-user-role", "user")


async def _check_admin(uid: str, email: Optional[str], conn, role: str = "user") -> bool:
    if role == "admin":
        return True
    if not email:
        return False
    normalized = email.strip().lower()
    row = await conn.execute(
        text("SELECT 1 FROM admin_emails WHERE email = :email"), {"email": normalized}
    )
    return row.fetchone() is not None


async def ensure_admin_emails() -> None:
    env_emails = [e.strip().lower() for e in os.environ.get("ADMIN_EMAIL", "").split(",") if e.strip()]
    if not env_emails:
        return
    async with engine.begin() as conn:
        existing = (await conn.execute(text("SELECT COUNT(*) FROM admin_emails"))).scalar()
        if existing == 0:
            for em in env_emails:
                await conn.execute(
                    text("INSERT INTO admin_emails (email) VALUES (:e) ON CONFLICT DO NOTHING"),
                    {"e": em},
                )
    print(f"[admin] Seeded {len(env_emails)} admin email(s) from ADMIN_EMAIL env var")


async def _maybe_promote_ws(uid: str, email: Optional[str], current_tier: str) -> str:
    """Auto-promote @interdependentway.org accounts to ws tier if currently free."""
    if not email or current_tier != "free":
        return current_tier
    if not email.strip().lower().endswith(f"@{_WS_DOMAIN}"):
        return current_tier
    async with engine.begin() as conn:
        await conn.execute(
            text("UPDATE users SET subscription_tier = 'ws' WHERE id = :uid AND subscription_tier = 'free'"),
            {"uid": uid},
        )
    return "ws"


@router.get("/status")
async def get_status(request: Request):
    uid = _user_id(request)
    email = _user_email(request)
    role = _user_role(request)

    async with engine.connect() as conn:
        is_admin = await _check_admin(uid or "", email, conn, role)

        if not uid:
            return {"plan": "free", "status": "active", "is_admin": is_admin, "user_id": None}

        row = await conn.execute(
            text("SELECT subscription_tier, subscription_status FROM users WHERE id = :id"),
            {"id": uid},
        )
        rec = row.mappings().first()

    if not rec:
        return {"plan": "free", "status": "active", "is_admin": is_admin, "user_id": uid}

    tier = rec["subscription_tier"] or "free"
    if is_admin and tier == "free":
        tier = "ws"
    else:
        tier = await _maybe_promote_ws(uid, email, tier)

    return {
        "plan": tier,
        "status": rec["subscription_status"] or "active",
        "is_admin": is_admin,
        "user_id": uid,
    }


@router.get("/config")
async def get_billing_config():
    """Return public billing configuration (publishable key, interval info)."""
    pk = os.environ.get("STRIPE_PUBLISHABLE_KEY", "")
    return {
        "stripe_publishable_key": pk,
        "intervals": [
            {
                "interval_key": key,
                "label": INTERVAL_LABELS[key],
                "weeks_per_period": cfg["weeks_per_period"],
            }
            for key, cfg in INTERVAL_CONFIG.items()
        ],
    }


@router.get("/plans")
async def list_plans():
    intervals = [
        {
            "interval_key": key,
            "label": INTERVAL_LABELS[key],
            "weeks_per_period": cfg["weeks_per_period"],
        }
        for key, cfg in INTERVAL_CONFIG.items()
    ]
    return {
        "tiers": [
            {
                "name": "Free",
                "product_key": "free",
                "amount": 0,
                "description": "Full console access — every tab unlocked",
            },
            {
                "name": "Supporter",
                "product_key": "supporter",
                "description": "Choose your own weekly contribution. Cancel anytime.",
                "intervals": intervals,
            },
        ]
    }


class SetTierBody(BaseModel):
    user_id: str
    tier: str


@router.patch("/admin/users/tier")
async def set_user_tier(body: SetTierBody, request: Request):
    email = _user_email(request)
    role = _user_role(request)
    uid = _user_id(request)
    async with engine.connect() as conn:
        caller_is_admin = await _check_admin(uid or "", email, conn, role)
    if not caller_is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    if body.tier not in VALID_TIERS:
        raise HTTPException(status_code=400, detail=f"Invalid tier. Valid: {VALID_TIERS}")
    async with engine.begin() as conn:
        res = await conn.execute(
            text("UPDATE users SET subscription_tier = :tier WHERE id = :uid RETURNING id, email, subscription_tier"),
            {"tier": body.tier, "uid": body.user_id},
        )
        updated = res.mappings().first()
    if not updated:
        raise HTTPException(status_code=404, detail="User not found")
    return {"ok": True, "user_id": updated["id"], "email": updated["email"], "tier": updated["subscription_tier"]}


class CheckoutBody(BaseModel):
    weekly_amount_cents: int
    interval: str
    return_url: Optional[str] = None


@router.post("/checkout")
async def create_checkout(body: CheckoutBody, request: Request):
    uid = _user_id(request)
    if not uid:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if not STRIPE_SECRET_KEY:
        raise HTTPException(status_code=503, detail="Stripe not configured")
    if body.interval not in INTERVAL_CONFIG:
        raise HTTPException(status_code=400, detail=f"Invalid interval. Valid: {list(INTERVAL_CONFIG)}")
    if body.weekly_amount_cents < 100:
        raise HTTPException(status_code=400, detail="Minimum weekly amount is $1.00")

    cfg = INTERVAL_CONFIG[body.interval]
    total_cents = math.ceil(body.weekly_amount_cents * cfg["weeks_per_period"])

    stripe.api_key = STRIPE_SECRET_KEY
    origin = request.headers.get("origin") or "https://a0p.replit.app"
    return_url = body.return_url or f"{origin}{_DEFAULT_RETURN_PATH}"

    async with engine.connect() as conn:
        row = await conn.execute(
            text("SELECT email, stripe_customer_id FROM users WHERE id = :id"), {"id": uid}
        )
        rec = row.mappings().first()

    customer_id = rec["stripe_customer_id"] if rec else None
    user_email = rec["email"] if rec else None

    session_kwargs: dict = {
        "ui_mode": "embedded",
        "return_url": return_url,
        "mode": "subscription",
        "line_items": [
            {
                "price_data": {
                    "currency": "usd",
                    "product_data": {
                        "name": "a0p Supporter",
                        "description": f"{INTERVAL_LABELS[body.interval]} supporter subscription",
                    },
                    "unit_amount": total_cents,
                    "recurring": {
                        "interval": cfg["stripe_interval"],
                        "interval_count": cfg["interval_count"],
                    },
                },
                "quantity": 1,
            }
        ],
        "metadata": {
            "user_id": uid,
            "product_key": "supporter",
            "interval": body.interval,
            "weekly_amount_cents": str(body.weekly_amount_cents),
        },
    }
    if customer_id:
        session_kwargs["customer"] = customer_id
    elif user_email:
        session_kwargs["customer_email"] = user_email

    session = stripe.checkout.Session.create(**session_kwargs)
    return {"client_secret": session.client_secret}


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
        row = await conn.execute(
            text("SELECT stripe_customer_id FROM users WHERE id = :id"), {"id": uid}
        )
        rec = row.mappings().first()

    if not rec or not rec["stripe_customer_id"]:
        raise HTTPException(status_code=404, detail="No billing account found")

    session = stripe.billing_portal.Session.create(
        customer=rec["stripe_customer_id"], return_url=body.return_url,
    )
    return {"url": session.url}


async def _ensure_stripe_events_table() -> None:
    """Lazily create the idempotency table for processed Stripe events."""
    async with engine.begin() as conn:
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS processed_stripe_events (
                event_id VARCHAR(255) PRIMARY KEY,
                event_type VARCHAR(120),
                processed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """))


async def _claim_stripe_event(event_id: str, event_type: str) -> bool:
    """Insert event id; return True if newly claimed, False if already processed."""
    async with engine.begin() as conn:
        res = await conn.execute(
            text(
                "INSERT INTO processed_stripe_events (event_id, event_type) "
                "VALUES (:eid, :etype) ON CONFLICT (event_id) DO NOTHING"
            ),
            {"eid": event_id, "etype": event_type},
        )
        # rowcount is 1 when inserted, 0 when it already existed.
        return (res.rowcount or 0) == 1


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

    event_id = event.get("id") or ""
    event_type = event.get("type") or ""
    claimed = False
    if event_id:
        try:
            await _ensure_stripe_events_table()
            # Atomic claim: only one concurrent delivery succeeds; duplicates
            # see claimed=False and short-circuit.
            claimed = await _claim_stripe_event(event_id, event_type)
        except Exception as exc:
            # If idempotency infra is unavailable, refuse to silently
            # double-dispatch — fail the webhook so Stripe retries later.
            print(f"[billing] idempotency claim failed: {exc}")
            raise HTTPException(status_code=503, detail="idempotency unavailable")
        if not claimed:
            # Already processed — reply OK so Stripe stops retrying.
            return {"received": True, "duplicate": True}

    try:
        await _dispatch_webhook(event)
    except Exception:
        # Roll back the claim so Stripe's retry can be processed.
        if event_id and claimed:
            try:
                async with engine.begin() as conn:
                    await conn.execute(
                        text("DELETE FROM processed_stripe_events WHERE event_id = :eid"),
                        {"eid": event_id},
                    )
            except Exception as exc:
                print(f"[billing] failed to release event {event_id} claim: {exc}")
        raise

    return {"received": True}


# --- Internal endpoint: WS-tier promotion at registration/login ---
class PromoteWsBody(BaseModel):
    user_id: str
    email: Optional[str] = None


@router.post("/internal/promote-ws")
async def internal_promote_ws(body: PromoteWsBody, request: Request):
    """Trigger the WS-tier email-domain promotion check.

    Intended to be called by the Express auth layer immediately after
    successful login and registration. Gated by the internal API secret
    so it is not externally callable.
    """
    secret = os.environ.get("INTERNAL_API_SECRET", "")
    provided = request.headers.get("x-internal-secret", "")
    if not secret or provided != secret:
        raise HTTPException(status_code=403, detail="Forbidden")

    async with engine.connect() as conn:
        row = await conn.execute(
            text("SELECT subscription_tier FROM users WHERE id = :id"), {"id": body.user_id}
        )
        rec = row.mappings().first()
    current_tier = (rec["subscription_tier"] if rec else "free") or "free"
    new_tier = await _maybe_promote_ws(body.user_id, body.email, current_tier)
    return {"user_id": body.user_id, "tier": new_tier, "promoted": new_tier != current_tier}


async def _dispatch_webhook(event: dict) -> None:
    etype = event["type"]

    if etype == "checkout.session.completed":
        await _handle_checkout_completed(event["data"]["object"])
    elif etype in ("customer.subscription.updated", "customer.subscription.created"):
        await _handle_subscription_updated(event["data"]["object"])
    elif etype == "customer.subscription.deleted":
        await _handle_subscription_deleted(event["data"]["object"])
    elif etype == "invoice.payment_failed":
        cid = event["data"]["object"].get("customer")
        if cid:
            async with engine.begin() as conn:
                await conn.execute(
                    text("UPDATE users SET subscription_status = 'past_due' WHERE stripe_customer_id = :cid"),
                    {"cid": cid},
                )
    elif etype == "invoice.paid":
        cid = event["data"]["object"].get("customer")
        if cid:
            async with engine.begin() as conn:
                await conn.execute(
                    text("""
                        UPDATE users SET subscription_status = 'active'
                        WHERE stripe_customer_id = :cid AND subscription_status = 'past_due'
                    """),
                    {"cid": cid},
                )


async def _handle_checkout_completed(sess: dict) -> None:
    uid = sess.get("metadata", {}).get("user_id")
    product_key = sess.get("metadata", {}).get("product_key", "")
    customer_id = sess.get("customer")
    subscription_id = sess.get("subscription")

    if not uid:
        return

    updates: dict = {}
    if customer_id:
        updates["stripe_customer_id"] = customer_id
    if subscription_id:
        updates["stripe_subscription_id"] = subscription_id
    if product_key == "supporter":
        updates["subscription_tier"] = "supporter"
        updates["subscription_status"] = "active"

    if updates:
        safe = {k: v for k, v in updates.items() if k in _ALLOWED_USER_COLS}
        if safe:
            set_clause = ", ".join(f"{k} = :{k}" for k in safe)
            safe["uid"] = uid
            async with engine.begin() as conn:
                await conn.execute(text(f"UPDATE users SET {set_clause} WHERE id = :uid"), safe)


async def _handle_subscription_updated(sub: dict) -> None:
    customer_id = sub.get("customer")
    status = sub.get("status", "active")
    if not customer_id:
        return

    metadata = sub.get("metadata") or {}
    if not is_supporter_subscription(metadata):
        return

    async with engine.begin() as conn:
        await conn.execute(
            text("""
                UPDATE users
                SET subscription_status = :status, subscription_tier = 'supporter'
                WHERE stripe_customer_id = :cid
            """),
            {"status": status, "cid": customer_id},
        )


async def _handle_subscription_deleted(sub: dict) -> None:
    customer_id = sub.get("customer")
    if not customer_id:
        return

    async with engine.begin() as conn:
        await conn.execute(
            text("""
                UPDATE users
                SET subscription_tier = 'free', subscription_status = 'canceled'
                WHERE stripe_customer_id = :cid AND subscription_tier = 'supporter'
            """),
            {"cid": customer_id},
        )
# 371:80
