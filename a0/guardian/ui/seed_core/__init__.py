"""seed_core — circles for the private cognitive cores (Phi, Psi, Omega)."""
from ..circles import Circle

PHI_CIRCLE   = Circle(name="phi",   label="Phi",   seed="seed_core")
PSI_CIRCLE   = Circle(name="psi",   label="Psi",   seed="seed_core")
OMEGA_CIRCLE = Circle(name="omega", label="Omega", seed="seed_core")

CIRCLES = [PHI_CIRCLE, PSI_CIRCLE, OMEGA_CIRCLE]
