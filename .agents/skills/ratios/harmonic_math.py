# ratios: loc_comments=230:30 imports_exports=5:4 calls_definitions=96:11
"""Pure-stdlib harmonic math used by ratios/harmonics.py.

Usage:
    from harmonic_math import graph_harmonics, harmonic_scan

`graph_harmonics` analyzes a signal on a graph Laplacian and sums spectral
energy across degenerate eigenspaces before permutation testing.
`harmonic_scan` fits sin/cos pairs at integer harmonics of a scalar axis span.
Neither function interprets msdmd or mutates source files.
"""
from __future__ import annotations

import math
import random
from typing import Iterable

# === MODULE_BUILD ===
# id: ratios_harmonic_math
#   module_name: harmonic_math
#   module_kind: experiment
#   summary: supplies dependency-free graph and scalar harmonic estimators for ratio exploration
#   owner: The Interdependency
#   public_surface: graph_harmonics, harmonic_scan
#   internal_surface: Jacobi eigensolver, eigenspace grouping, sinusoid least-squares fit
#   auth_boundary: none
#   storage_boundary: none
#   network_boundary: none
#   user_data_boundary: none
#   admin_only: false
#   tests: tests/test_harmonics.py
#   rollout: imported only by the opt-in ratios harmonic explorer
#   rollback: remove this helper with ratios/harmonics.py; no stored state exists
# === END MODULE_BUILD ===


def _undirected(adjacency: dict[str, Iterable[str]], nodes: Iterable[str]) -> dict[str, set[str]]:
    allowed = set(nodes)
    graph = {node: set() for node in allowed}
    for src, targets in adjacency.items():
        if src not in allowed:
            continue
        for dst in targets:
            if dst in allowed and dst != src:
                graph[src].add(dst)
                graph[dst].add(src)
    return graph


def active_nodes(graph: dict[str, set[str]]) -> list[str]:
    """Return graph nodes with at least one edge."""
    return sorted(node for node, neighbors in graph.items() if neighbors)


def undirected_graph(adjacency: dict[str, Iterable[str]], nodes: Iterable[str]) -> dict[str, set[str]]:
    """Public wrapper for the undirected analysis projection."""
    return _undirected(adjacency, nodes)


def _laplacian(nodes: list[str], graph: dict[str, set[str]]) -> list[list[float]]:
    pos = {node: i for i, node in enumerate(nodes)}
    n = len(nodes)
    matrix = [[0.0] * n for _ in range(n)]
    for node, i in pos.items():
        neighbors = [dst for dst in graph.get(node, ()) if dst in pos and dst != node]
        matrix[i][i] = float(len(neighbors))
        for dst in neighbors:
            matrix[i][pos[dst]] = -1.0
    return matrix


def _jacobi_eigh(
    matrix: list[list[float]],
    *,
    tol: float = 1e-11,
    max_sweeps: int = 60,
) -> tuple[list[float], list[list[float]]]:
    """Eigenpairs for a real symmetric matrix using cyclic Jacobi rotations."""
    n = len(matrix)
    if n == 0:
        return [], []
    a = [row[:] for row in matrix]
    vectors = [[1.0 if i == j else 0.0 for j in range(n)] for i in range(n)]
    scale = max(1.0, max(abs(value) for row in a for value in row))
    threshold = tol * scale

    for _ in range(max_sweeps):
        largest = 0.0
        for p in range(n - 1):
            for q in range(p + 1, n):
                apq = a[p][q]
                largest = max(largest, abs(apq))
                if abs(apq) <= threshold:
                    continue
                app = a[p][p]
                aqq = a[q][q]
                tau = (aqq - app) / (2.0 * apq)
                if tau == 0.0:
                    t = 1.0
                else:
                    t = math.copysign(1.0, tau) / (abs(tau) + math.sqrt(1.0 + tau * tau))
                c = 1.0 / math.sqrt(1.0 + t * t)
                s = t * c

                for k in range(n):
                    if k == p or k == q:
                        continue
                    akp = a[k][p]
                    akq = a[k][q]
                    a[k][p] = a[p][k] = c * akp - s * akq
                    a[k][q] = a[q][k] = s * akp + c * akq

                a[p][p] = app - t * apq
                a[q][q] = aqq + t * apq
                a[p][q] = a[q][p] = 0.0

                for k in range(n):
                    vkp = vectors[k][p]
                    vkq = vectors[k][q]
                    vectors[k][p] = c * vkp - s * vkq
                    vectors[k][q] = s * vkp + c * vkq
        if largest <= threshold:
            break
    else:
        raise RuntimeError("Jacobi eigensolver did not converge; narrow the graph or raise the solver bound")

    order = sorted(range(n), key=lambda i: a[i][i])
    values = [a[i][i] for i in order]
    columns = [[vectors[row][i] for row in range(n)] for i in order]
    return values, columns


def _eigen_groups(values: list[float], *, tol: float = 1e-8) -> list[list[int]]:
    groups: list[list[int]] = []
    for i, value in enumerate(values):
        if not groups:
            groups.append([i])
            continue
        previous = values[groups[-1][-1]]
        bound = tol * max(1.0, abs(value), abs(previous))
        if abs(value - previous) <= bound:
            groups[-1].append(i)
        else:
            groups.append([i])
    return groups


def _dot(left: list[float], right: list[float]) -> float:
    return sum(a * b for a, b in zip(left, right))


def graph_harmonics(
    adjacency: dict[str, Iterable[str]],
    signal: dict[str, float],
    *,
    permutations: int = 199,
    seed: int = 0,
    max_nodes: int = 128,
) -> dict:
    """Project a node signal onto Laplacian eigenspaces with a permutation null."""
    graph = _undirected(adjacency, signal)
    nodes = active_nodes(graph)
    isolated = sorted(set(signal) - set(nodes))
    if len(nodes) < 3:
        raise ValueError("graph domain needs at least three non-isolated signal nodes")
    if len(nodes) > max_nodes:
        raise ValueError(
            f"graph has {len(nodes)} active nodes, above --max-nodes={max_nodes}; "
            "narrow the analysis or explicitly raise the resource guard"
        )

    graph = _undirected(graph, nodes)
    eigenvalues, eigenvectors = _jacobi_eigh(_laplacian(nodes, graph))
    groups = _eigen_groups(eigenvalues)
    y = [float(signal[node]) for node in nodes]
    mean = sum(y) / len(y)
    centered = [value - mean for value in y]
    total_energy = sum(value * value for value in centered)
    if total_energy <= 0.0:
        raise ValueError("signal is constant on the active graph")

    observed = [sum(_dot(centered, eigenvectors[i]) ** 2 for i in group) for group in groups]
    null_counts = [0] * len(groups)
    rng = random.Random(seed)
    permuted = centered[:]
    for _ in range(max(0, permutations)):
        rng.shuffle(permuted)
        for gi, group in enumerate(groups):
            energy = sum(_dot(permuted, eigenvectors[i]) ** 2 for i in group)
            if energy >= observed[gi] - 1e-15:
                null_counts[gi] += 1

    modes = []
    zero_energy = 0.0
    for gi, group in enumerate(groups):
        eigenvalue = sum(eigenvalues[i] for i in group) / len(group)
        fraction = observed[gi] / total_energy
        if eigenvalue <= 1e-9:
            zero_energy += fraction
            continue
        p_value = None if permutations <= 0 else (null_counts[gi] + 1.0) / (permutations + 1.0)
        modes.append(
            {
                "eigenvalue": eigenvalue,
                "graph_frequency": math.sqrt(max(0.0, eigenvalue)),
                "multiplicity": len(group),
                "energy_fraction": fraction,
                "p_value": p_value,
            }
        )
    return {
        "nodes": nodes,
        "isolated_omitted": isolated,
        "zero_mode_energy_fraction": zero_energy,
        "modes": modes,
    }


def _solve3(matrix: list[list[float]], rhs: list[float]) -> list[float] | None:
    aug = [matrix[i][:] + [rhs[i]] for i in range(3)]
    for col in range(3):
        pivot = max(range(col, 3), key=lambda row: abs(aug[row][col]))
        if abs(aug[pivot][col]) <= 1e-12:
            return None
        aug[col], aug[pivot] = aug[pivot], aug[col]
        scale = aug[col][col]
        aug[col] = [value / scale for value in aug[col]]
        for row in range(3):
            if row == col:
                continue
            factor = aug[row][col]
            if factor:
                aug[row] = [a - factor * b for a, b in zip(aug[row], aug[col])]
    return [aug[i][3] for i in range(3)]


def _sinusoid_power(x: list[float], y: list[float], omega: float) -> float:
    n = len(x)
    cosines = [math.cos(omega * value) for value in x]
    sines = [math.sin(omega * value) for value in x]
    cross = sum(c * s for c, s in zip(cosines, sines))
    matrix = [
        [float(n), sum(cosines), sum(sines)],
        [sum(cosines), sum(c * c for c in cosines), cross],
        [sum(sines), cross, sum(s * s for s in sines)],
    ]
    rhs = [sum(y), sum(v * c for v, c in zip(y, cosines)), sum(v * s for v, s in zip(y, sines))]
    beta = _solve3(matrix, rhs)
    if beta is None:
        return 0.0
    fitted = [beta[0] + beta[1] * c + beta[2] * s for c, s in zip(cosines, sines)]
    mean = sum(y) / n
    sst = sum((value - mean) ** 2 for value in y)
    if sst <= 0.0:
        return 0.0
    sse = sum((value - fit) ** 2 for value, fit in zip(y, fitted))
    return max(0.0, min(1.0, 1.0 - sse / sst))


def harmonic_scan(
    x: list[float],
    y: list[float],
    *,
    max_harmonic: int = 12,
    permutations: int = 199,
    seed: int = 0,
) -> list[dict]:
    """Least-squares sin/cos scan over integer harmonics of the observed span."""
    if len(x) != len(y) or len(x) < 4:
        raise ValueError("scalar harmonic scan needs at least four paired observations")
    span = max(x) - min(x)
    if span <= 0.0:
        raise ValueError("x axis has zero span")
    if max(y) == min(y):
        raise ValueError("signal is constant on the scalar axis")

    harmonics = list(range(1, max(1, max_harmonic) + 1))
    powers = [_sinusoid_power(x, y, 2.0 * math.pi * harmonic / span) for harmonic in harmonics]
    counts = [0] * len(harmonics)
    rng = random.Random(seed)
    shuffled = y[:]
    for _ in range(max(0, permutations)):
        rng.shuffle(shuffled)
        for i, harmonic in enumerate(harmonics):
            omega = 2.0 * math.pi * harmonic / span
            if _sinusoid_power(x, shuffled, omega) >= powers[i] - 1e-15:
                counts[i] += 1

    return [
        {
            "harmonic": harmonic,
            "cycles_over_span": float(harmonic),
            "power": powers[i],
            "p_value": None if permutations <= 0 else (counts[i] + 1.0) / (permutations + 1.0),
        }
        for i, harmonic in enumerate(harmonics)
    ]
# ratios: loc_comments=230:30 imports_exports=5:4 calls_definitions=96:11
