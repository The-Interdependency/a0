import math
from typing import Any

METRIC_NAMES = ["cm", "da", "drift", "dvg", "int_val", "tbf"]

THRESHOLDS = {
    "cm": 0.85,
    "da": 0.80,
    "drift": 0.30,
    "dvg": 0.25,
    "int_val": 0.70,
    "tbf": 0.60,
}

DIRECTIVES = {
    "cm_high": {"metric": "cm", "condition": "above", "threshold": 0.85, "action": "coherence_lock"},
    "da_low": {"metric": "da", "condition": "below", "threshold": 0.50, "action": "alignment_boost"},
    "drift_high": {"metric": "drift", "condition": "above", "threshold": 0.40, "action": "drift_correction"},
    "dvg_high": {"metric": "dvg", "condition": "above", "threshold": 0.35, "action": "divergence_dampen"},
    "int_low": {"metric": "int_val", "condition": "below", "threshold": 0.40, "action": "integrity_restore"},
    "tbf_low": {"metric": "tbf", "condition": "below", "threshold": 0.30, "action": "bias_recalibrate"},
}


def compute_metrics(
    responses: list[dict[str, Any]],
    context: str = "",
) -> dict[str, float]:
    if not responses:
        return {m: 0.0 for m in METRIC_NAMES}
    n = len(responses)
    texts = [r.get("content", "") for r in responses]
    avg_len = sum(len(t) for t in texts) / max(n, 1)
    variance = sum((len(t) - avg_len) ** 2 for t in texts) / max(n, 1)
    std = math.sqrt(variance)

    cm = min(1.0, avg_len / 2000) if avg_len > 0 else 0.0
    da = max(0.0, 1.0 - std / max(avg_len, 1))
    drift = min(1.0, std / max(avg_len, 1))
    unique_starts = len(set(t[:50] for t in texts if t))
    dvg = min(1.0, unique_starts / max(n, 1))
    int_val = max(0.0, 1.0 - drift * 0.5 - dvg * 0.3)
    ctx_overlap = 0.0
    if context:
        ctx_words = set(context.lower().split())
        for t in texts:
            t_words = set(t.lower().split())
            if ctx_words:
                ctx_overlap += len(ctx_words & t_words) / len(ctx_words)
        ctx_overlap /= max(n, 1)
    tbf = max(0.0, min(1.0, ctx_overlap))

    return {
        "cm": round(cm, 4),
        "da": round(da, 4),
        "drift": round(drift, 4),
        "dvg": round(dvg, 4),
        "int_val": round(int_val, 4),
        "tbf": round(tbf, 4),
    }


def check_directives(metrics: dict[str, float]) -> list[str]:
    fired = []
    for name, directive in DIRECTIVES.items():
        val = metrics.get(directive["metric"], 0)
        if directive["condition"] == "above" and val > directive["threshold"]:
            fired.append(name)
        elif directive["condition"] == "below" and val < directive["threshold"]:
            fired.append(name)
    return fired


def delta_between(a: dict[str, float], b: dict[str, float]) -> dict[str, float]:
    result = {}
    for m in METRIC_NAMES:
        result[f"delta_{m}"] = round((b.get(m, 0) - a.get(m, 0)), 4)
    return result
