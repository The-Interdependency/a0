# 252:69
# N:M
"""run_inference_with_mode — orchestration entry point that fans aimmh-lib's
multi-model primitives over the existing energy provider call path.

Mode contract:
  single             — single provider, full tool loop (existing path)
  fan_out            — parallel call to N providers; no tool loop
  council            — N providers respond, then each synthesizes
  daisy_chain        — sequential A → B → C, each builds on the last
  room_all           — shared room, all models see each other across rounds
  room_synthesized   — N respond, synthesizer combines, drives next round

Tool filtering happens via cut_modes.tools_for_cut_mode at the edges; the
multi-model patterns themselves do not invoke tools (they're text-only).

NO silent fallback: an unknown mode raises ValueError naming the bad mode;
a missing provider id raises RuntimeError naming the provider.
"""
import time
from typing import Any, Optional

from .run_logger import get_run_logger
from .cut_modes import tools_for_cut_mode
from .energy_registry import (
    energy_registry, resolve_providers, get_multi_model_hub,
    reset_per_call_usage,
)
from . import orch_progress as _op


_VALID_MODES = (
    "single", "fan_out", "council", "daisy_chain",
    "room_all", "room_synthesized",
)


def _flatten_user_text(messages: list[dict]) -> str:
    """Concatenate the trailing user-role content blocks into a single prompt."""
    chunks: list[str] = []
    for m in reversed(messages):
        if m.get("role") != "user":
            if chunks:
                break
            continue
        c = m.get("content")
        if isinstance(c, str):
            chunks.append(c)
        elif isinstance(c, list):
            for part in c:
                if isinstance(part, dict) and part.get("type") in ("text", "input_text"):
                    chunks.append(part.get("text") or "")
    return "\n\n".join(reversed([c for c in chunks if c]))


def _emit_provider_response(
    provider: str, usage: Optional[dict], elapsed_ms: int,
) -> None:
    """Emit a provider_response run-log event with the real per-voice usage
    captured from the underlying provider call. usage=None means the call
    failed or the provider returned no usage dict — we report it honestly
    (missing_usage=True) instead of fabricating numbers from a char heuristic."""
    logger = get_run_logger()
    try:
        if not usage:
            logger.emit("provider_response", {
                "provider": provider,
                "prompt_tokens": None,
                "completion_tokens": None,
                "cache_hit_tokens": None,
                "cost_usd_estimate": None,
                "elapsed_ms": elapsed_ms,
                "missing_usage": True,
            })
            return
        cb = energy_registry.cache_breakdown(usage)
        cost = energy_registry.estimate_cost(
            provider,
            cb.get("fresh_input", 0),
            cb.get("output", 0),
            cb.get("cache_read", 0),
            cb.get("cache_write", 0),
        )
        logger.emit("provider_response", {
            "provider": provider,
            "prompt_tokens": cb.get("fresh_input", 0),
            "completion_tokens": cb.get("output", 0),
            "cache_hit_tokens": cb.get("cache_read", 0),
            "cost_usd_estimate": round(float(cost), 6),
            "elapsed_ms": elapsed_ms,
        })
    except Exception:
        pass


def _serialize_results(results: list[Any]) -> list[dict]:
    """Convert aimmh ModelResult objects into JSON-safe dicts for transport."""
    out: list[dict] = []
    for r in results:
        out.append({
            "model": getattr(r, "model", ""),
            "content": getattr(r, "content", ""),
            "elapsed_ms": getattr(r, "response_time_ms", 0),
            "round_num": getattr(r, "round_num", 0),
            "step_num": getattr(r, "step_num", 0),
            "role": getattr(r, "role", "player"),
            "slot_idx": getattr(r, "slot_idx", 0),
            "error": getattr(r, "error", None),
        })
    return out


def _attach_per_voice_usage(
    serialized: list[dict], usage_state: dict,
) -> None:
    """Merge per-call usage dicts captured by _aimmh_call_fn into each
    serialized response card.

    Keying is `(model_id, call_idx)` — the call_idx is a per-model counter
    assigned by _aimmh_call_fn at call START (see energy_registry doc), so
    two calls returning identical text from the same model still attribute
    usage to the right card. We reconstruct each result's call_idx by its
    per-model occurrence position in `serialized` (0-based).

    Why per-model occurrence is reliable:
      - aimmh's serialized result list orders calls by hub round (and by
        slot position within a round). For any single model, calls happen
        strictly sequentially across rounds (round R+1 awaits round R), so
        the i-th appearance of a given model in `serialized` corresponds
        to the i-th call_idx _aimmh_call_fn assigned for that model.

    Honest errors:
      - error path: usage stays None, cost_usd stays None — the UI hides
        badges rather than render "0 tok / $0.00" on a failed call.
      - provider returned no usage dict: same — None, never zero.
      - no captured entry for (model, call_idx): same — surfaces missing
        attribution rather than fabricating numbers.
    """
    by_key = usage_state.get("by_key", {}) if usage_state else {}
    seen_count: dict[str, int] = {}
    for entry in serialized:
        entry["usage"] = None
        entry["cost_usd"] = None
        model = entry.get("model")
        # Reserve this entry's per-model occurrence index BEFORE the error
        # short-circuit so a failed call still consumes its slot — that
        # keeps subsequent successful calls from this same model aligned
        # with their captured (model, call_idx) entries.
        call_idx = seen_count.get(model, 0)
        seen_count[model] = call_idx + 1
        entry["call_idx"] = call_idx
        if entry.get("error"):
            continue
        rec = by_key.get((model, call_idx))
        if rec is None:
            continue
        raw_usage = rec.get("usage")
        if not raw_usage:
            continue
        cb = energy_registry.cache_breakdown(raw_usage)
        cost = energy_registry.estimate_cost(
            model,
            cb.get("fresh_input", 0),
            cb.get("output", 0),
            cb.get("cache_read", 0),
            cb.get("cache_write", 0),
        )
        entry["usage"] = {
            "input_tokens": cb.get("fresh_input", 0),
            "output_tokens": cb.get("output", 0),
            "cache_read_input_tokens": cb.get("cache_read", 0),
            "cache_creation_input_tokens": cb.get("cache_write", 0),
            "total_tokens": (
                cb.get("fresh_input", 0)
                + cb.get("cache_read", 0)
                + cb.get("cache_write", 0)
                + cb.get("output", 0)
            ),
        }
        entry["cost_usd"] = round(float(cost), 6)


def _aggregate_voice_usage(serialized: list[dict]) -> dict:
    """Sum per-voice usage into a single message-level usage shape so the
    aggregate token pill (chat-messages.tsx tokenCount) and cache_breakdown
    reflect the true total spent on this multi-model turn.

    Anthropic-style fields (input_tokens = fresh-only) are used so
    cache_breakdown can normalize back to the same numbers without
    subtracting cache_read twice."""
    fi = cr = cw = out = 0
    cost = 0.0
    counted = 0
    for entry in serialized:
        u = entry.get("usage")
        if not u:
            continue
        counted += 1
        fi += int(u.get("input_tokens") or 0)
        cr += int(u.get("cache_read_input_tokens") or 0)
        cw += int(u.get("cache_creation_input_tokens") or 0)
        out += int(u.get("output_tokens") or 0)
        c = entry.get("cost_usd")
        if c is not None:
            cost += float(c)
    return {
        "input_tokens": fi,
        "output_tokens": out,
        "cache_read_input_tokens": cr,
        "cache_creation_input_tokens": cw,
        "total_tokens": fi + cr + cw + out,
        "cost_usd": round(cost, 6),
        "voices_with_usage": counted,
    }


def _summarize_results(results: list[Any]) -> str:
    """Render a single readable transcript so the UI's existing markdown
    bubble path still has a sensible string when no special renderer fires."""
    lines: list[str] = []
    for r in results:
        prov = getattr(r, "model", "?")
        step = getattr(r, "step_num", 0)
        role = getattr(r, "role", "player")
        head = f"### {prov}"
        if step == -1 or role == "synthesizer":
            head += " (synthesis)"
        elif step == 1 and role == "council":
            head += " (council synthesis)"
        body = getattr(r, "content", "") or ""
        lines.append(f"{head}\n\n{body.strip()}")
    return "\n\n---\n\n".join(lines)


async def run_inference_with_mode(
    messages: list[dict],
    orchestration_mode: str = "single",
    providers: Optional[list[str]] = None,
    cut_mode: str = "soft",
    user_id: Optional[str] = None,
    system_prompt: Optional[str] = None,
    rounds: int = 1,
) -> tuple[str, dict]:
    """Top-level orchestration dispatch.

    Returns (content, usage). For multi-model modes `usage` carries a
    `responses` list of per-provider dicts so the UI can render side-by-side
    cards without re-running the orchestration.
    """
    if orchestration_mode not in _VALID_MODES:
        raise ValueError(
            f"orchestration_mode must be one of {_VALID_MODES}, "
            f"got {orchestration_mode!r}"
        )

    resolved = resolve_providers(providers)
    if not resolved:
        raise RuntimeError(
            f"run_inference_with_mode: no providers resolved from {providers!r}. "
            "Set the active provider via energy_registry or pass an explicit list."
        )

    # Tool filtering: the chat path that takes the single branch already
    # consults the registry; we only need to surface the filtered list to
    # callers that pass it through.
    try:
        from .tool_executor import TOOL_SCHEMAS_CHAT as _ALL_TOOLS
        _filtered = tools_for_cut_mode(cut_mode, list(_ALL_TOOLS))
    except Exception:
        _filtered = None

    if orchestration_mode == "single":
        from .inference import call_energy_provider
        provider = resolved[0]
        t0 = time.perf_counter()
        content, usage = await call_energy_provider(
            provider_id=provider,
            messages=messages,
            system_prompt=system_prompt,
            user_id=user_id,
            use_tools=bool(_filtered) if _filtered is not None else True,
        )
        elapsed_ms = int((time.perf_counter() - t0) * 1000)
        try:
            cb = energy_registry.cache_breakdown(usage)
            logger = get_run_logger()
            logger.emit("provider_response", {
                "provider": provider,
                "prompt_tokens": cb.get("fresh_input", 0),
                "completion_tokens": cb.get("output", 0),
                "cache_hit_tokens": cb.get("cache_read", 0),
                "cost_usd_estimate": round(float(energy_registry.estimate_cost(
                    provider, cb.get("fresh_input", 0), cb.get("output", 0),
                    cb.get("cache_read", 0), cb.get("cache_write", 0),
                )), 6),
                "elapsed_ms": elapsed_ms,
            })
        except Exception:
            pass
        usage = dict(usage or {})
        usage["orchestration_mode"] = "single"
        usage["providers"] = [provider]
        return content, usage

    hub = get_multi_model_hub()
    prompt = _flatten_user_text(messages) or "(no prompt)"

    # Init the per-call usage bucket BEFORE invoking the hub. _aimmh_call_fn
    # appends one entry per provider call into this list (ContextVar-scoped
    # so concurrent route handlers cannot collide).
    usage_bucket = reset_per_call_usage()

    # Pre-render hint for the live UI: providers + rounds before any call_start.
    _op.publish("orchestration_start", {
        "orchestration_mode": orchestration_mode,
        "providers": list(resolved),
        "rounds": int(rounds),
    })

    if orchestration_mode == "fan_out":
        results = await hub.fan_out(resolved, messages)
    elif orchestration_mode == "daisy_chain":
        results = await hub.daisy_chain(resolved, prompt, rounds=rounds)
    elif orchestration_mode == "room_all":
        results = await hub.room_all(resolved, prompt, rounds=rounds)
    elif orchestration_mode == "room_synthesized":
        synth = resolved[0]
        players = resolved[1:] if len(resolved) > 1 else resolved
        results = await hub.room_synthesized(players, prompt, synth, rounds=rounds)
    elif orchestration_mode == "council":
        results = await hub.council(resolved, prompt, rounds=rounds)
    else:
        raise ValueError(f"unhandled mode {orchestration_mode!r}")

    serialized = _serialize_results(results)
    _attach_per_voice_usage(serialized, usage_bucket)

    for entry in serialized:
        _emit_provider_response(
            entry.get("model") or "?",
            # Re-hydrate the raw provider usage shape from the per-voice
            # cb-style numbers we attached. cache_breakdown handles either
            # shape, so feeding it back is safe and keeps a single code path.
            entry.get("usage"),
            int(entry.get("elapsed_ms") or 0),
        )

    agg = _aggregate_voice_usage(serialized)
    usage = {
        "orchestration_mode": orchestration_mode,
        "providers": resolved,
        "responses": serialized,
        "rounds": rounds,
        **agg,
    }
    return _summarize_results(results), usage
# N:M
# 252:69
