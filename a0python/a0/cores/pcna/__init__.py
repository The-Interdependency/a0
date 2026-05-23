# 4:8
"""PCNA — Prime Circular Neural Architecture.

The inference engine layer of a0. phi, psi, omega are distinct tensor
fields operating in circular / phase coordinates (unit-circle eigenbasis).

Layer hierarchy:
    PCNA  (this package)  — phi, psi, omega, guardian, memory tensor fields
    PCTA  (cores/pcta/)   — circle tensor layer (phase-coordinate transform)
    PTCA  (cores/ptca/)   — seed tensor routing lattice (53-node graph)
"""
from .phi import PhiTensor
from .psi import PsiTensor
from .omega import OmegaTensor

__all__ = ["PhiTensor", "PsiTensor", "OmegaTensor"]
# 4:8
