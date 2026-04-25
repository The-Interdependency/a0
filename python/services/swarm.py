# 223:90
"""swarm — schema-validated parallel fan-out with confidence-gated escalation.

Sidecar to aimmh-lib. Written against the aimmh CallFn contract
(`async (model_id, messages) -> str`) so the two primitives in this file
can be lifted upstream into aimmh_lib/swarm.py without API change. The
mirror copy intended for upstream lives at .local/aimmh-lib-upstream/.

Why a sidecar: aimmh-lib v1.1.0 ships the conversation primitives
(fan_out, council, daisy_chain, ...) but no structured-output primitive.
a0p needs it now for "sort N items into K buckets" workflows where a
chat orchestration mode would be the wrong shape (chat is messages→str;
swarm is items+schema→rows).

Two primitives:

  call_with_schema(call, model, messages, validate, retries=2)
      One CallFn invocation that must return JSON parseable into a dict
      that passes the validator. Retries on parse / validate failure
      with a lightly nudged "your last response was invalid: ..." user
      turn. After `retries` failures raises SchemaCallError naming the
      last failure mode. NEVER returns silent garbage.

  swarm(call, model, items, render_prompt, validate, *, batch_size,
        concurrency, critic=None, confidence_key='confidence',
        confidence_threshold=0.6, progress_cb=None)
      Parallel batched fan-out. Each batch produces N validated rows.
      Rows whose confidence < threshold (or whose batch hit
      SchemaCallError after retries) are routed to the optional critic
      CallFn for individual re-evaluation. Returns the full ordered
      list of rows aligned 1:1 with input `items`.

Both functions are pure async, depend only on stdlib + aimmh_lib types,
and emit no a0p-specific concepts. The progress_cb is the only seam
where a0p wires run_logger.emit; aimmh-lib never learns what an
agent_run is.

NO silent fallback policy:
  - Schema failure after retries → SchemaCallError naming the validator
    message and the offending raw text head.
  - Critic disagreement is recorded on the row (`escalated=True`,
    `critic_model=...`); the caller decides what to do, this module
    does not silently overwrite producer output without marking it.
"""
from __future__ import annotations

import asyncio
import json
import re
import time
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Optional

# aimmh CallFn signature: async (model_id, messages) -> str
CallFn = Callable[[str, list[dict]], Awaitable[str]]

# A validator raises ValueError with a human-readable reason on bad input.
Validator = Callable[[dict], None]

# Optional progress hook. Receives ("event_kind", payload_dict).
# Caller wires this to run_logger.emit or any other observability sink.
ProgressCb = Optional[Callable[[str, dict], None]]


class SchemaCallError(RuntimeError):
    """Raised when a CallFn cannot be coerced to a valid schema'd dict
    after the configured retry budget. Carries `last_text` for debugging.
    """
    def __init__(self, message: str, last_text: str = "") -> None:
        super().__init__(message)
        self.last_text = last_text


@dataclass
class SwarmRow:
    """One validated swarm output, aligned by `index` with the input items."""
    index: int
    model: str
    data: dict
    confidence: float = 1.0
    escalated: bool = False
    critic_model: Optional[str] = None
    error: Optional[str] = None
    elapsed_ms: int = 0


# ---------------------------------------------------------------------------
# call_with_schema
# ---------------------------------------------------------------------------

_JSON_FENCE_RE = re.compile(r"^\s*```(?:json)?\s*|\s*```\s*$", re.MULTILINE)


def _extract_json(raw: str) -> dict:
    """Best-effort JSON extraction. Strips code fences, takes first {...}
    block if the model wrapped its output in prose. Raises ValueError on
    anything that isn't a top-level dict."""
    text = _JSON_FENCE_RE.sub("", raw or "").strip()
    if not text:
        raise ValueError("empty response")
    try:
        obj = json.loads(text)
    except json.JSONDecodeError:
        first = text.find("{")
        last = text.rfind("}")
        if first == -1 or last == -1 or last <= first:
            raise ValueError(f"no JSON object found in response: {text[:120]!r}")
        try:
            obj = json.loads(text[first : last + 1])
        except json.JSONDecodeError as e:
            raise ValueError(f"JSON parse failed: {e.msg}") from e
    if not isinstance(obj, dict):
        raise ValueError(f"expected JSON object at top level, got {type(obj).__name__}")
    return obj


async def call_with_schema(
    call: CallFn,
    model: str,
    messages: list[dict],
    validate: Validator,
    retries: int = 2,
) -> dict:
    """Invoke `call` and return a validated dict, or raise SchemaCallError.

    The validator must raise ValueError with a human-readable reason on
    invalid input. On failure we add a corrective user turn and retry.
    Retries=2 means up to three total calls (initial + 2 retries).
    """
    last_text = ""
    last_err = ""
    convo = list(messages)
    for attempt in range(retries + 1):
        try:
            raw = await call(model, convo)
        except Exception as e:
            raw = f"[ERROR] {e}"
        last_text = raw
        if isinstance(raw, str) and raw.startswith("[ERROR]"):
            last_err = raw
        else:
            try:
                obj = _extract_json(raw)
                validate(obj)
                return obj
            except ValueError as e:
                last_err = str(e)
        if attempt < retries:
            convo = list(messages) + [
                {"role": "assistant", "content": last_text},
                {
                    "role": "user",
                    "content": (
                        "Your previous response was rejected: "
                        f"{last_err}. Reply with ONLY a valid JSON object that "
                        "satisfies the schema. No prose, no code fences."
                    ),
                },
            ]
    raise SchemaCallError(
        f"call_with_schema({model}) failed after {retries + 1} attempts: {last_err}",
        last_text=last_text,
    )


# ---------------------------------------------------------------------------
# swarm
# ---------------------------------------------------------------------------

ItemRenderer = Callable[[list[Any]], list[dict]]
"""Render a batch of items into the messages list for one CallFn invocation.

Returning the messages (not just the user content) lets callers attach a
fixed system prompt that benefits from prefix caching."""


def _validate_batch_response(obj: dict, expected_n: int) -> list[dict]:
    """Batch responses must contain a `rows` array of length expected_n."""
    rows = obj.get("rows")
    if not isinstance(rows, list):
        raise ValueError("response missing `rows` array")
    if len(rows) != expected_n:
        raise ValueError(
            f"response had {len(rows)} rows, expected {expected_n}"
        )
    for i, r in enumerate(rows):
        if not isinstance(r, dict):
            raise ValueError(f"row {i} is not an object")
    return rows


async def swarm(
    call: CallFn,
    model: str,
    items: list[Any],
    render_prompt: ItemRenderer,
    validate_row: Validator,
    *,
    batch_size: int = 10,
    concurrency: int = 8,
    critic: Optional[tuple[CallFn, str]] = None,
    confidence_key: str = "confidence",
    confidence_threshold: float = 0.6,
    progress_cb: ProgressCb = None,
) -> list[SwarmRow]:
    """Parallel batched classification with confidence-gated escalation.

    Args:
      call: aimmh CallFn for the producer model (the cheap tier).
      model: model id passed to `call`.
      items: input items aligned by index with the returned rows.
      render_prompt: maps a batch (list of items) to messages. The
        responder must return JSON `{"rows": [{...}, {...}]}` with
        len(rows) == len(batch). Use `confidence_key` (default
        "confidence") on each row, value in [0, 1].
      validate_row: raises ValueError if a row is structurally invalid.
        This is *per-row* validation; batch-shape validation is built in.
      batch_size: items per CallFn invocation. Tune to context window.
      concurrency: max concurrent batches. Sized to provider TPM, not CPU.
      critic: optional (CallFn, model_id) for per-item re-evaluation when
        confidence < threshold or batch hit SchemaCallError. Critic
        receives one item at a time, must return the same row shape.
      confidence_key: name of the confidence field on each row.
      confidence_threshold: rows with confidence below this go to critic.
      progress_cb: optional sink for ("batch_complete", {...}) and
        ("escalated", {...}) events. Wire to run_logger.emit if desired.

    Returns:
      list[SwarmRow] aligned 1:1 with `items`.
    """
    if not items:
        return []
    if batch_size < 1:
        raise ValueError(f"batch_size must be >= 1, got {batch_size}")
    if concurrency < 1:
        raise ValueError(f"concurrency must be >= 1, got {concurrency}")

    sem = asyncio.Semaphore(concurrency)
    results: list[Optional[SwarmRow]] = [None] * len(items)
    batches: list[tuple[int, list[Any]]] = []
    for start in range(0, len(items), batch_size):
        batches.append((start, items[start : start + batch_size]))

    async def _run_batch(start: int, batch: list[Any]) -> None:
        async with sem:
            t0 = time.monotonic()
            messages = render_prompt(batch)
            try:
                obj = await call_with_schema(
                    call, model, messages,
                    validate=lambda o: _validate_batch_response(o, len(batch)),
                    retries=2,
                )
                rows = obj["rows"]
                for offset, row in enumerate(rows):
                    idx = start + offset
                    try:
                        validate_row(row)
                        conf = float(row.get(confidence_key, 1.0))
                    except (ValueError, TypeError) as e:
                        results[idx] = SwarmRow(
                            index=idx, model=model, data=row,
                            confidence=0.0, error=f"row validation: {e}",
                        )
                        continue
                    results[idx] = SwarmRow(
                        index=idx, model=model, data=row,
                        confidence=conf,
                        elapsed_ms=int((time.monotonic() - t0) * 1000),
                    )
            except SchemaCallError as e:
                # Whole batch failed schema validation after retries.
                # Mark each item as needing escalation.
                for offset in range(len(batch)):
                    idx = start + offset
                    results[idx] = SwarmRow(
                        index=idx, model=model, data={},
                        confidence=0.0,
                        error=f"batch schema failure: {e}",
                        elapsed_ms=int((time.monotonic() - t0) * 1000),
                    )
            if progress_cb:
                try:
                    progress_cb("batch_complete", {
                        "model": model,
                        "start": start,
                        "size": len(batch),
                        "elapsed_ms": int((time.monotonic() - t0) * 1000),
                    })
                except Exception:
                    pass

    await asyncio.gather(*(_run_batch(s, b) for s, b in batches))

    # Escalation pass.
    if critic is not None:
        critic_call, critic_model = critic
        escalation_targets = [
            r for r in results
            if r is not None and (
                r.error is not None or r.confidence < confidence_threshold
            )
        ]
        if escalation_targets:
            if progress_cb:
                try:
                    progress_cb("escalation_start", {
                        "critic_model": critic_model,
                        "count": len(escalation_targets),
                    })
                except Exception:
                    pass

            async def _re_eval(row: SwarmRow) -> None:
                async with sem:
                    messages = render_prompt([items[row.index]])
                    try:
                        obj = await call_with_schema(
                            critic_call, critic_model, messages,
                            validate=lambda o: _validate_batch_response(o, 1),
                            retries=2,
                        )
                        new_row = obj["rows"][0]
                        validate_row(new_row)
                        row.data = new_row
                        row.confidence = float(new_row.get(confidence_key, 1.0))
                        row.error = None
                        row.escalated = True
                        row.critic_model = critic_model
                    except (SchemaCallError, ValueError, TypeError) as e:
                        row.escalated = True
                        row.critic_model = critic_model
                        row.error = (row.error or "") + f"; critic failed: {e}"

            await asyncio.gather(*(_re_eval(r) for r in escalation_targets))

    # Any None rows at this point are a bug — fail loudly rather than return
    # silent garbage. (NO silent fallback policy.)
    missing = [i for i, r in enumerate(results) if r is None]
    if missing:
        raise RuntimeError(
            f"swarm: {len(missing)} rows never populated (indices: {missing[:5]}...). "
            "This is a bug in swarm itself; report it."
        )
    return results  # type: ignore[return-value]


__all__ = [
    "CallFn",
    "Validator",
    "ProgressCb",
    "SchemaCallError",
    "SwarmRow",
    "call_with_schema",
    "swarm",
]
# 223:90
