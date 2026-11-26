# ratios: loc_comments=285:37 imports_exports=10:8 calls_definitions=124:15
"""Explore harmonic structure in msdmd RATIOS without changing the RATIOS seal.

Usage:
    python ratios/harmonics.py --root . --domain import --signal code
    python ratios/harmonics.py --root . --domain semantic --signal fan_in
    python ratios/harmonics.py --root . --domain distance --anchor pkg/api.py
    python ratios/harmonics.py --root . --domain source --file pkg/api.py
    python ratios/harmonics.py --root . --domain import --signal code --json

Graph domains use Laplacian eigenspaces; scalar domains use least-squares
sin/cos harmonics. Every reported peak can be compared to a deterministic
permutation null. This module is read-only research instrumentation, never a
RATIOS compliance gate.
"""
from __future__ import annotations

import argparse
from collections import deque
import json
from pathlib import Path
import sys
from typing import Iterable

# === MODULE_BUILD ===
# id: ratios_harmonic_explorer
#   module_name: harmonics
#   module_kind: experiment
#   summary: explores harmonic structure of verified ratio primitives over non-time domains
#   owner: The Interdependency
#   public_surface: semantic_file_graph, source_balance_series, analyze, main
#   internal_surface: graph preparation, metric selection, distance projection, report rendering
#   auth_boundary: none
#   storage_boundary: read
#   network_boundary: none
#   user_data_boundary: none
#   admin_only: false
#   tests: tests/test_harmonics.py
#   rollout: opt-in read-only CLI; never a compliance gate
#   rollback: remove ratios/harmonics.py and harmonic_math.py; RATIOS seals remain unchanged
#   requires: ratios_harmonic_math
# === END MODULE_BUILD ===

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

import annotate_index as A  # noqa: E402
from harmonic_math import (  # noqa: E402
    active_nodes,
    graph_harmonics,
    harmonic_scan,
    undirected_graph,
)

RAW_SIGNALS = ("code", "comment", "consumed", "declared", "fan_in", "fan_out")
CONTRAST_SIGNALS = ("nm_contrast", "cd_contrast", "io_contrast")
SIGNALS = RAW_SIGNALS + CONTRAST_SIGNALS


def bounded_contrast(a: float, b: float) -> float | None:
    """Return (a-b)/(a+b), preserving the 0:0 state as undefined."""
    return None if a + b == 0 else (a - b) / (a + b)


def metric_value(metrics: dict, signal: str) -> float | None:
    if signal in RAW_SIGNALS:
        return float(metrics[signal])
    pairs = {
        "nm_contrast": ("code", "comment"),
        "cd_contrast": ("consumed", "declared"),
        "io_contrast": ("fan_in", "fan_out"),
    }
    if signal not in pairs:
        raise ValueError(f"unknown signal: {signal}")
    left, right = pairs[signal]
    return bounded_contrast(float(metrics[left]), float(metrics[right]))


def metric_signal(index: dict[str, dict], signal: str) -> tuple[dict[str, float], list[str]]:
    out: dict[str, float] = {}
    omitted: list[str] = []
    for node, metrics in index.items():
        value = metric_value(metrics, signal)
        if value is None:
            omitted.append(node)
        else:
            out[node] = value
    return out, omitted


def semantic_file_graph(collection: dict, root: Path, eligible: Iterable[str]) -> dict:
    """Project msdmd declaration edges onto source files that own both ids."""
    eligible_set = set(eligible)
    id_files: dict[str, set[str]] = {}
    # Schema 2 rewrites source_id and resolved targets to qualified addresses.
    address_files: dict[str, set[str]] = {}
    for declaration in collection.get("declarations", []):
        file_value = declaration.get("file")
        identifier = declaration.get("id")
        if file_value and identifier:
            path = str((root / str(file_value)).resolve())
            if path in eligible_set:
                id_files.setdefault(str(identifier), set()).add(path)
                if declaration.get("address"):
                    address_files.setdefault(str(declaration["address"]), set()).add(path)

    def owners(key: str) -> set[str]:
        # Exact address first; the short id is the legacy/unresolved fallback.
        return address_files.get(key) or id_files.get(key, set())

    adjacency = {node: set() for node in eligible_set}
    unresolved: list[str] = []
    resolved_edges = 0
    for edge in collection.get("edges", []):
        source_id = str(edge.get("source_id") or edge.get("from") or "")
        target_id = str(edge.get("to") or "")
        if edge.get("target_resolution") in {"ambiguous", "external-or-unresolved"}:
            # The collector could not pick one owning declaration; a short id
            # matching several files must not be counted as resolved.
            if source_id and target_id:
                unresolved.append(f"{source_id}->{target_id}")
            continue
        sources = owners(source_id)
        targets = owners(target_id)
        if not sources or not targets:
            if source_id and target_id:
                unresolved.append(f"{source_id}->{target_id}")
            continue
        for source in sources:
            for target in targets:
                if source != target:
                    adjacency[source].add(target)
                    resolved_edges += 1

    return {
        "adjacency": {node: sorted(targets) for node, targets in adjacency.items()},
        "resolved_edges": resolved_edges,
        "unresolved_edges": sorted(set(unresolved)),
        "ambiguous_ids": sorted(identifier for identifier, files in id_files.items() if len(files) > 1),
    }


def _source_without_ratio_lines(path: Path) -> list[str]:
    out = []
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        stripped = line.strip()
        if stripped.startswith(("# ratios:", "// ratios:")) or A._is_seal(line, path.suffix):
            continue
        out.append(line)
    return out


def source_balance_series(path: Path) -> tuple[list[float], list[float], dict]:
    """Return line-position and +code/-comment balance matching canonical N:M semantics."""
    ext = path.suffix.lower()
    if ext not in (".py", ".ts", ".tsx"):
        raise ValueError("source domain currently supports .py, .ts, and .tsx")
    lines = _source_without_ratio_lines(path)
    values: list[float] = []
    code = comment = blank = 0

    if ext == ".py":
        in_triple = False
        triple = None
        for raw in lines:
            stripped = raw.strip()
            if not stripped:
                values.append(0.0); blank += 1
            elif in_triple:
                values.append(-1.0); comment += 1
                if triple and triple in stripped:
                    in_triple = False; triple = None
            elif stripped.startswith('"""') or stripped.startswith("'''"):
                values.append(-1.0); comment += 1
                token = stripped[:3]
                if stripped.count(token) < 2:
                    in_triple = True; triple = token
            elif stripped.startswith("#"):
                values.append(-1.0); comment += 1
            else:
                values.append(1.0); code += 1
    else:
        in_block = False
        for raw in lines:
            stripped = raw.strip()
            if not stripped:
                values.append(0.0); blank += 1
            elif in_block:
                values.append(-1.0); comment += 1
                if "*/" in stripped:
                    in_block = False
            elif stripped.startswith("/*"):
                values.append(-1.0); comment += 1
                if "*/" not in stripped[2:]:
                    in_block = True
            elif stripped.startswith("//"):
                values.append(-1.0); comment += 1
            else:
                values.append(1.0); code += 1

    return [float(i) for i in range(len(values))], values, {
        "code": code, "comment": comment, "blank": blank, "lines": len(values)
    }


def _bfs_distances(graph: dict[str, set[str]], anchor: str) -> dict[str, int]:
    if anchor not in graph:
        raise ValueError(f"anchor is not in graph: {anchor}")
    distances = {anchor: 0}
    queue: deque[str] = deque([anchor])
    while queue:
        node = queue.popleft()
        for neighbor in graph.get(node, ()):
            if neighbor not in distances:
                distances[neighbor] = distances[node] + 1
                queue.append(neighbor)
    return distances


def _load_semantic_collection(root: Path, repo: str) -> dict:
    skill_root = HERE.parent
    if str(skill_root) not in sys.path:
        sys.path.insert(0, str(skill_root))
    try:
        from msdmd.collect import collect  # type: ignore
    except ImportError as exc:
        raise ValueError("semantic domain requires sibling msdmd/collect.py") from exc
    return collect(root, repo)


def _prepare_graph(root: Path, domain: str, signal_name: str, repo: str) -> tuple[dict, dict, dict]:
    files = A.collect_files(root)
    index = A.build_index(files, root)
    signal, omitted = metric_signal(index, signal_name)
    diagnostics: dict = {"undefined_signal_omitted": [str(Path(p).relative_to(root)) for p in omitted]}
    if domain == "import":
        evidence = A.build_import_graph(files)
        adjacency = evidence["adjacency"]
        diagnostics.update({"unresolved_imports": evidence["unresolved"], "ambiguous_imports": evidence["ambiguous"]})
    elif domain == "semantic":
        evidence = semantic_file_graph(_load_semantic_collection(root, repo), root, signal)
        adjacency = evidence["adjacency"]
        diagnostics.update({
            "resolved_semantic_edges": evidence["resolved_edges"],
            "unresolved_semantic_edges": evidence["unresolved_edges"],
            "ambiguous_semantic_ids": evidence["ambiguous_ids"],
        })
    else:
        raise ValueError(f"unsupported graph domain: {domain}")
    return adjacency, signal, diagnostics


def _relative(path: str, root: Path) -> str:
    try:
        return str(Path(path).resolve().relative_to(root))
    except ValueError:
        return path


def analyze(args: argparse.Namespace) -> dict:
    root = Path(args.root).resolve()
    repo = args.repo or root.name
    hmmm: list[str] = []
    if args.domain in ("import", "semantic"):
        adjacency, signal, diagnostics = _prepare_graph(root, args.domain, args.signal, repo)
        spectrum = graph_harmonics(adjacency, signal, permutations=args.permutations, seed=args.seed, max_nodes=args.max_nodes)
        diagnostics["isolated_omitted"] = [_relative(p, root) for p in spectrum["isolated_omitted"]]
        if args.domain == "import" and diagnostics.get("ambiguous_imports"):
            hmmm.append("relative-import stem collisions remain visible; the graph preserves canonical stem semantics")
        if args.domain == "semantic" and diagnostics.get("unresolved_semantic_edges"):
            hmmm.append("semantic edges whose target id is not source-owned remain unresolved and are excluded")
        return {
            "domain": args.domain, "signal": args.signal, "node_count": len(spectrum["nodes"]),
            "zero_mode_energy_fraction": spectrum["zero_mode_energy_fraction"],
            "results": sorted(spectrum["modes"], key=lambda item: item["energy_fraction"], reverse=True),
            "diagnostics": diagnostics, "hmmm": hmmm,
        }

    if args.domain == "distance":
        adjacency, signal, diagnostics = _prepare_graph(root, args.distance_graph, args.signal, repo)
        graph = undirected_graph(adjacency, signal)
        graph = undirected_graph(graph, active_nodes(graph))
        anchor_path = str((root / args.anchor).resolve())
        distances = _bfs_distances(graph, anchor_path)
        nodes = sorted(node for node in distances if node in signal)
        results = harmonic_scan(
            [float(distances[node]) for node in nodes], [signal[node] for node in nodes],
            max_harmonic=args.max_harmonic, permutations=args.permutations, seed=args.seed,
        )
        diagnostics.update({"reachable_nodes": len(nodes), "max_distance": max(distances.values()) if distances else 0})
        return {
            "domain": "distance", "distance_graph": args.distance_graph, "anchor": args.anchor,
            "signal": args.signal, "results": sorted(results, key=lambda item: item["power"], reverse=True),
            "diagnostics": diagnostics, "hmmm": hmmm,
        }

    path = (root / args.file).resolve()
    x, y, counts = source_balance_series(path)
    results = harmonic_scan(
        x, y, max_harmonic=min(args.max_harmonic, max(1, len(x) // 2)),
        permutations=args.permutations, seed=args.seed,
    )
    hmmm.append("source mode currently analyzes the N:M primitive balance only; C:D and I:O remain repo-level signals")
    return {
        "domain": "source", "file": str(path.relative_to(root)), "signal": "code_comment_balance",
        "results": sorted(results, key=lambda item: item["power"], reverse=True),
        "diagnostics": counts, "hmmm": hmmm,
    }


def _print_text(report: dict, top: int) -> None:
    print(f"harmonics domain={report['domain']} signal={report.get('signal', 'hmmm')}")
    for item in report.get("results", [])[:top]:
        p = "hmmm" if item["p_value"] is None else f"{item['p_value']:.4f}"
        if "eigenvalue" in item:
            print(
                f"  λ={item['eigenvalue']:.6g} freq={item['graph_frequency']:.6g} "
                f"mult={item['multiplicity']} energy={item['energy_fraction']:.4f} p={p}"
            )
        else:
            print(f"  k={item['harmonic']} power={item['power']:.4f} p={p}")
    for item in report.get("hmmm", []):
        print(f"  hmmm: {item}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", default=".", help="repository root")
    parser.add_argument("--domain", choices=("import", "semantic", "distance", "source"), required=True)
    parser.add_argument("--signal", choices=SIGNALS, default="code", help="ratio primitive for repo-level domains")
    parser.add_argument("--repo", help="repo slug/name recorded by the semantic collector")
    parser.add_argument("--anchor", help="root-relative anchor file for distance domain")
    parser.add_argument("--distance-graph", choices=("import", "semantic"), default="import")
    parser.add_argument("--file", help="root-relative source file for source domain")
    parser.add_argument("--permutations", type=int, default=199, help="signal shuffles for empirical p-values; 0 disables")
    parser.add_argument("--seed", type=int, default=0, help="deterministic permutation seed")
    parser.add_argument("--max-nodes", type=int, default=128, help="resource guard for stdlib graph eigensolver")
    parser.add_argument("--max-harmonic", type=int, default=12, help="largest integer harmonic for scalar domains")
    parser.add_argument("--top", type=int, default=8, help="number of strongest modes to print")
    parser.add_argument("--json", action="store_true", help="emit the complete machine-readable report")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.domain == "distance" and not args.anchor:
        parser.error("--domain distance requires --anchor")
    if args.domain == "source" and not args.file:
        parser.error("--domain source requires --file")
    if args.permutations < 0 or args.max_nodes < 3:
        parser.error("--permutations must be >= 0 and --max-nodes must be >= 3")
    try:
        report = analyze(args)
    except (OSError, ValueError, RuntimeError) as exc:
        print(f"hmmm: {exc}", file=sys.stderr)
        return 2
    if args.json:
        print(json.dumps(report, indent=2, sort_keys=True))
    else:
        _print_text(report, args.top)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
# ratios: loc_comments=285:37 imports_exports=10:8 calls_definitions=124:15
