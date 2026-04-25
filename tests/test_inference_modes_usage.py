# 143:23
# DOC module: tests.inference_modes_usage
# DOC label: Per-voice usage attach + aggregate (task 99)
# DOC description: Verifies that _attach_per_voice_usage matches captured
# usage to serialized response cards by (model, content), hides badges on
# the error path, and that _aggregate_voice_usage sums correctly without
# double-counting cache reads.
import pytest

from python.services.inference_modes import (
    _attach_per_voice_usage, _aggregate_voice_usage,
)


def _voice(model, content, error=None):
    return {
        "model": model, "content": content, "error": error,
        "elapsed_ms": 0, "round_num": 0, "step_num": 0,
        "role": "player", "slot_idx": 0,
    }


def _state(*entries):
    """Build a usage_state matching the energy_registry shape from a flat
    list of (model_id, call_idx, content, usage) tuples."""
    by_key = {}
    counters: dict = {}
    for model_id, call_idx, content, usage in entries:
        by_key[(model_id, call_idx)] = {
            "model_id": model_id, "call_idx": call_idx,
            "content": content, "usage": usage,
        }
        counters[model_id] = max(counters.get(model_id, 0), call_idx + 1)
    return {"by_key": by_key, "counters": counters}


def test_attach_matches_by_model_and_call_idx():
    serialized = [
        _voice("openai", "hello"),
        _voice("claude", "world"),
    ]
    state = _state(
        ("claude", 0, "world",
         {"input_tokens": 10, "output_tokens": 5,
          "cache_read_input_tokens": 2}),
        ("openai", 0, "hello",
         {"prompt_tokens": 100, "completion_tokens": 25}),
    )
    _attach_per_voice_usage(serialized, state)
    assert serialized[0]["usage"]["input_tokens"] == 100
    assert serialized[0]["usage"]["output_tokens"] == 25
    assert serialized[0]["call_idx"] == 0
    assert serialized[0]["cost_usd"] is not None
    assert serialized[1]["usage"]["input_tokens"] == 10
    assert serialized[1]["usage"]["output_tokens"] == 5
    assert serialized[1]["usage"]["cache_read_input_tokens"] == 2
    assert serialized[1]["call_idx"] == 0


def test_attach_hides_badges_on_error_path():
    serialized = [_voice("openai", "[ERROR] boom", error="boom")]
    state = _state(("openai", 0, "[ERROR] boom", None))
    _attach_per_voice_usage(serialized, state)
    assert serialized[0]["usage"] is None
    assert serialized[0]["cost_usd"] is None


def test_attach_missing_usage_stays_none_not_zero():
    serialized = [_voice("openai", "hi")]
    state = _state(("openai", 0, "hi", None))
    _attach_per_voice_usage(serialized, state)
    assert serialized[0]["usage"] is None
    assert serialized[0]["cost_usd"] is None


def test_attach_council_two_rounds_per_model_in_order():
    """Council mode: same provider responds twice with different content.
    Per-model occurrence index in the result list must align with call_idx
    assigned at call START in _aimmh_call_fn."""
    serialized = [
        _voice("openai", "round 1"),
        _voice("openai", "synthesis"),
    ]
    state = _state(
        ("openai", 0, "round 1",
         {"prompt_tokens": 50, "completion_tokens": 10}),
        ("openai", 1, "synthesis",
         {"prompt_tokens": 200, "completion_tokens": 80}),
    )
    _attach_per_voice_usage(serialized, state)
    assert serialized[0]["usage"]["input_tokens"] == 50
    assert serialized[0]["usage"]["output_tokens"] == 10
    assert serialized[0]["call_idx"] == 0
    assert serialized[1]["usage"]["input_tokens"] == 200
    assert serialized[1]["usage"]["output_tokens"] == 80
    assert serialized[1]["call_idx"] == 1


def test_attach_same_model_identical_content_distinct_usage():
    """Regression: two calls to the same model returning the EXACT same
    string but with different usage must each get their own usage attached.
    The old content-matching approach would have collided on the duplicate
    text; (model, call_idx) keying does not."""
    serialized = [
        _voice("openai", "ok"),
        _voice("openai", "ok"),
    ]
    state = _state(
        ("openai", 0, "ok", {"prompt_tokens": 11, "completion_tokens": 2}),
        ("openai", 1, "ok", {"prompt_tokens": 999, "completion_tokens": 7}),
    )
    _attach_per_voice_usage(serialized, state)
    assert serialized[0]["usage"]["input_tokens"] == 11
    assert serialized[0]["usage"]["output_tokens"] == 2
    assert serialized[1]["usage"]["input_tokens"] == 999
    assert serialized[1]["usage"]["output_tokens"] == 7
    # Distinct cost reflects distinct usage — proves no cross-attribution.
    assert serialized[0]["cost_usd"] != serialized[1]["cost_usd"]


def test_attach_error_consumes_its_slot():
    """If a call fails, the corresponding ModelResult has error=set. It
    must still consume its per-model occurrence slot so the NEXT successful
    call from that same model lines up with its captured usage."""
    serialized = [
        _voice("openai", "[ERROR] boom", error="boom"),
        _voice("openai", "real answer"),
    ]
    state = _state(
        ("openai", 0, "[ERROR] boom", None),
        ("openai", 1, "real answer",
         {"prompt_tokens": 80, "completion_tokens": 20}),
    )
    _attach_per_voice_usage(serialized, state)
    assert serialized[0]["usage"] is None
    assert serialized[0]["call_idx"] == 0
    assert serialized[1]["usage"]["input_tokens"] == 80
    assert serialized[1]["usage"]["output_tokens"] == 20
    assert serialized[1]["call_idx"] == 1


def test_aggregate_sums_without_double_counting():
    serialized = [
        {"model": "openai", "content": "a", "error": None,
         "usage": {"input_tokens": 100, "output_tokens": 25,
                   "cache_read_input_tokens": 50,
                   "cache_creation_input_tokens": 0,
                   "total_tokens": 175},
         "cost_usd": 0.002},
        {"model": "claude", "content": "b", "error": None,
         "usage": {"input_tokens": 80, "output_tokens": 40,
                   "cache_read_input_tokens": 0,
                   "cache_creation_input_tokens": 20,
                   "total_tokens": 140},
         "cost_usd": 0.005},
        {"model": "grok", "content": "[ERROR]", "error": "boom",
         "usage": None, "cost_usd": None},
    ]
    agg = _aggregate_voice_usage(serialized)
    assert agg["input_tokens"] == 180
    assert agg["output_tokens"] == 65
    assert agg["cache_read_input_tokens"] == 50
    assert agg["cache_creation_input_tokens"] == 20
    assert agg["total_tokens"] == 180 + 65 + 50 + 20
    assert agg["cost_usd"] == pytest.approx(0.007)
    assert agg["voices_with_usage"] == 2  # error voice excluded


def test_aggregate_round_trips_through_cache_breakdown():
    """The aggregate usage dict uses Anthropic-style fields so
    energy_registry.cache_breakdown — which the chat route calls on the
    final usage — reads back the same numbers without subtracting
    cache_read twice."""
    from python.services.energy_registry import energy_registry
    serialized = [
        {"model": "claude", "content": "x", "error": None,
         "usage": {"input_tokens": 200, "output_tokens": 50,
                   "cache_read_input_tokens": 75,
                   "cache_creation_input_tokens": 10,
                   "total_tokens": 335},
         "cost_usd": 0.01},
    ]
    agg = _aggregate_voice_usage(serialized)
    cb = energy_registry.cache_breakdown(agg)
    assert cb["fresh_input"] == 200
    assert cb["cache_read"] == 75
    assert cb["cache_write"] == 10
    assert cb["output"] == 50
# 143:23
