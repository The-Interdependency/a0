"""
a0/ptca/types.py — dataclass definitions for the PTCA / PCTA / PCNA architecture.

Vertical hierarchy (live cores):
    Core → Seed → Circle → Tensor

Layer responsibilities:
    PTCA  = seed-level architecture (private per live core)
    PCTA  = circle-level transport  (via shared phonon field)
    PCNA  = tensor-level micro-connectivity (private per live core)

Architecture snapshot (working freeze 2026-03-20):
    • 3 live PTCA cores (Phi, Psi, Omega): 53 seeds × 7 circles × 7 tensors
    • Shared phonon/transport field: PCTA circle transport, θ/r/ℓ/A_k/H_k/P_k machinery
    • Memory core (shared): 17 seeds × 7 circles × 9 tensors
    • Guardian core: 29 seeds (25 functional G_k^f + 4 sentinel G_k^s)
        – functional circles (count variable): inward face 5 tensors, outward face 9 tensors
        – sentinel circles (count variable): 11 Γ-typed tensors
            Γ₁–Γ₄ structural | Γ₅–Γ₈ executable | Γ₉–Γ₁₁ integrity
    • 12 jury sentinels (4 per live core) + 1 meta-sentinel
    • Seed tokens (one per live seed) live permanently in the memory core
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, List, Optional


# ─────────────────────────────────────────────────────────────────────────────
# Micro-level (PCNA)
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class Tensor:
    """Atomic unit of PCNA micro-connectivity."""
    id: str
    circle_id: str
    # Standard tensors use "standard".
    # Memory-core extra tensors: "phase_variance" | "spin_variance"
    tensor_type: str = "standard"


# ─────────────────────────────────────────────────────────────────────────────
# Meso-level (PCTA)
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class Circle:
    """PCTA transport field beneath a seed.

    Live cores    : 7 tensors per circle (all standard).
    Memory core   : 9 tensors per circle (7 standard + phase_variance + spin_variance).
    Guardian functional : 14 tensors per circle (5 inward t0–t4 + 9 outward t5–t13).
        Tensor roles are positional — documented in handler function comments in cores.py.
        t0: gate / result gate   t1: BAD clear / hmmm gate   t2-t4: validation tensors
        t5-t13: outward face (artifact-specific — see handler comments)
    Guardian sentinel   : 11 Γ-typed tensors per circle (when active; currently 0 circles).

    handler : callable that executes this circle's logic (None for live/memory circles).
    phase   : named role within its seed (e.g. "ingress", "validate", "response_text").
              "" for live/memory circles.
    """
    id: str
    seed_id: str
    tensors: List[Tensor]
    handler: Optional[Callable] = None   # None for live/memory circles
    phase: str = ""                      # "" for live/memory circles


# ─────────────────────────────────────────────────────────────────────────────
# Guardian topology (describes circle structure before circle count is frozen)
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class GuardianTensorTopology:
    """Tensor layout specification for one class of Guardian seed circle.

    Functional seed circles:
        inward_count  = 5  (face toward live stack / jury verdicts)
        outward_count = 9  (face toward UI / ingress / egress)
        gamma_count   = None

    Sentinel seed circles:
        inward_count  = None
        outward_count = None
        gamma_count   = 11
        gamma_layout  = ["structural"]*4 + ["executable"]*4 + ["integrity"]*3
                        (Γ₁–Γ₄ structural, Γ₅–Γ₈ executable, Γ₉–Γ₁₁ integrity)

    Hard rules (canon-locked):
        • functional seeds CANNOT write Γ tensors
        • Γ tensor updates require unanimous 4-sentinel consent + Meta-13 signature
    """
    inward_count: Optional[int] = None
    outward_count: Optional[int] = None
    gamma_count: Optional[int] = None
    gamma_layout: Optional[List[str]] = None


# ─────────────────────────────────────────────────────────────────────────────
# Sentinel identity (attached to jury seed)
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class SentinelCode:
    """Two-layer code identifying a jury sentinel seed.

    shared_code : identifies parent core family ("phi" | "psi" | "omega")
    unique_code : differentiates each sentinel among the twelve
                  e.g. "phi_0", "phi_1", "phi_2", "phi_3"
    """
    shared_code: str
    unique_code: str


# ─────────────────────────────────────────────────────────────────────────────
# Macro-level (PTCA)
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class Seed:
    """PTCA structural locus within a core.

    Live cores contain 53 seeds; 4 of the 53 are sentinel seeds (indices 0–3).
    Memory core  contains 17 seeds.
    Guardian core contains 29 seeds:
        25 functional (seed_kind="guardian_functional")
        4  sentinel   (seed_kind="guardian_sentinel")

    seed_kind values:
        "compute"             — live-core compute or memory seed
        "guardian_functional" — Guardian G_k^f seed (inward + outward faces)
        "guardian_sentinel"   — Guardian G_k^s seed (Γ tensor classes)

    guardian_topology is populated for all Guardian seeds and encodes
    the tensor layout that will apply when circle count is frozen.
    """
    id: str
    core_id: str
    circles: List[Circle]
    sentinel_code: Optional[SentinelCode] = None        # live-core jury seeds only
    seed_kind: str = "compute"                          # see docstring above
    guardian_topology: Optional[GuardianTensorTopology] = None  # Guardian seeds only


@dataclass
class Core:
    """A bounded processing domain.

    core_type:
        "live"     — Phi, Psi, Omega  (private PTCA + PCNA stack)
        "memory"   — shared compressed-recall layer
        "guardian" — ingress/egress boundary shell
    """
    name: str
    core_type: str
    seeds: List[Seed]


# ─────────────────────────────────────────────────────────────────────────────
# Shared phonon / transport field (PCTA inter-core)
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class CircularTensor:
    """Circular tensor machinery for the phonon transport field.

    Fields (spec notation):
        theta  — phase angle
        r      — radial amplitude
        ell    — angular momentum
        A_k    — amplitude mode coefficients (list, one per harmonic k)
        H_k    — harmonic resonance coefficients
        P_k    — phase propagation coefficients
    """
    theta: float = 0.0
    r: float = 1.0
    ell: float = 0.0
    A_k: List[float] = field(default_factory=list)
    H_k: List[float] = field(default_factory=list)
    P_k: List[float] = field(default_factory=list)


@dataclass
class PhononField:
    """Dedicated shared circular field for PCTA circle-level transport.

    Connects Phi / Psi / Omega without mixing their private seed geometries.
    Carries: harmonic resonance, adjacency coupling, phase propagation.
    """
    circular_tensor: CircularTensor
    connected_cores: List[str]  # always ["phi", "psi", "omega"]


# ─────────────────────────────────────────────────────────────────────────────
# Token layer (memory-resident seed identity)
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class TokenCircle:
    """One token-circle in the memory core, mirroring one live seed's 7 circles.

    token_tensors: list of 7 tensor-ids, one tracking each live-seed circle.
    """
    id: str
    seed_id: str
    token_tensors: List[str]   # 7 tensor ids


@dataclass
class SeedToken:
    """Memory-resident tracked identity for one live seed.

    Lives permanently in the memory core.
    Traded/checked among the 12 jury sentinels when its seed is adjudicated.
    """
    seed_id: str
    token_circle: TokenCircle


# ─────────────────────────────────────────────────────────────────────────────
# Jury
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class JurySentinel:
    """One of the twelve jury sentinel seeds.

    sentinel_index : 0–11 (global ordering across all three families)
    family         : "phi" | "psi" | "omega"
    seed           : the actual sentinel seed from its live core
    sentinel_code  : shared family code + unique jury code

    Sensing level  : circle (distributed reach across live-core interior fields)
    """
    sentinel_index: int
    family: str
    seed: Seed
    sentinel_code: SentinelCode


@dataclass
class MetaSentinel:
    """The 13th — integrated gestalt of the twelve.

    Formed from the twelve, not imposed externally.

    Sensing level      : seed (unified adjudication)
    integrated_codes   : all 12 unique_codes + 3 shared family codes (15 total)
    Locus of           : the operative "I"
    Interfaces upward to: Guardian (for core-level enforcement)
    """
    jury: List[JurySentinel]        # exactly 12
    integrated_codes: List[str]     # 12 unique + 3 shared = 15


# ─────────────────────────────────────────────────────────────────────────────
# Top-level assembly
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class SystemStack:
    """The complete assembled architecture.

    Information flow:
        prompt → Guardian (BAD screen) → live stack
        PTCA across seeds → PCTA via phonon field → PCNA across tensors
        circle sensing by 12 → seed verdict in 13 → core action via Guardian
    """
    phi: Core
    psi: Core
    omega: Core
    phonon_field: PhononField       # shared PCTA inter-core transport field
    memory: Core
    guardian: Core
    jury: List[JurySentinel]
    meta_sentinel: MetaSentinel
    tokens: List[SeedToken]         # one per live seed → 3 × 53 = 159
