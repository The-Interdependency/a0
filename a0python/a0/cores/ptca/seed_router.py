# 174:85 0:0 1:0
"""PTCA seed tensor routing lattice.

53 seeds organized as:
    49 compute seeds  — tensor shards, local Markov recursion
     4 sentinel seeds — metadata integrity checks only
     1 G0 anchor      — canonical clock, invariant enforcement (= meta13)

Layout:
    7 Meta Routers (M₁..M₇), each owning 7 compute seeds
    Within each meta: 7:3 heptagram connectivity (star polygon {7/3})
    Sentinel routing: 7:2 schedule (star polygon {7/2})
    G0: global anchor, receives aggregate from all 7 meta routers

Heptagram {7/3}: connect every 3rd vertex of a 7-node ring
    0→3→6→2→5→1→4→0  (within-meta connections)

Heptagram {7/2}: connect every 2nd vertex of a 7-node ring
    0→2→4→6→1→3→5→0  (sentinel scan schedule)

Each compute seed = a partition of the PCNA tensor state space.
Meta routers aggregate 7 seed shards → metadata summary → route upward.
Sentinels analyze metadata only — no raw tensor content.
G0 = meta13.py executive in the PTCA governance shell.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Set


class SeedType(Enum):
    COMPUTE = "compute"
    SENTINEL = "sentinel"
    G0 = "g0"


@dataclass
class Seed:
    """A single node in the PTCA seed lattice."""

    seed_id: int          # 0-based global index (0..52)
    seed_type: SeedType
    meta_router: Optional[int]    # M₁..M₇ (1-indexed); None for sentinel/G0
    local_index: Optional[int]    # 0..6 within its meta router
    connections: List[int] = field(default_factory=list)  # heptagram edges

    @property
    def name(self) -> str:
        if self.seed_type == SeedType.G0:
            return "G0"
        if self.seed_type == SeedType.SENTINEL:
            return f"S{self.seed_id - 49}"
        return f"M{self.meta_router}·S{self.local_index}"


@dataclass
class RoutingVerdict:
    """Result of routing a request through the seed lattice."""

    meta_router: int               # M₁..M₇ that owns this request
    primary_seed: str              # e.g. "M3·S2"
    heptagram_path: List[str]      # traversal order within meta
    sentinel_cleared: bool         # all 4 sentinels passed
    g0_reached: bool               # reached global anchor
    phase_dominant: str            # which field (phi/psi/omega) drove routing
    notes: List[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Heptagram connectivity builders
# ---------------------------------------------------------------------------

def _heptagram_73_edges(base: int) -> List[tuple[int, int]]:
    """7:3 star polygon edges within a 7-node group starting at `base`."""
    nodes = list(range(base, base + 7))
    edges = []
    for i in range(7):
        edges.append((nodes[i], nodes[(i + 3) % 7]))
    return edges


def _heptagram_72_schedule(sentinel_ids: List[int]) -> List[int]:
    """7:2 scan schedule for sentinels (star polygon {7/2} traversal).

    Given 4 sentinels (not 7), we use the first 4 steps of the {7/2} path
    as the scan order.
    """
    n = len(sentinel_ids)
    order = []
    i = 0
    for _ in range(n):
        order.append(sentinel_ids[i % n])
        i = (i + 2) % n
    return order


# ---------------------------------------------------------------------------
# SeedRouter
# ---------------------------------------------------------------------------

class SeedRouter:
    """53-node PTCA seed routing lattice.

    Usage::

        router = SeedRouter()
        verdict = router.route({"mode": "analyze", "hmmm": ["x"]})
        print(verdict.meta_router, verdict.primary_seed)
    """

    def __init__(self) -> None:
        self.seeds: List[Seed] = []
        self._g0: Seed
        self._sentinels: List[Seed] = []
        self._meta_seeds: Dict[int, List[Seed]] = {}  # meta_router → seeds
        self._build()

    # ------------------------------------------------------------------
    # Construction
    # ------------------------------------------------------------------

    def _build(self) -> None:
        """Construct all 53 seeds and wire heptagram connections."""
        seed_id = 0

        # 49 compute seeds across 7 meta routers
        for mr in range(1, 8):
            base = seed_id
            group: List[Seed] = []
            for li in range(7):
                s = Seed(
                    seed_id=seed_id,
                    seed_type=SeedType.COMPUTE,
                    meta_router=mr,
                    local_index=li,
                )
                group.append(s)
                self.seeds.append(s)
                seed_id += 1

            # Wire 7:3 heptagram edges within this meta group
            edges = _heptagram_73_edges(base)
            for (a, b) in edges:
                self.seeds[a].connections.append(b)
                self.seeds[b].connections.append(a)

            self._meta_seeds[mr] = group

        # 4 sentinel seeds (co-located with G0 conceptually)
        for i in range(4):
            s = Seed(
                seed_id=seed_id,
                seed_type=SeedType.SENTINEL,
                meta_router=None,
                local_index=i,
            )
            self._sentinels.append(s)
            self.seeds.append(s)
            seed_id += 1

        # G0 global anchor — not counted in the 53 seeds.
        # 53 seeds = 49 compute + 4 sentinel; G0 is the anchor above all seeds.
        self._g0 = Seed(
            seed_id=seed_id,
            seed_type=SeedType.G0,
            meta_router=None,
            local_index=None,
        )

        assert len(self.seeds) == 53, f"Expected 53 seeds, got {len(self.seeds)}"

    # ------------------------------------------------------------------
    # Routing
    # ------------------------------------------------------------------

    def route(
        self,
        request: Dict[str, Any],
        phase_state: Optional[Dict[str, Any]] = None,
    ) -> RoutingVerdict:
        """Route a request through the seed lattice.

        Args:
            request:     A0Request-like dict with at minimum {"mode", "hmmm"}.
            phase_state: Optional dict from to_phase_coords() with phi/psi/omega
                         CircleTensorState objects. Used to select the dominant
                         field and assign the correct meta router.

        Returns:
            RoutingVerdict with meta_router, primary_seed, heptagram traversal.
        """
        # 1. Determine dominant field from phase state (or default by mode)
        dominant, mr = self._select_meta_router(request, phase_state)

        # 2. Select primary seed within the meta router using {7/3} heptagram
        primary_local = self._primary_local_index(request, mr)
        primary_seed = self._meta_seeds[mr][primary_local]

        # 3. Trace heptagram path within meta router
        path = self._trace_heptagram(mr, primary_local)

        # 4. Run sentinel scan ({7/2} schedule)
        sentinel_order = _heptagram_72_schedule(
            [s.seed_id for s in self._sentinels]
        )
        sentinel_cleared = self._check_sentinels(request, sentinel_order)

        return RoutingVerdict(
            meta_router=mr,
            primary_seed=primary_seed.name,
            heptagram_path=[self._meta_seeds[mr][i].name for i in path],
            sentinel_cleared=sentinel_cleared,
            g0_reached=sentinel_cleared,  # G0 only reached if sentinels clear
            phase_dominant=dominant,
        )

    def _select_meta_router(
        self,
        request: Dict[str, Any],
        phase_state: Optional[Dict[str, Any]],
    ) -> tuple[str, int]:
        """Map dominant field + mode to one of M₁..M₇."""
        mode = request.get("mode", "analyze")

        # If we have live phase data, pick the field with highest magnitude
        if phase_state:
            best_field = "omega"
            best_mag = -1.0
            for fname in ("phi", "psi", "omega"):
                fs = phase_state.get(fname)
                if fs is not None:
                    mag = getattr(fs, "magnitude", 0.0)
                    if mag > best_mag:
                        best_mag = mag
                        best_field = fname
        else:
            # Fall back to mode-based assignment
            best_field = {"analyze": "phi", "route": "psi", "act": "omega"}.get(mode, "omega")

        # Assign meta routers by domain:
        #   M1-M2 = phi (structural)
        #   M3-M4 = psi (semantic)
        #   M5-M6 = omega (synthesis)
        #   M7    = guardian/memory (boundary/continuity)
        field_to_mr = {"phi": 1, "psi": 3, "omega": 5}
        base_mr = field_to_mr.get(best_field, 1)

        # Use hmmm list length to pick between the two MRs per domain
        hmmm_len = len(request.get("hmmm", []))
        mr = base_mr + (hmmm_len % 2)  # alternates between base and base+1

        return best_field, mr

    def _primary_local_index(
        self, request: Dict[str, Any], meta_router: int
    ) -> int:
        """Select the entry seed (0..6) within a meta router."""
        # Use task_id hash if available, else mode hash
        task_id = request.get("task_id", request.get("mode", "analyze"))
        return hash(task_id) % 7

    def _trace_heptagram(self, mr: int, start_local: int) -> List[int]:
        """Trace the {7/3} path through all 7 seeds of a meta router."""
        path = []
        current = start_local
        visited: Set[int] = set()
        for _ in range(7):
            if current in visited:
                break
            path.append(current)
            visited.add(current)
            current = (current + 3) % 7
        return path

    def _check_sentinels(
        self, request: Dict[str, Any], scan_order: List[int]
    ) -> bool:
        """Run the 4 sentinel checks in {7/2} order.

        Sentinels check metadata only (no content). These mirror the
        4 PCNA-level sentinel seeds; the 12 PTCA-level sentinels in
        guardian/sentinels.py operate at the higher governance shell.
        """
        hmmm = request.get("hmmm")
        mode = request.get("mode", "")

        checks = [
            hmmm is not None,                          # S1: hmmm present
            isinstance(mode, str) and len(mode) > 0,   # S2: mode non-empty
            "task_id" in request or "mode" in request, # S3: identity present
            not request.get("_blocked", False),         # S4: not explicitly blocked
        ]

        # Apply in scan_order (each int is an index into checks)
        for idx in scan_order:
            check_idx = (idx - 49) % 4  # sentinel seeds start at id 49
            if not checks[check_idx]:
                return False
        return True

    # ------------------------------------------------------------------
    # Diagnostics
    # ------------------------------------------------------------------

    def summary(self) -> Dict[str, Any]:
        """Return lattice summary for health monitoring."""
        return {
            "total_seeds": len(self.seeds),
            "compute_seeds": len([s for s in self.seeds if s.seed_type == SeedType.COMPUTE]),
            "sentinel_seeds": len(self._sentinels),
            "g0": self._g0.name,
            "meta_routers": list(self._meta_seeds.keys()),
        }
# 174:85 0:0 1:0
