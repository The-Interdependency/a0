# 160:34
# N:M
"""EDCM service — delegates measurement math to edcmbone.

Refactored from the prior in-house heuristic computation. We retain the public
contract (METRIC_NAMES / DIRECTIVES / compute_metrics / check_directives /
delta_between) so all upstream callers (routes, snapshots, bandit
correlations, edcm_score tool) keep working unchanged. The actual math is
now performed by edcmbone — bone-token density, repetition / novelty ratios,
energy step / fixation / loop risks, and crosswalk projections live in the
package and are fully canon-versioned.

NO silent fallback: if edcmbone fails to import or compute, we raise so
callers see the real failure rather than a placeholder.
"""
import math
from typing import Any
from importlib.metadata import version as _pkg_version

import edcmbone
from edcmbone.parser import parse_transcript
from edcmbone.metrics.compute import compute_round, tokenize
from edcmbone.metrics.stats import (
    rep_ngram_density, repetition_ratio, novelty, ttr,
    correction_fidelity,
)
from edcmbone.metrics import risk as _risk_mod

EDCMBONE_VERSION = _pkg_version("edcmbone")

METRIC_NAMES = ["cm", "da", "drift", "dvg", "int_val", "tbf"]

THRESHOLDS = {
    "cm": 0.85, "da": 0.80, "drift": 0.30, "dvg": 0.25,
    "int_val": 0.70, "tbf": 0.60,
}

DIRECTIVES = {
    "cm_high": {"metric": "cm", "condition": "above", "threshold": 0.85, "action": "coherence_lock"},
    "da_low": {"metric": "da", "condition": "below", "threshold": 0.50, "action": "alignment_boost"},
    "drift_high": {"metric": "drift", "condition": "above", "threshold": 0.40, "action": "drift_correction"},
    "dvg_high": {"metric": "dvg", "condition": "above", "threshold": 0.35, "action": "divergence_dampen"},
    "int_low": {"metric": "int_val", "condition": "below", "threshold": 0.40, "action": "integrity_restore"},
    "tbf_low": {"metric": "tbf", "condition": "below", "threshold": 0.30, "action": "bias_recalibrate"},
}


def _clamp(v: float) -> float:
    if v < 0.0:
        return 0.0
    if v > 1.0:
        return 1.0
    return float(v)


def _build_transcript(responses: list[dict[str, Any]], context: str) -> str:
    """Synthesize a turn-tagged transcript edcmbone's parser will accept."""
    parts: list[str] = []
    if context:
        parts.append(f"USER: {context}")
    for i, r in enumerate(responses):
        speaker = (r.get("provider") or r.get("model") or f"agent_{i}").upper()
        parts.append(f"{speaker}: {r.get('content', '')}")
    return "\n".join(parts)


def compute_metrics(responses: list[dict[str, Any]], context: str = "") -> dict[str, float]:
    """Project edcmbone's RoundMetrics into our six-channel EDCM vector.

    Mapping (edcmbone -> a0p):
      cm      <- mean(novelty + ttr) capped — bone token density / vocabulary spread
      da      <- 1 - repetition_ratio — answer/directive alignment proxy
      drift   <- repetition_ratio — recurrent-pattern drift proxy
      dvg     <- rep_ngram_density(2) — divergence as bigram pile-up
      int_val <- 1 - rep_ngram_density(3) - 0.5*repetition_ratio
      tbf     <- jaccard-overlap of context vs concatenated responses
    """
    if not responses:
        return {m: 0.0 for m in METRIC_NAMES}
    texts = [r.get("content", "") for r in responses if r.get("content")]
    if not texts:
        return {m: 0.0 for m in METRIC_NAMES}
    joined = " ".join(texts)
    rep = repetition_ratio(joined)
    rng2 = rep_ngram_density(joined, n=2)
    rng3 = rep_ngram_density(joined, n=3)
    nov = novelty(joined, joined[: max(1, len(joined) // 2)])
    div = ttr(joined)
    cm = _clamp((nov + div) / 2.0)
    da = _clamp(1.0 - rep)
    drift = _clamp(rep)
    dvg = _clamp(rng2)
    int_val = _clamp(1.0 - rng3 - 0.5 * rep)
    tbf = 0.0
    if context:
        ctx_words = set(context.lower().split())
        resp_words = set(joined.lower().split())
        if ctx_words:
            tbf = _clamp(len(ctx_words & resp_words) / len(ctx_words))
    return {
        "cm": round(cm, 4), "da": round(da, 4), "drift": round(drift, 4),
        "dvg": round(dvg, 4), "int_val": round(int_val, 4), "tbf": round(tbf, 4),
    }


def check_directives(metrics: dict[str, float]) -> list[str]:
    fired: list[str] = []
    for name, d in DIRECTIVES.items():
        v = metrics.get(d["metric"], 0)
        if d["condition"] == "above" and v > d["threshold"]:
            fired.append(name)
        elif d["condition"] == "below" and v < d["threshold"]:
            fired.append(name)
    return fired


def delta_between(a: dict[str, float], b: dict[str, float]) -> dict[str, float]:
    return {f"delta_{m}": round(b.get(m, 0) - a.get(m, 0), 4) for m in METRIC_NAMES}


def edcmbone_round(transcript_text: str) -> dict[str, Any]:
    """Full edcmbone single-round metrics for advanced callers (Σ snapshots)."""
    parsed = parse_transcript(transcript_text)
    if not parsed.rounds:
        return {"edcmbone_version": EDCMBONE_VERSION, "rounds": 0}
    rm = compute_round(parsed.rounds[-1])
    return {
        "edcmbone_version": EDCMBONE_VERSION,
        "round_index": len(parsed.rounds) - 1,
        "metrics": getattr(rm, "__dict__", {}),
    }


def _round_text(rnd: Any) -> str:
    """Best-effort joined text for a parsed Round, agnostic to turn shape."""
    turns = getattr(rnd, "turns", None) or []
    parts: list[str] = []
    for t in turns:
        txt = getattr(t, "text", None) or getattr(t, "content", None)
        if txt:
            parts.append(str(txt))
    if parts:
        return " ".join(parts)
    # Fallback: reconstruct from tokens. Coerce to str — Round.all_tokens may be
    # BoneToken objects (which don't join cleanly).
    toks = getattr(rnd, "all_tokens", None) or []
    return " ".join(str(t) for t in toks)


def compute_transcript_full(text: str) -> dict[str, Any]:
    """Whole-transcript rollup using edcmbone.

    Returns averages + peak + risk + correction_fidelity + per-round detail.
    Raises ValueError on empty/unparseable input — no silent fallback.
    """
    if not text or not text.strip():
        raise ValueError("compute_transcript_full: empty text")
    parsed = parse_transcript(text)
    if not parsed.rounds:
        raise ValueError("compute_transcript_full: parser produced 0 rounds")

    per_round: list[dict[str, Any]] = []
    round_tokens: list[list[str]] = []
    for idx, rnd in enumerate(parsed.rounds):
        rtext = _round_text(rnd)
        # NOTE: Round.all_tokens returns BoneToken objects which break risk.cosine_sim
        # (BoneTokens are not orderable). Always re-tokenize to get plain strings.
        toks = list(tokenize(rtext))
        round_tokens.append(toks)
        responses = [{"provider": "round", "content": rtext}]
        m = compute_metrics(responses, "")
        m["round_index"] = idx
        m["directives_fired"] = check_directives(m)
        m["snippet"] = (rtext[:237] + "...") if len(rtext) > 240 else rtext
        m["token_count"] = len(toks)
        per_round.append(m)

    n = len(per_round)
    avgs = {f"avg_{name}": round(sum(r[name] for r in per_round) / n, 4) for name in METRIC_NAMES}
    avg_int = avgs.pop("avg_int_val")
    avgs["avg_int"] = avg_int  # storage column is named avg_int

    peak_name, peak_val = "", 0.0
    for r in per_round:
        for name in METRIC_NAMES:
            if r[name] > peak_val:
                peak_val, peak_name = r[name], name

    loop_risks: list[float] = []
    fixation_risks: list[float] = []
    correction_fids: list[float] = []
    for i in range(1, n):
        a, b = round_tokens[i - 1], round_tokens[i]
        if a and b:
            loop_risks.append(float(_risk_mod.loop_risk(a, b)))
            fixation_risks.append(float(_risk_mod.fixation_risk(b, a)))
    for i in range(2, n):
        a, b, c = round_tokens[i - 2], round_tokens[i - 1], round_tokens[i]
        if a and b and c:
            correction_fids.append(float(correction_fidelity(a, b, c)))

    def _avg(xs: list[float]) -> float:
        return round(sum(xs) / len(xs), 4) if xs else 0.0

    all_directives = sorted({d for r in per_round for d in r["directives_fired"]})
    # Top snippets: highest peak metric value across the round
    ranked = sorted(per_round, key=lambda r: max(r[m] for m in METRIC_NAMES), reverse=True)
    top_snippets = [
        {"round": r["round_index"], "snippet": r["snippet"],
         "peak": round(max(r[m] for m in METRIC_NAMES), 4)}
        for r in ranked[:5]
    ]

    return {
        "edcmbone_version": EDCMBONE_VERSION,
        "message_count": n,
        **avgs,
        "peak_metric": round(peak_val, 4),
        "peak_metric_name": peak_name,
        "risk_loop": _avg(loop_risks),
        "risk_fixation": _avg(fixation_risks),
        "correction_fidelity": _avg(correction_fids),
        "directives_fired": all_directives,
        "top_snippets": top_snippets,
        "per_round": per_round,
    }
# N:M
# 160:34
