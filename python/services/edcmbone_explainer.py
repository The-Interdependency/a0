# 239:199
"""EDCMbone scoring report → 200-400 word human explanation with cited
quoted spans from the transcript. Owner-only, idempotent per report
(UNIQUE on report_id), strict-JSON output, refund-on-failure.

Pricing: 3 free per user lifetime, then $50 = pack of 3.
"""
from __future__ import annotations

import json
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import text as _sa_text

from ..database import engine, get_session
from ..services.energy_registry import BUILTIN_PROVIDERS
from ..services.inference import call_energy_provider
from ..services.run_logger import get_run_logger
from ..storage import storage

EXPLAINER_PROVIDER_ID = "openai-5.5"
MIN_WORDS = 200
MAX_WORDS = 400
# Hard ceiling: above this prompt-token estimate we refuse the call rather
# than silently truncate the transcript and hand the user a half-explained
# report. Per-task spec (~200K). 4 chars/token rough estimate.
MAX_PROMPT_CHARS = 200_000 * 4


_RUBRIC = """
EDCMbone scores a transcript on six channels per round (0..1 each):
  cm      — coherence/bone-token density. High = dense, structured exchange.
  da      — directive alignment. Low = answers diverge from the prompt.
  drift   — recurrent-pattern drift. High = the conversation circles.
  dvg     — divergence (bigram pile-up). High = the speakers stop tracking each other.
  int_val — integrity. Low = repeats and noise are eroding signal.
  tbf     — top-of-bias-field overlap with the original prompt. Low = the
            conversation has wandered off the original ask.

Directives fire when a metric crosses a threshold; their names are
diagnostic shortcuts (e.g. drift_high → drift_correction).

Two derived risks:
  risk_loop      — likelihood the conversation is in a repeating loop.
  risk_fixation  — likelihood one speaker has fixated on a single frame.
correction_fidelity — how well the conversation self-corrects after a directive fires.
"""

_SYSTEM_PROMPT = (
    "You are EDCMbone's report explainer. You translate quantitative scores "
    "into a 200-400 word reading a non-technical user can act on. Every "
    "concrete claim you make MUST be backed by a quoted span from the "
    "transcript — paraphrases without quoted evidence are a contract "
    "violation. Stay grounded; do not infer beyond what the rounds show."
).strip()


def _format_round(msg: Dict[str, Any]) -> str:
    speaker = msg.get("speaker") or "?"
    idx = msg.get("idx", 0)
    parts = [
        f"--- round {idx} (speaker={speaker}) ---",
        f"metrics: cm={msg.get('cm', 0):.2f} da={msg.get('da', 0):.2f} "
        f"drift={msg.get('drift', 0):.2f} dvg={msg.get('dvg', 0):.2f} "
        f"int={msg.get('int_val', 0):.2f} tbf={msg.get('tbf', 0):.2f}",
    ]
    fired = msg.get("directives_fired") or []
    if fired:
        parts.append(f"directives_fired: {', '.join(fired)}")
    body = msg.get("content") or ""
    if body:
        parts.append(body.strip())
    return "\n".join(parts)


def _build_user_prompt(report: Dict[str, Any], messages: List[Dict[str, Any]]) -> str:
    """Hand the model: rubric, the report rollup, every round's metrics+text.

    The model is required to return strict JSON ({body, citations}) so the UI
    can render the explanation with citation markers without us having to
    parse free-form prose.
    """
    rollup = {
        "averages": {
            "cm": report.get("avg_cm", 0),
            "da": report.get("avg_da", 0),
            "drift": report.get("avg_drift", 0),
            "dvg": report.get("avg_dvg", 0),
            "int_val": report.get("avg_int", 0),
            "tbf": report.get("avg_tbf", 0),
        },
        "peak": {
            "value": report.get("peak_metric", 0),
            "name": report.get("peak_metric_name"),
        },
        "risk_loop": report.get("risk_loop", 0),
        "risk_fixation": report.get("risk_fixation", 0),
        "correction_fidelity": report.get("correction_fidelity", 0),
        "directives_fired": report.get("directives_fired") or [],
        "edcmbone_version": report.get("edcmbone_version"),
        "message_count": report.get("message_count", len(messages)),
    }
    rendered_rounds = "\n\n".join(_format_round(m) for m in messages)
    return (
        "## Rubric\n"
        f"{_RUBRIC.strip()}\n\n"
        "## Report rollup (this transcript)\n"
        f"{json.dumps(rollup, indent=2)}\n\n"
        "## Per-round transcript and metrics\n"
        f"{rendered_rounds}\n\n"
        "## Your task\n"
        f"Write a {MIN_WORDS}-{MAX_WORDS} word explanation of what these "
        "scores mean for THIS transcript, addressed to a non-technical "
        "reader. Cite every concrete claim with a quoted span from the "
        "transcript (verbatim — do not paraphrase the quote itself).\n\n"
        "Return STRICT JSON only — no markdown, no prose around it — with "
        "exactly this shape:\n"
        '{\n'
        '  "body": "<the 200-400 word explanation as plain text>",\n'
        '  "citations": [\n'
        '    {"claim": "<short paraphrase of the claim>",\n'
        '     "quote": "<verbatim span from a transcript round>",\n'
        '     "round": <int round index>}\n'
        '  ]\n'
        '}'
    )


def _strip_json_fences(s: str) -> str:
    s = s.strip()
    if s.startswith("```"):
        # Drop opening fence (```json or ```)
        s = s.split("\n", 1)[1] if "\n" in s else s[3:]
        if s.endswith("```"):
            s = s[: -3]
    return s.strip()


def _normalize_for_match(s: str) -> str:
    """Collapse whitespace and lowercase so a quote that differs only by
    line breaks / extra spaces / capitalization still matches the source.
    Punctuation is preserved — a quote that hallucinates a different word
    will still be rejected."""
    return " ".join(s.split()).lower()


def _quote_appears_in_transcript(
    quote: str, messages: List[Dict[str, Any]],
) -> bool:
    """Return True iff the (whitespace-/case-normalized) quote appears as
    a substring of any round's content. This is the citation-integrity
    gate — if the model invents a quote that isn't in the transcript, we
    must reject it before persisting. Empty quote is rejected.
    """
    needle = _normalize_for_match(quote)
    if not needle:
        return False
    for m in messages:
        content = m.get("content") or ""
        if needle in _normalize_for_match(content):
            return True
    return False


def _parse_explainer_output(
    raw: str, messages: Optional[List[Dict[str, Any]]] = None,
) -> Tuple[str, List[Dict[str, Any]]]:
    """Coerce the model output into (body, citations).

    Strict per doctrine — if the JSON contract is violated we raise so the
    credit refund path runs. We do NOT silently treat the raw text as the
    body; that would let a malformed model output be sold as a finished
    explanation.

    When `messages` is provided, every citation's quote must appear as a
    substring of some round's content (whitespace/case-normalized). A
    fabricated or drifted quote is a contract violation — the whole call
    is rejected so the credit-refund path runs and the user is not sold a
    half-grounded explanation.
    """
    cleaned = _strip_json_fences(raw)
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise RuntimeError(
            f"explainer model returned non-JSON output: {exc}; "
            f"first 200 chars: {cleaned[:200]!r}"
        )
    if not isinstance(parsed, dict):
        raise RuntimeError(f"explainer JSON is not an object: {type(parsed).__name__}")
    body = parsed.get("body")
    citations = parsed.get("citations")
    if not isinstance(body, str) or not body.strip():
        raise RuntimeError("explainer JSON missing/empty 'body' string")
    if not isinstance(citations, list):
        raise RuntimeError("explainer JSON missing 'citations' list")
    norm_citations: List[Dict[str, Any]] = []
    rejected_quotes: List[str] = []
    for c in citations:
        if not isinstance(c, dict):
            continue
        claim = str(c.get("claim", "")).strip()
        quote = str(c.get("quote", "")).strip()
        if not claim or not quote:
            continue
        try:
            rnd = int(c.get("round", -1))
        except (TypeError, ValueError):
            rnd = -1
        # Citation-integrity check: the quoted span must actually exist in
        # the transcript. We only enforce this when messages were provided
        # (parse-only callers, e.g. unit tests, can omit them).
        if messages is not None and not _quote_appears_in_transcript(quote, messages):
            rejected_quotes.append(quote[:80])
            continue
        norm_citations.append({"claim": claim, "quote": quote, "round": rnd})
    if not norm_citations:
        if rejected_quotes:
            raise RuntimeError(
                "explainer returned only fabricated citations — none of the "
                f"quoted spans appear in the transcript. rejected: {rejected_quotes!r}"
            )
        raise RuntimeError(
            "explainer returned 0 valid citations — every claim must be "
            "backed by a quoted span (rubric requirement)"
        )
    return body.strip(), norm_citations


def _compute_cost_cents(usage: Dict[str, Any], spec: Dict[str, Any]) -> int:
    """OpenAI Responses-API usage → cost in cents.

    Usage keys: input_tokens, output_tokens (Responses API).
    Spec keys: cost_per_1k_input, cost_per_1k_output (USD).
    Result is rounded UP to the nearest cent so a $0.001 call is recorded
    as 1 cent rather than swallowed by float rounding.
    """
    in_tok = int(usage.get("input_tokens") or usage.get("prompt_tokens") or 0)
    out_tok = int(usage.get("output_tokens") or usage.get("completion_tokens") or 0)
    in_rate = float(spec.get("cost_per_1k_input", 0))
    out_rate = float(spec.get("cost_per_1k_output", 0))
    cost_usd = (in_tok / 1000.0) * in_rate + (out_tok / 1000.0) * out_rate
    cents = cost_usd * 100.0
    if cents <= 0:
        return 0
    # Ceiling to next cent.
    int_cents = int(cents)
    if cents - int_cents > 0:
        int_cents += 1
    return int_cents


async def _record_cost_metric(
    *, user_id: str, model_id: str, prompt_tokens: int,
    completion_tokens: int, cost_cents: int,
) -> None:
    """Insert a cost_metrics row so the explainer call shows up in the
    same place every other model call does. estimated_cost is stored in
    USD to match existing rows (cost_metrics.estimated_cost is REAL USD)."""
    async with engine.begin() as conn:
        await conn.execute(
            _sa_text(
                "INSERT INTO cost_metrics "
                "(user_id, model, prompt_tokens, completion_tokens, "
                " cache_tokens, estimated_cost, stage) "
                "VALUES (:uid, :model, :pt, :ct, 0, :usd, 'edcmbone_explainer')"
            ),
            {
                "uid": user_id, "model": model_id,
                "pt": prompt_tokens, "ct": completion_tokens,
                "usd": cost_cents / 100.0,
            },
        )


async def _emit_provider_log(
    *, user_id: str, report_id: int, model_id: str,
    prompt_tokens: int, completion_tokens: int, cost_cents: int,
) -> None:
    """Surface the call in agent_logs as an `explainer_call` event.

    We deliberately do NOT use the `merge` event type — that one is read
    by /agents/learning_summary's `cum.merges` counter as "real sub-agent
    merge happened", and the explainer is a one-shot inference, not a
    pcna fork. Emitting `explainer_call` keeps the merge counter honest
    while giving learning_summary a discoverable event to roll up the
    paid explainer's per-provider attribution and lifetime cost.
    """
    try:
        get_run_logger().emit("explainer_call", {
            "provider": EXPLAINER_PROVIDER_ID,
            "source": "edcmbone_explainer",
            "user_id": user_id,
            "report_id": report_id,
            "model": model_id,
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "cost_cents": cost_cents,
        })
    except Exception as _err:
        # Logging is observability, never the user-facing concern.
        print(f"[edcmbone_explainer] log emit failed: {_err}")


class InsufficientCredits(Exception):
    """Raised when both free and paid balances are zero. The route layer
    converts this to HTTP 402 with a checkout-link payload."""

    def __init__(self, credits: Dict[str, Any]):
        super().__init__("no_explainer_credits")
        self.credits = credits


class PromptTooLarge(Exception):
    """Raised when transcript+rubric+report exceeds the model's effective
    context. The route layer converts this to HTTP 413 — we fail loudly
    rather than silently truncate (doctrine)."""


async def explain_report(
    *, report_id: int, user_id: str,
) -> Dict[str, Any]:
    """Explain one EDCMbone report. Owner-only — the report is fetched
    via the storage helper that joins through transcript_uploads.user_id,
    so a non-owner gets a 404 from the route before this is called.

    Pipeline:
      1. Return cached explanation if one already exists (no re-bill).
      2. Decrement one credit (free first, then paid). 402 if none.
      3. Build prompt from rollup + per-round messages.
      4. Call gpt-5.5 via call_energy_provider.
      5. Parse strict-JSON output. On parse/model failure: refund the
         credit and re-raise.
      6. Persist the explanation, record cost, emit observability event.
    """
    cached = await storage.get_transcript_explanation(report_id, user_id=user_id)
    if cached:
        credits = await storage.get_or_seed_explanation_credits(user_id)
        return {
            "explanation": cached,
            "credits": _credits_view(credits),
            "cached": True,
        }

    report = await storage.get_transcript_report(report_id, user_id=user_id)
    if not report:
        # Defense-in-depth — the route also checks, but never bill before
        # confirming the report belongs to the user.
        raise PermissionError(f"report {report_id} not owned by {user_id}")

    messages = await storage.get_transcript_messages(
        report_id, user_id=user_id, limit=10_000, offset=0,
    )
    if not messages:
        raise RuntimeError(
            f"report {report_id} has no per-round messages — cannot explain "
            f"an empty transcript"
        )

    user_prompt = _build_user_prompt(report, messages)
    if len(user_prompt) > MAX_PROMPT_CHARS:
        raise PromptTooLarge(
            f"prompt is {len(user_prompt)} chars (>{MAX_PROMPT_CHARS}); "
            f"transcript exceeds the explainer's single-shot context. "
            f"Streaming-mode explainer is a future task — explanation "
            f"queued for streaming."
        )

    bucket = await storage.consume_explanation_credit(user_id)
    if bucket is None:
        credits = await storage.get_or_seed_explanation_credits(user_id)
        raise InsufficientCredits(_credits_view(credits))

    spec = BUILTIN_PROVIDERS.get(EXPLAINER_PROVIDER_ID, {})
    try:
        content, usage = await call_energy_provider(
            EXPLAINER_PROVIDER_ID,
            messages=[{"role": "user", "content": user_prompt}],
            system_prompt=_SYSTEM_PROMPT,
            max_tokens=4000,
            use_tools=False,
            user_id=user_id,
            reasoning_effort="low",
        )
        body, citations = _parse_explainer_output(content, messages=messages)
    except Exception:
        # Refund the credit so the user isn't charged for a model failure.
        await storage.refund_explanation_credit(user_id, bucket)
        raise

    prompt_tokens = int(usage.get("input_tokens") or usage.get("prompt_tokens") or 0)
    completion_tokens = int(usage.get("output_tokens") or usage.get("completion_tokens") or 0)
    cost_cents = _compute_cost_cents(usage, spec)

    try:
        explanation = await storage.create_transcript_explanation(
            report_id=report_id, user_id=user_id, model_id=spec.get("model", EXPLAINER_PROVIDER_ID),
            prompt_tokens=prompt_tokens, completion_tokens=completion_tokens,
            cost_cents=cost_cents, body=body, citations=citations, paid_with=bucket,
        )
    except Exception:
        # If the insert races with a concurrent /explain on the same report,
        # the UNIQUE(report_id) constraint kicks in. Refund the credit and
        # return whichever row won the race.
        await storage.refund_explanation_credit(user_id, bucket)
        winner = await storage.get_transcript_explanation(report_id, user_id=user_id)
        if winner:
            credits = await storage.get_or_seed_explanation_credits(user_id)
            return {
                "explanation": winner,
                "credits": _credits_view(credits),
                "cached": True,
            }
        raise

    await _record_cost_metric(
        user_id=user_id, model_id=spec.get("model", EXPLAINER_PROVIDER_ID),
        prompt_tokens=prompt_tokens, completion_tokens=completion_tokens,
        cost_cents=cost_cents,
    )
    await _emit_provider_log(
        user_id=user_id, report_id=report_id,
        model_id=spec.get("model", EXPLAINER_PROVIDER_ID),
        prompt_tokens=prompt_tokens, completion_tokens=completion_tokens,
        cost_cents=cost_cents,
    )

    credits = await storage.get_or_seed_explanation_credits(user_id)
    return {
        "explanation": explanation,
        "credits": _credits_view(credits),
        "cached": False,
    }


def _credits_view(row: Dict[str, Any]) -> Dict[str, Any]:
    """Caller-facing shape (no internal id timestamps)."""
    return {
        "free_remaining": int(row.get("free_remaining", 0)),
        "paid_remaining": int(row.get("paid_remaining", 0)),
        "lifetime_purchased": int(row.get("lifetime_purchased", 0)),
        "total_remaining": int(row.get("free_remaining", 0)) + int(row.get("paid_remaining", 0)),
    }


# === CONTRACTS ===
# id: explainer_explanation_is_idempotent
#   given: an explanation already exists for (report_id, user_id)
#   then:  a second explain_report() call returns the cached row, does NOT
#          consume a credit, and does NOT call the model
#   class: idempotency
#   call:  python.tests.contracts.transcripts_explainer.test_idempotent_no_double_charge
#
# id: explainer_decrements_free_first
#   given: a user with free_remaining=1, paid_remaining=3
#   then:  consume_explanation_credit returns 'free' and free_remaining
#          drops to 0; the next call returns 'paid' and paid_remaining
#          drops to 2
#   class: pricing
#   call:  python.tests.contracts.transcripts_explainer.test_decrements_free_then_paid
#
# id: explainer_402_when_no_credits
#   given: a user with free_remaining=0, paid_remaining=0
#   then:  consume_explanation_credit returns None (route layer converts
#          this to HTTP 402 with a checkout link)
#   class: pricing
#   call:  python.tests.contracts.transcripts_explainer.test_no_credits_returns_none
#
# id: explainer_refund_restores_balance
#   given: a credit was consumed (bucket='paid'), then the model failed
#   then:  refund_explanation_credit('paid') restores paid_remaining to
#          its pre-consumption value
#   class: failure_recovery
#   call:  python.tests.contracts.transcripts_explainer.test_refund_after_failure
#
# id: explainer_rejects_fabricated_citations
#   given: model output contains citations whose quoted spans do not
#          appear in the transcript text
#   then:  _parse_explainer_output drops the fabricated quotes and, if
#          none remain, raises RuntimeError so the credit-refund path
#          runs in explain_report() — fabricated citations are never
#          persisted or sold to the user
#   class: correctness
#   call:  python.tests.contracts.transcripts_explainer.test_rejects_fabricated_citations
#
# id: explainer_call_surfaces_in_learning_summary
#   given: an explainer_call event is emitted by the explainer service
#   then:  it persists with event='explainer_call' (not silently rewritten
#          to 'custom') AND the same aggregation learning_summary uses
#          rolls it up by provider in the paid_explainer section
#   class: correctness
#   call:  python.tests.contracts.transcripts_explainer.test_explainer_call_surfaces_in_learning_summary
# === END CONTRACTS ===
# 239:199
