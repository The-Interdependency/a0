"""
EDCM-Org CLI — entry point for organizational diagnostic runs.

Usage:
    python -m edcm_org.cli --org ACME --meeting path/to/meeting.txt --out result.json
    python -m edcm_org.cli --org ACME --meeting meeting.txt --tickets tickets.csv --out result.json

The CLI wires together the full analysis pipeline and enforces governance
rules before writing output.
"""

from __future__ import annotations

import json
from pathlib import Path

from .spec_version import SPEC_VERSION
from .types import Metrics, Params, OutputEnvelope
from .governance.privacy import EDCMPrivacyGuard, PrivacyConfig
from .governance.gaming import detect_gaming_alerts
from .metrics.primary import metric_C, metric_R, metric_D, metric_N, metric_L, metric_O
from .metrics.secondary import metric_F, metric_E, metric_I
from .metrics.progress import compute_progress
from .params.complexity import estimate_complexity
from .params.alpha import estimate_alpha
from .params.delta_max import estimate_delta_max
from .basins.detect import detect_basin
from .io.loaders import load_meeting_text, load_tickets_csv, window_meeting_text


def analyze(
    org: str,
    meeting_text: str,
    tickets_data: dict | None,
    window_id: str = "window-001",
    aggregation: str = "department",
) -> dict:
    """
    Run the full EDCM analysis pipeline on meeting text (+ optional ticket data).

    Returns a dict ready for JSON serialization and governance enforcement.
    """
    # Split into windows for history-dependent metrics
    windows = window_meeting_text(meeting_text, window_size=500, overlap=50)
    if not windows:
        windows = [meeting_text]

    # Single-window primaries (computed on full text for v0.1 demo)
    full_text = meeting_text
    C = metric_C(full_text)
    R = metric_R(full_text)
    D = metric_D(full_text)
    N = metric_N(full_text)
    L = metric_L(full_text)
    O = metric_O(full_text)

    # Window-history metrics
    F = metric_F(windows)
    E = metric_E(windows)
    I = metric_I(windows)

    # Progress — use ticket data if available
    p_artifacts_override = None
    if tickets_data:
        p_artifacts_override = min(1.0, tickets_data.get("resolution_rate", 0.0))

    P, P_d, P_c, P_a, P_f = compute_progress(
        full_text,
        p_artifacts_override=p_artifacts_override,
    )

    metrics = Metrics(
        C=C, R=R, F=F, E=E, D=D, N=N, I=I, O=O, L=L, P=P,
        P_decisions=P_d, P_commitments=P_c, P_artifacts=P_a, P_followthrough=P_f,
    )

    # Parameters
    complexity = estimate_complexity(full_text)
    # For v0.1 with single window, use neutral alpha
    alpha = 0.5
    delta_max = estimate_delta_max(
        resolution_rates=[tickets_data["resolution_rate"]] if tickets_data else [],
        complexities=[complexity],
    )

    params = Params(alpha=alpha, delta_max=delta_max, complexity=complexity)

    # Blame density for basin detection
    from .metrics.extraction_helpers import blame_density as _blame_density
    bd = _blame_density(full_text)

    # c_reduction: placeholder for v0.1 (no prior window to compare)
    c_reduction = 0.0
    delta_work = P
    s_t = C

    basin_name, basin_conf, explanation = detect_basin(metrics, s_t, c_reduction, delta_work, bd)

    gaming_alerts = detect_gaming_alerts(metrics, c_reduction, len(windows))

    warnings = ["v0.1 pipeline: single-window analysis. Collect multiple windows for F/E/I accuracy."]

    result = {
        "spec_version": SPEC_VERSION,
        "org": org,
        "window_id": window_id,
        "aggregation": aggregation,
        "metrics": {
            "C": round(C, 4), "R": round(R, 4), "F": round(F, 4),
            "E": round(E, 4), "D": round(D, 4), "N": round(N, 4),
            "I": round(I, 4), "O": round(O, 4), "L": round(L, 4), "P": round(P, 4),
            "P_decisions": round(P_d, 4), "P_commitments": round(P_c, 4),
            "P_artifacts": round(P_a, 4), "P_followthrough": round(P_f, 4),
        },
        "params": {
            "alpha": round(alpha, 4),
            "delta_max": round(delta_max, 4),
            "complexity": round(complexity, 4),
        },
        "basin": basin_name,
        "basin_confidence": round(basin_conf, 4),
        "basin_explanation": explanation,
        "gaming_alerts": gaming_alerts,
        "warnings": warnings,
    }

    return result


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(
        description="EDCM-Org: Energy-Dissonance Circuit Model organizational diagnostic."
    )
    parser.add_argument("--org", required=True, help="Organization identifier.")
    parser.add_argument("--meeting", required=True, help="Path to meeting transcript (.txt).")
    parser.add_argument("--tickets", required=False, help="Path to ticket data (.csv).")
    parser.add_argument("--out", required=True, help="Output path for JSON result.")
    parser.add_argument(
        "--aggregation",
        default="department",
        choices=["department", "team", "organization"],
        help="Aggregation level (default: department).",
    )
    parser.add_argument("--window-id", default="window-001", help="Window identifier.")
    args = parser.parse_args()

    meeting_text = load_meeting_text(args.meeting)

    tickets_data = None
    if args.tickets:
        tickets_data = load_tickets_csv(args.tickets)

    result = analyze(
        org=args.org,
        meeting_text=meeting_text,
        tickets_data=tickets_data,
        window_id=args.window_id,
        aggregation=args.aggregation,
    )

    guard = EDCMPrivacyGuard(PrivacyConfig(aggregation=args.aggregation))
    safe = guard.enforce(result)

    Path(args.out).write_text(json.dumps(safe, indent=2), encoding="utf-8")
    print(f"EDCM analysis complete. Output: {args.out}")
    print(f"  Basin:      {safe['basin']} (confidence: {safe['basin_confidence']})")
    print(f"  Spec:       {safe['spec_version']}")
    if safe.get("gaming_alerts"):
        print(f"  Gaming alerts: {len(safe['gaming_alerts'])}")
    if safe.get("warnings"):
        print(f"  Warnings: {len(safe['warnings'])}")


if __name__ == "__main__":
    main()
