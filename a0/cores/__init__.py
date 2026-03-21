"""Private cognitive cores — Phi, Psi, Omega — and Phonon transport.

They think. They do not emit outward directly.

Law 1: Private process is not public output.
Law 7: Health sensing does not require content access.

Structure:
    phi/          — structural/analytic cognition
    psi/          — semantic/contextual cognition
      tensors/    — a0 build logic lives here (Psi's domain)
    omega/        — synthesis/integration
      tensors/    — the interdependent way + supporting material
    phonon.py     — internal transport field
"""
from .phi import Phi
from .psi import Psi
from .omega import Omega
from .phonon import Phonon

__all__ = ["Phi", "Psi", "Omega", "Phonon"]
