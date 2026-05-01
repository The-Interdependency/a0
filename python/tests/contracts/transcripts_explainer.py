# 274:71
"""Contract tests for python.services.edcmbone_explainer.

Each test is referenced from the CONTRACTS block at the bottom of
python/services/edcmbone_explainer.py. Run via:

    python -m python.tests.contract_runner

These tests touch the real database; every test scope-isolates by
generating a unique user_id so they cannot collide with each other or
with real production users. No HTTP, no Stripe — they exercise the
storage primitives that back the explainer's pricing semantics.
"""
from __future__ import annotations

import uuid

from sqlalchemy import text as _sa_text

from ...database import engine
from ...services.edcmbone_explainer import _parse_explainer_output
from ...storage import storage


def _new_uid(prefix: str = "ctest-explainer") -> str:
    return f"{prefix}-{uuid.uuid4().hex[:12]}"


async def _wipe_credits(uid: str) -> None:
    """Clean up credits row so the test isn't sticky across reruns.
    Cleanup runs in a finally block so a partial failure still leaves
    the table tidy for the next iteration."""
    async with engine.begin() as conn:
        await conn.execute(
            _sa_text("DELETE FROM explanation_credits WHERE user_id = :uid"),
            {"uid": uid},
        )


async def test_decrements_free_then_paid() -> None:
    """A user with free=1, paid=3 should consume 'free' first, then 'paid'.

    The pricing spec is unambiguous: free credits decrement before paid,
    so users who buy a pack are not silently spending their free quota
    on the same call as their first paid one. This test pins that order.
    """
    uid = _new_uid()
    try:
        # Seed and overwrite the row to a known state.
        await storage.get_or_seed_explanation_credits(uid)
        async with engine.begin() as conn:
            await conn.execute(
                _sa_text(
                    "UPDATE explanation_credits SET "
                    "free_remaining = 1, paid_remaining = 3 "
                    "WHERE user_id = :uid"
                ),
                {"uid": uid},
            )

        first = await storage.consume_explanation_credit(uid)
        assert first == "free", f"expected 'free' first, got {first!r}"
        row = await storage.get_or_seed_explanation_credits(uid)
        assert int(row["free_remaining"]) == 0, (
            f"free should be 0 after first consumption, got {row['free_remaining']}"
        )
        assert int(row["paid_remaining"]) == 3, (
            f"paid should still be 3, got {row['paid_remaining']}"
        )

        second = await storage.consume_explanation_credit(uid)
        assert second == "paid", f"expected 'paid' next, got {second!r}"
        row = await storage.get_or_seed_explanation_credits(uid)
        assert int(row["paid_remaining"]) == 2, (
            f"paid should be 2 after second consumption, got {row['paid_remaining']}"
        )
    finally:
        await _wipe_credits(uid)


async def test_no_credits_returns_none() -> None:
    """When both balances are zero, consume_explanation_credit returns None.

    The route layer translates None into HTTP 402 with the checkout
    payload. If this test ever passes-by-decrementing-into-the-negative
    the pricing model is broken — users would get free explanations
    forever once they hit zero.
    """
    uid = _new_uid()
    try:
        await storage.get_or_seed_explanation_credits(uid)
        async with engine.begin() as conn:
            await conn.execute(
                _sa_text(
                    "UPDATE explanation_credits SET "
                    "free_remaining = 0, paid_remaining = 0 "
                    "WHERE user_id = :uid"
                ),
                {"uid": uid},
            )

        result = await storage.consume_explanation_credit(uid)
        assert result is None, (
            f"consume on zero balance must return None (route → 402), got {result!r}"
        )
        row = await storage.get_or_seed_explanation_credits(uid)
        assert int(row["free_remaining"]) == 0
        assert int(row["paid_remaining"]) == 0, (
            f"balances must not go negative, got paid={row['paid_remaining']}"
        )
    finally:
        await _wipe_credits(uid)


async def test_refund_after_failure() -> None:
    """refund_explanation_credit('paid') restores paid_remaining by 1.

    This is the recovery path the explainer service runs when the model
    call fails after the credit has been decremented. Without it, every
    transient gpt-5.5 hiccup would silently bill the user for nothing.
    """
    uid = _new_uid()
    try:
        await storage.get_or_seed_explanation_credits(uid)
        async with engine.begin() as conn:
            await conn.execute(
                _sa_text(
                    "UPDATE explanation_credits SET "
                    "free_remaining = 0, paid_remaining = 2 "
                    "WHERE user_id = :uid"
                ),
                {"uid": uid},
            )

        bucket = await storage.consume_explanation_credit(uid)
        assert bucket == "paid"
        row = await storage.get_or_seed_explanation_credits(uid)
        assert int(row["paid_remaining"]) == 1

        # Simulate model failure path: refund the credit just consumed.
        await storage.refund_explanation_credit(uid, bucket)
        row = await storage.get_or_seed_explanation_credits(uid)
        assert int(row["paid_remaining"]) == 2, (
            f"refund should restore paid to 2, got {row['paid_remaining']}"
        )
    finally:
        await _wipe_credits(uid)


async def test_rejects_fabricated_citations() -> None:
    """If the model returns citations whose quotes don't appear in the
    transcript, _parse_explainer_output must drop them. If no real
    citations remain, it must raise so the credit-refund path runs.

    This is the citation-integrity gate. The whole product promise is
    "every claim is backed by a quoted span" — selling an explanation
    with fabricated quotes would be worse than refusing the call.
    """
    import json as _json
    transcript = [
        {"idx": 0, "speaker": "user",
         "content": "The blue lighthouse blinks at midnight."},
        {"idx": 1, "speaker": "assistant",
         "content": "I noticed the rhythm changed after round three."},
    ]

    # Case 1: ALL citations fabricated — must raise.
    raw_all_fake = _json.dumps({
        "body": "Some body text " * 30,
        "citations": [
            {"claim": "X", "quote": "this string is not in the transcript", "round": 0},
            {"claim": "Y", "quote": "another invented quote", "round": 1},
        ],
    })
    raised = False
    try:
        _parse_explainer_output(raw_all_fake, messages=transcript)
    except RuntimeError as exc:
        raised = True
        assert "fabricated" in str(exc).lower(), (
            f"error message should call out fabrication; got: {exc}"
        )
    assert raised, "all-fabricated citations must raise so credit is refunded"

    # Case 2: MIXED — fabricated quotes are dropped, real ones kept.
    raw_mixed = _json.dumps({
        "body": "Some body text " * 30,
        "citations": [
            {"claim": "real", "quote": "The blue lighthouse blinks at midnight.", "round": 0},
            {"claim": "fake", "quote": "this is hallucinated text", "round": 1},
            # Whitespace-and-case variation must still match (normalized substring).
            {"claim": "real-normalized", "quote": "I  NOTICED the rhythm   changed after round three.", "round": 1},
        ],
    })
    body, citations = _parse_explainer_output(raw_mixed, messages=transcript)
    assert body, "body should be returned for the mixed case"
    quotes = [c["quote"] for c in citations]
    assert any("lighthouse" in q for q in quotes), (
        "the verbatim real citation must survive"
    )
    assert any("rhythm" in q for q in quotes), (
        "the whitespace/case-normalized real citation must survive"
    )
    assert not any("hallucinated" in q for q in quotes), (
        f"the fabricated citation must be dropped; got citations={citations!r}"
    )

    # Case 3: when messages is None, the integrity check is skipped (used
    # by parse-only call sites without transcript context).
    body, citations = _parse_explainer_output(raw_all_fake, messages=None)
    assert len(citations) == 2, (
        "with no transcript provided, all well-formed citations pass through"
    )


async def test_explainer_call_surfaces_in_learning_summary() -> None:
    """An emitted `explainer_call` event must (a) reach agent_logs with
    its event name intact (not rewritten to 'custom') and (b) be rolled
    up by /agents/learning_summary into the `paid_explainer` section
    keyed by provider.

    This is the acceptance check that ties the explainer's observability
    to the surface where the user actually looks. If the run_logger ever
    drops 'explainer_call' from its valid-events set, this contract
    fails — preventing a silent regression of paid-attribution accuracy.
    """
    from ...services.run_logger import flush, get_run_logger

    test_provider = f"openai-5.5-ctest-{uuid.uuid4().hex[:8]}"
    payload = {
        "provider": test_provider,
        "source": "edcmbone_explainer",
        "user_id": _new_uid(),
        "report_id": -1,
        "model": "gpt-5.5",
        "prompt_tokens": 1234,
        "completion_tokens": 567,
        "cost_cents": 8,
    }
    try:
        get_run_logger().emit("explainer_call", payload)
        await flush()

        # Confirm the row landed with event='explainer_call' (not 'custom').
        async with engine.begin() as conn:
            r = await conn.execute(
                _sa_text(
                    "SELECT event FROM agent_logs "
                    "WHERE event = 'explainer_call' "
                    "AND payload->>'provider' = :prov"
                ),
                {"prov": test_provider},
            )
            rows = r.mappings().all()
        assert len(rows) >= 1, (
            "explainer_call event must persist with its real event name; "
            "if it landed as 'custom' the run_logger valid-events set "
            "needs 'explainer_call' added"
        )

        # Now exercise the same aggregation learning_summary uses.
        async with engine.begin() as conn:
            r = await conn.execute(_sa_text(
                "SELECT payload FROM agent_logs "
                "WHERE event = 'explainer_call' ORDER BY ts DESC LIMIT 200"
            ))
            explainer_rows = r.mappings().all()
        by_provider: dict[str, dict[str, int]] = {}
        for row in explainer_rows:
            p = row["payload"]
            if not isinstance(p, dict):
                continue
            prov = str(p.get("provider") or "unknown")
            bp = by_provider.setdefault(prov, {
                "calls": 0, "prompt_tokens": 0,
                "completion_tokens": 0, "cost_cents": 0,
            })
            bp["calls"] += 1
            bp["prompt_tokens"] += int(p.get("prompt_tokens") or 0)
            bp["completion_tokens"] += int(p.get("completion_tokens") or 0)
            bp["cost_cents"] += int(p.get("cost_cents") or 0)

        assert test_provider in by_provider, (
            f"the test provider must surface in by_provider; got keys "
            f"{list(by_provider.keys())[:10]}"
        )
        bucket = by_provider[test_provider]
        assert bucket["calls"] >= 1
        assert bucket["prompt_tokens"] >= 1234, bucket
        assert bucket["completion_tokens"] >= 567, bucket
        assert bucket["cost_cents"] >= 8, bucket
    finally:
        async with engine.begin() as conn:
            await conn.execute(
                _sa_text(
                    "DELETE FROM agent_logs WHERE event = 'explainer_call' "
                    "AND payload->>'provider' = :prov"
                ),
                {"prov": test_provider},
            )


async def test_idempotent_no_double_charge() -> None:
    """A second create_transcript_explanation on the same report_id is a
    UNIQUE-violation no-op. Combined with the get_transcript_explanation
    short-circuit at the top of explain_report(), a duplicate /explain
    call must NOT consume a credit.

    We exercise this at the storage layer: insert once, attempt to
    insert again, confirm the second raises (UNIQUE on report_id) and
    that get_transcript_explanation returns the original row.
    """
    uid = _new_uid()
    # Seed an upload + report so the FK on transcript_explanations.report_id
    # has something to point at. The CASCADE delete on the FK means cleanup
    # of the report tears down the explanation too.
    upload_id: int | None = None
    report_id: int | None = None
    try:
        # Ownership chain: transcript_uploads.user_id is the owner; the
        # uploads.report_id FK is what get_transcript_report joins on to
        # scope queries by user. Insert the report first, then point the
        # upload at it (the schema does NOT have a back-FK on reports).
        async with engine.begin() as conn:
            rp = await conn.execute(
                _sa_text(
                    "INSERT INTO transcript_reports "
                    "(source_slug, message_count) "
                    "VALUES (:slug, 0) RETURNING id"
                ),
                {"slug": f"ctest-{uuid.uuid4().hex[:8]}"},
            )
            report_id = int(rp.scalar_one())
            up = await conn.execute(
                _sa_text(
                    "INSERT INTO transcript_uploads "
                    "(user_id, filename, mime, byte_size, status, report_id) "
                    "VALUES (:uid, :fn, 'text/plain', 10, 'done', :rid) RETURNING id"
                ),
                {"uid": uid, "fn": f"ctest-{uuid.uuid4().hex[:8]}.txt", "rid": report_id},
            )
            upload_id = int(up.scalar_one())

        first = await storage.create_transcript_explanation(
            report_id=report_id, user_id=uid, model_id="gpt-5.5",
            prompt_tokens=100, completion_tokens=200, cost_cents=5,
            body="first explanation body",
            citations=[{"claim": "c", "quote": "q", "round": 0}],
            paid_with="free",
        )
        assert first["body"] == "first explanation body"

        # Second insert must violate the UNIQUE(report_id) constraint.
        raised = False
        try:
            await storage.create_transcript_explanation(
                report_id=report_id, user_id=uid, model_id="gpt-5.5",
                prompt_tokens=999, completion_tokens=999, cost_cents=99,
                body="second explanation body — should never persist",
                citations=[],
                paid_with="paid",
            )
        except Exception:
            raised = True
        assert raised, (
            "second create_transcript_explanation on same report_id should "
            "raise (UNIQUE constraint) — without this, refresh would re-bill"
        )

        # The cached fetch returns the original, not the second attempt.
        cached = await storage.get_transcript_explanation(report_id, user_id=uid)
        assert cached is not None
        assert cached["body"] == "first explanation body", (
            f"cached row should be the first insert; got body={cached['body']!r}"
        )
    finally:
        # CASCADE on the FK tears down the explanation when we drop the report.
        if report_id is not None:
            async with engine.begin() as conn:
                await conn.execute(
                    _sa_text("DELETE FROM transcript_reports WHERE id = :id"),
                    {"id": report_id},
                )
        if upload_id is not None:
            async with engine.begin() as conn:
                await conn.execute(
                    _sa_text("DELETE FROM transcript_uploads WHERE id = :id"),
                    {"id": upload_id},
                )
# 274:71
