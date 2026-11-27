# ratios: loc_comments=117:4 imports_exports=7:4 calls_definitions=61:6
"""Pure-stdlib information-design manifest audit.

Checks declared WCAG contrast pairs and verifies that information-bearing states
include at least one non-color redundancy. It does not simulate human vision.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

HEX_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")


def _srgb_channel(value: int) -> float:
    channel = value / 255.0
    if channel <= 0.04045:
        return channel / 12.92
    return ((channel + 0.055) / 1.055) ** 2.4


def relative_luminance(color: str) -> float:
    if not HEX_RE.match(color):
        raise ValueError(f"invalid sRGB hex color: {color!r}")
    r = _srgb_channel(int(color[1:3], 16))
    g = _srgb_channel(int(color[3:5], 16))
    b = _srgb_channel(int(color[5:7], 16))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast_ratio(foreground: str, background: str) -> float:
    first = relative_luminance(foreground)
    second = relative_luminance(background)
    light, dark = max(first, second), min(first, second)
    return (light + 0.05) / (dark + 0.05)


def _audit_pairs(pairs: list[dict[str, Any]], *, default_threshold: float, pair_type: str) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    for index, pair in enumerate(pairs):
        foreground = str(pair.get("foreground", ""))
        background = str(pair.get("background", ""))
        threshold = 3.0 if pair_type == "text" and pair.get("size") == "large" else default_threshold
        try:
            ratio = contrast_ratio(foreground, background)
        except ValueError as exc:
            findings.append({"severity": "error", "code": "invalid_color", "index": index, "message": str(exc)})
            continue
        if ratio < threshold:
            findings.append({
                "severity": "error",
                "code": f"{pair_type}_contrast",
                "index": index,
                "ratio": round(ratio, 2),
                "threshold": threshold,
                "foreground": foreground,
                "background": background,
            })
    return findings


def audit_manifest(manifest: dict[str, Any]) -> dict[str, Any]:
    findings: list[dict[str, Any]] = []
    if not str(manifest.get("message", "")).strip():
        findings.append({"severity": "error", "code": "missing_message", "message": "manifest requires a one-sentence reader takeaway"})

    dimensions = manifest.get("semantic_dimensions", {})
    if not isinstance(dimensions, dict) or not dimensions:
        findings.append({"severity": "error", "code": "missing_semantic_dimensions", "message": "declare semantic dimensions and their visual channels"})
    else:
        hue_dimensions = [
            name for name, channel in dimensions.items()
            if "hue" in re.split(r"[^a-z]+", str(channel).strip().lower())
        ]
        if len(hue_dimensions) > 1:
            findings.append({"severity": "error", "code": "hue_overloaded", "dimensions": hue_dimensions, "message": "hue carries more than one independent semantic dimension"})

    text_pairs = manifest.get("text_pairs", [])
    nontext_pairs = manifest.get("nontext_pairs", [])
    if not isinstance(text_pairs, list):
        findings.append({"severity": "error", "code": "bad_text_pairs", "message": "text_pairs must be a list"})
        text_pairs = []
    if not isinstance(nontext_pairs, list):
        findings.append({"severity": "error", "code": "bad_nontext_pairs", "message": "nontext_pairs must be a list"})
        nontext_pairs = []
    findings.extend(_audit_pairs(text_pairs, default_threshold=4.5, pair_type="text"))
    findings.extend(_audit_pairs(nontext_pairs, default_threshold=3.0, pair_type="nontext"))

    states = manifest.get("states", [])
    if not isinstance(states, list):
        findings.append({"severity": "error", "code": "bad_states", "message": "states must be a list"})
        states = []
    for index, state in enumerate(states):
        name = str(state.get("name", "")).strip() or f"state[{index}]"
        color = str(state.get("color", ""))
        if not HEX_RE.match(color):
            findings.append({"severity": "error", "code": "invalid_state_color", "state": name, "color": color})
        redundancy = state.get("redundancy", [])
        noncolor = [
            item for item in redundancy
            if str(item).strip() and str(item).strip().lower() not in {"color", "hue"}
        ] if isinstance(redundancy, list) else []
        if not noncolor:
            findings.append({"severity": "error", "code": "color_only_state", "state": name, "message": "state requires a non-color cue such as label, shape, pattern, or line style"})

    manual = manifest.get("manual_gates", {})
    required_manual = {"grayscale", "cvd", "semantic"}
    if not isinstance(manual, dict):
        manual = {}
    missing = sorted(required_manual - set(manual))
    if missing:
        findings.append({"severity": "warning", "code": "manual_gates_unrecorded", "gates": missing, "message": "manual perceptual/semantic gates remain visible hmmm until reviewed"})

    errors = [item for item in findings if item["severity"] == "error"]
    warnings = [item for item in findings if item["severity"] == "warning"]
    return {"status": "pass" if not errors else "fail", "errors": errors, "warnings": warnings, "hmmm": manifest.get("hmmm", [])}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Audit an information-design manifest for contrast and semantic redundancy.")
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--json", action="store_true", help="emit machine-readable output")
    args = parser.parse_args(argv)

    try:
        manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"information-design audit: fail ({exc})", file=sys.stderr)
        return 2

    report = audit_manifest(manifest)
    if args.json:
        print(json.dumps(report, indent=2, sort_keys=True))
    else:
        print(f"information-design audit: {report['status']} ({len(report['errors'])} errors, {len(report['warnings'])} warnings)")
        for finding in [*report["errors"], *report["warnings"]]:
            print(f"{finding['severity'].upper()} {finding['code']}: {finding}")

    return 0 if report["status"] == "pass" else 1


if __name__ == "__main__":
    raise SystemExit(main())
# ratios: loc_comments=117:4 imports_exports=7:4 calls_definitions=61:6
