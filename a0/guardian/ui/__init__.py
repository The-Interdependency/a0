"""Guardian UI — the user-facing layer owned by Guardian.

Each tab is a circle. Seeds group circles.

Guardian is the sole owner of UI (Law 10).
No component outside Guardian may present UI directly.

Layout:
    seed_core       → [phi, psi, omega]
    seed_transport  → [phonon]
    seed_jury       → [adjudication, conflicts, standards]
    seed_memory     → [continuity, recall]
    seed_meta       → [executive, fast_path, slow_path]
    seed_guardian   → [sentinels, recovery, approval, audit, emit]
    seed_advisory   → [bandit]
"""
from .circles import Circle
from .seeds import Seed, SeedLayout, default_layout

__all__ = ["Circle", "Seed", "SeedLayout", "default_layout"]
