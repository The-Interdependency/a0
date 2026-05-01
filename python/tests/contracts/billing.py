# 23:16
"""Contracts protecting python/routes/billing.py.

The idempotency contract is proved by calling ``_process_event_idempotent``
directly via import — there is intentionally NO HTTP surface that skips
Stripe signature verification, because Express auto-injects
``x-a0p-internal`` on every proxied request and any such surface would
be remotely exploitable through the proxy.
"""
from __future__ import annotations
import time
import uuid


async def test_webhook_replay_is_idempotent() -> None:
    """Replaying the same Stripe event id returns duplicate=True; the
    handler dispatches at most once per event id."""
    # Imported lazily so module import doesn't trip on missing env at
    # parse time. _process_event_idempotent is a pure function over the
    # DB and the dispatch table; no HTTP, no signature verification, no
    # remote attack surface.
    from python.routes.billing import _process_event_idempotent

    event_id = f"evt_ctest_{uuid.uuid4().hex[:16]}"
    # Use an unhandled event type so _dispatch_webhook is a no-op
    # (the dispatcher only branches on a known whitelist). This isolates
    # the test from real billing side-effects.
    event = {
        "id": event_id,
        "type": "test.contract.unhandled.event",
        "data": {"object": {"id": f"obj_{uuid.uuid4().hex[:12]}"}},
        "created": int(time.time()),
    }

    r1 = await _process_event_idempotent(event)
    assert r1.get("received") is True, f"unexpected first response: {r1!r}"
    assert r1.get("duplicate") in (False, None), (
        f"first delivery shouldn't report duplicate: {r1!r}"
    )

    r2 = await _process_event_idempotent(event)
    assert r2.get("received") is True, f"unexpected replay response: {r2!r}"
    assert r2.get("duplicate") is True, (
        f"replay must report duplicate=true; got {r2!r} — "
        f"processed_stripe_events claim is broken"
    )
# 23:16
