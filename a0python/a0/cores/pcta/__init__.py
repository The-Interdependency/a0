<<<<<<< HEAD
# 2:5 0:0 0:1
=======
# 2:5
>>>>>>> origin/pr/32
"""PCTA — PCNA + circle tensor layer.

Circle tensors transform PCNA state from Cartesian to circular / phase
coordinates (unit-circle eigenbasis). This is the natural basis of
recursive systems (eigenvalues λ = r·e^(iθ)).
"""
from .circle_tensors import to_phase_coords, CircleTensorState

__all__ = ["to_phase_coords", "CircleTensorState"]
<<<<<<< HEAD
# 2:5 0:0 0:1
=======
# 2:5
>>>>>>> origin/pr/32
