"""
EDCM-Org: Energy-Dissonance Circuit Model — Organizational Diagnostic Package

Spec: edcm-org-v0.1.0
Philosophy: Observable outputs only. No intent inference.
"""

from .spec_version import SPEC_VERSION

__version__ = "0.1.0"
__spec_version__ = SPEC_VERSION

__all__ = ["SPEC_VERSION", "__version__", "__spec_version__"]
