# 368:258
import os
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
# DOC description: Donations-only billing surface. a0p is a research instrument, not a subscription product — there is no recurring sign-up tier. Existing Supporter subscribers are honored until they cancel via the Stripe portal. ws tier auto-assigned to @interdependentway.org accounts; admin tier reserved for the owner + invited collaborators.
# DOC tier: free
# DOC endpoint: GET /api/v1/billing/status | Get current user billing status and tier
# DOC endpoint: GET /api/v1/billing/plans | List supported flows (donation only; legacy Supporter tier retired)
# DOC endpoint: GET /api/v1/billing/funding-statement | Verbatim 501c3/$500 disclosure copy
# DOC endpoint: POST /api/v1/billing/donate | One-off donation to support the instrument (no perks unlocked)
# DOC endpoint: POST /api/v1/billing/portal | Open Stripe customer portal for legacy subscribers to cancel
# DOC endpoint: POST /api/v1/billing/webhook | Stripe webhook receiver
# DOC endpoint: PATCH /api/v1/billing/admin/users/tier | (admin) Set a user tier directly
# DOC notes: Verbatim copy block visible on /pricing — "I don't have the cash required for 501c3 status, so I have to report it for taxes, but every tax payer is allowed to claim up to five hundred dollars in charitable donations per year without receipts required."

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
        {"method": "POST", "path": "/api/v1/billing/donate"},
        {"method": "POST", "path": "/api/v1/billing/portal"},
        {"method": "POST", "path": "/api/v1/billing/webhook"},
    ],
}

router = APIRouter(prefix="/api/v1/billing", tags=["billing"])

# Donations-only — there is no recurring "Supporter" tier any more.
# The interval/Supporter scaffolding has been retired (Task #110); existing
# subscribers are honored via the Stripe webhook + portal until they cancel.
_DONATION_RETURN_PATH = "/pricing?donation=success"
_WS_DOMAIN = "interdependentway.org"
_ALLOWED_USER_COLS = {
    "stripe_customer_id", "stripe_subscription_id", "subscription_tier",
    "subscription_status",
}

VALID_TIERS = ("free", "ws", "admin")
DONATION_MIN_CENTS = 500  # $5.00 minimum one-off donation. Donations DO NOT unlock features.

# Verbatim copy block for the donations surface. Source of truth — the
# /pricing page reads this through GET /plans so the wording stays in one
# place.
DONATION_LEGAL_COPY = (
    "I don't have the cash required for 501c3 status, so I have to report "
    "it for taxes, but every tax payer is allowed to claim up to five "
    "hundred dollars in charitable donations per year without receipts "
    "required."
)


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
    """Return public billing configuration (publishable key only)."""
    pk = os.environ.get("STRIPE_PUBLISHABLE_KEY", "")
    return {"stripe_publishable_key": pk}


@router.get("/funding-statement")
async def funding_statement():
    """Return the verbatim 501c3 / $500 disclosure copy.

    Single source of truth for the legal framing used on /pricing,
    README.md, and any future surface that displays it.
    """
    return {"statement": DONATION_LEGAL_COPY}


@router.get("/plans")
async def list_plans():
    """Donations-only — no tiers, no plans, no perks.

    a0p is a research instrument. There is nothing to buy. The endpoint
    exists so the /pricing page can render the donation prompt and the
    verbatim 501c3 / $500 disclosure copy from a single source of truth.
    There is intentionally no "Free" plan object — every signed-in user
    already has full console access; surfacing a "Free" tier here would
    falsely imply a paid tier exists alongside it.
    """
    return {
        "tiers": [
            {
                "name": "Donation",
                "product_key": "donation",
                "amount_min_cents": DONATION_MIN_CENTS,
                "description": (
                    "One-off contribution to keep the instrument running. "
                    "Buys no perks, no tier, no unlock — pure support."
                ),
                "legal_copy": DONATION_LEGAL_COPY,
            },
        ],
        "legal_copy": DONATION_LEGAL_COPY,
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


class DonateBody(BaseModel):
    amount_cents: int
    return_url: Optional[str] = None


@router.post("/donate")
async def create_donation(body: DonateBody, request: Request):
    """One-off donation to support the research instrument.

    A donation buys NOTHING — no tier change, no transcript unlock, no perks.
    It is purely contribution. Free-tier upload quota stays as it is for
    everyone whether or not they donate. (Task #110 retired the
    donation-unlocks-uploads paywall logic that contradicted the
    research-instrument framing.)
    """
    uid = _user_id(request)
    if not uid:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if not STRIPE_SECRET_KEY:
        raise HTTPException(status_code=503, detail="Stripe not configured")
    if body.amount_cents < DONATION_MIN_CENTS:
        raise HTTPException(
            status_code=400,
            detail=f"Minimum donation is ${DONATION_MIN_CENTS / 100:.2f}",
        )

    stripe.api_key = STRIPE_SECRET_KEY
    origin = request.headers.get("origin") or "https://a0p.replit.app"
    return_url = body.return_url or f"{origin}{_DONATION_RETURN_PATH}"

    async with engine.connect() as conn:
        row = await conn.execute(
            text("SELECT email, stripe_customer_id FROM users WHERE id = :id"),
            {"id": uid},
        )
        rec = row.mappings().first()

    customer_id = rec["stripe_customer_id"] if rec else None
    user_email = rec["email"] if rec else None

    session_kwargs: dict = {
        "ui_mode": "embedded",
        "return_url": return_url,
        "mode": "payment",
        "line_items": [
            {
                "price_data": {
                    "currency": "usd",
                    "product_data": {
                        "name": "a0p donation",
                        "description": (
                            "Supports the research instrument. No perks, no "
                            "tier change, no unlocks — pure contribution."
                        ),
                    },
                    "unit_amount": body.amount_cents,
                },
                "quantity": 1,
            }
        ],
        "metadata": {
            "user_id": uid,
            "product_key": "donation",
            "amount_cents": str(body.amount_cents),
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

    return await _process_event_idempotent(event)


async def _process_event_idempotent(event: dict) -> dict:
    """Claim → dispatch → release pipeline shared by the public Stripe
    webhook (after signature verification) and the internal contract-test
    surface (which skips signature verification).

    Returns ``{"received": True}`` on first dispatch and
    ``{"received": True, "duplicate": True}`` on replay of an event id
    already processed.
    """
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


# Note: there is intentionally NO HTTP surface that bypasses Stripe
# signature verification. An earlier draft added an /internal/test-webhook
# endpoint gated by the x-a0p-internal middleware, but Express injects
# that header on every public /api request — so the endpoint would have
# been reachable from the internet through the proxy, allowing forged
# billing events. The idempotency contract is instead exercised by
# importing _process_event_idempotent directly from
# python/tests/contracts/billing.py, which has no HTTP surface and
# cannot be triggered remotely.


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
    elif etype == "charge.refunded":
        # Refund of an explainer pack purchase reverses the paid credit
        # grant. Resolve the original user via PaymentIntent → Checkout
        # Session so a refund issued from the Stripe dashboard (which
        # lacks our metadata) still routes back to the right user.
        await _handle_charge_refunded(event["data"]["object"])


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
    # The /checkout endpoint that created Supporter sessions has been
    # removed (Task #110). However, a Supporter checkout that the user
    # opened *before* the cutover can still complete after deploy. When
    # that happens we honor the in-flight session: record the
    # customer/subscription ids and set tier='supporter' so subsequent
    # webhook events (subscription.updated / .deleted) that match on
    # subscription_tier='supporter' route to the correct rows. The
    # /checkout endpoint stays gone — no NEW supporter sessions can be
    # created from this codebase.
    # product_key == "donation" is intentionally a no-op on user
    # state: donations buy nothing.
    if product_key == "supporter" and subscription_id:
        updates["subscription_tier"] = "supporter"
        updates["subscription_status"] = "active"

    if updates:
        safe = {k: v for k, v in updates.items() if k in _ALLOWED_USER_COLS}
        if safe:
            set_clause = ", ".join(f"{k} = :{k}" for k in safe)
            safe["uid"] = uid
            async with engine.begin() as conn:
                await conn.execute(text(f"UPDATE users SET {set_clause} WHERE id = :uid"), safe)

    # Explainer pack: $50 = 3 explanations. We re-derive pack count from
    # the session amount as defense-in-depth so a metadata edit in the
    # Stripe dashboard can't mint free credits.
    if product_key == "explainer_pack":
        try:
            packs_meta = int(sess.get("metadata", {}).get("packs", 1) or 1)
        except (TypeError, ValueError):
            packs_meta = 1
        amount_total = int(sess.get("amount_total") or 0)
        # Reject mismatched amounts to defeat metadata tampering.
        expected_cents = packs_meta * 5000
        if amount_total and amount_total != expected_cents:
            print(
                f"[billing] explainer_pack amount mismatch: "
                f"got {amount_total}c, expected {expected_cents}c (packs={packs_meta}). "
                f"Trusting amount over metadata."
            )
            packs_meta = max(1, amount_total // 5000)
        from ..storage import storage as _storage
        await _storage.add_explanation_credits(uid, packs=packs_meta)


async def _handle_subscription_updated(sub: dict) -> None:
    """Track status on legacy supporter subscriptions only.

    Task #110 retired the Supporter tier. We still process status
    updates for in-flight subscriptions so the user's portal view stays
    accurate, but we no longer (re-)promote anyone TO 'supporter' here
    — the status column is updated, the tier column is not touched.
    """
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
                SET subscription_status = :status
                WHERE stripe_customer_id = :cid AND subscription_tier = 'supporter'
            """),
            {"status": status, "cid": customer_id},
        )


async def _handle_subscription_deleted(sub: dict) -> None:
    """Drop legacy Supporter subscribers back to free on cancel.

    The Supporter tier is retired (Task #110) but existing subscribers
    were left untouched until they cancel via the Stripe portal. When
    that cancellation arrives, downgrade to free + mark canceled.
    """
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


async def _handle_charge_refunded(charge: dict) -> None:
    """Reverse paid credits when an explainer-pack charge is refunded.

    Stripe's `charge.refunded` event arrives whenever a charge transitions
    to refunded — full or partial. We compute pack-equivalents from the
    refunded amount (rounded down: a partial refund of <$50 yields zero
    pack reversal so users keep the credits they were already debited for).

    Resolution path: charge → payment_intent → checkout.session via
    Stripe API lookup. The session's metadata.user_id + metadata.product_key
    is what we trust — never the charge's customer alone, since charges
    don't carry our app-side metadata.
    """
    if not STRIPE_SECRET_KEY:
        return
    stripe.api_key = STRIPE_SECRET_KEY

    pi_id = charge.get("payment_intent")
    if not pi_id:
        return
    try:
        sessions = stripe.checkout.Session.list(payment_intent=pi_id, limit=1)
    except Exception as exc:
        print(f"[billing] charge.refunded: lookup failed for pi={pi_id}: {exc}")
        return
    if not sessions.data:
        return
    sess = sessions.data[0]
    metadata = sess.get("metadata") or {}
    if metadata.get("product_key") != "explainer_pack":
        # Refund of a donation or supporter charge — no credit reversal.
        return
    uid = metadata.get("user_id")
    if not uid:
        return

    refunded = int(charge.get("amount_refunded") or 0)
    packs = refunded // 5000
    if packs <= 0:
        return
    from ..storage import storage as _storage
    await _storage.remove_explanation_credits(uid, packs=packs)


@router.post("/explainer-checkout")
async def explainer_checkout(request: Request):
    """Create an embedded Stripe Checkout session for one explainer pack.

    Owner-only (any signed-in user). Returns ``{client_secret}`` for the
    embedded checkout flow — the same pattern the donation endpoint uses,
    so the frontend renders it via @stripe/stripe-js's
    EmbeddedCheckoutProvider.
    """
    uid = _user_id(request)
    if not uid:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if not STRIPE_SECRET_KEY:
        raise HTTPException(status_code=503, detail="Stripe not configured")
    stripe.api_key = STRIPE_SECRET_KEY

    body = await request.json() if request.headers.get("content-type", "").startswith("application/json") else {}
    return_url = body.get("return_url") if isinstance(body, dict) else None
    origin = request.headers.get("origin") or "https://a0p.replit.app"
    if not return_url:
        return_url = f"{origin}/transcripts?explainer_checkout=success"

    async with engine.connect() as conn:
        row = await conn.execute(
            text("SELECT email, stripe_customer_id FROM users WHERE id = :id"),
            {"id": uid},
        )
        rec = row.mappings().first()

    customer_id = rec["stripe_customer_id"] if rec else None
    user_email = rec["email"] if rec else None

    session_kwargs: dict = {
        "ui_mode": "embedded",
        "return_url": return_url,
        "mode": "payment",
        "line_items": [
            {
                "price_data": {
                    "currency": "usd",
                    "product_data": {
                        "name": "EDCMbone explanation pack",
                        "description": (
                            "3 model-written EDCMbone explanations "
                            "(~$16.67 each, ~1 minute of Erin's time per shot)."
                        ),
                    },
                    "unit_amount": 5000,
                },
                "quantity": 1,
            }
        ],
        "metadata": {
            "user_id": uid,
            "product_key": "explainer_pack",
            "packs": "1",
        },
    }
    if customer_id:
        session_kwargs["customer"] = customer_id
    elif user_email:
        session_kwargs["customer_email"] = user_email

    session = stripe.checkout.Session.create(**session_kwargs)
    return {"client_secret": session.client_secret}


# === CONTRACTS ===
# id: billing_webhook_replay_idempotent
#   given: same Stripe event id POSTed twice to the webhook (via the
#          internal test surface to bypass HMAC verification)
#   then:  first call returns {received: True}; replay returns
#          {received: True, duplicate: True}; _dispatch_webhook runs at
#          most once per event id (processed_stripe_events claim is
#          atomic)
#   class: idempotency
#   call:  python.tests.contracts.billing.test_webhook_replay_is_idempotent
# === END CONTRACTS ===
# 368:258
