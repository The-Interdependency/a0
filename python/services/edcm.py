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
from edcmbone.metrics.compute import compute_round
from edcmbone.metrics.stats import (
    rep_ngram_density, repetition_ratio, novelty, ttr,
)

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
# N:M
