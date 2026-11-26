# ratios: loc_comments=27:13 imports_exports=4:2 calls_definitions=9:3
"""Resolve the vm-mcp profile in exactly one place (standard library only).

Usage: ``from profiles import resolve_profile, runs_shell``, or
``python -I profiles.py`` to print the profile resolved from the environment. policy.py, server.py,
auth.py and the root pre-start gate (yama_gate.py) all call this, so they can
never disagree about which profile is running.
"""
from __future__ import annotations

import os
from typing import Mapping

PROFILES = ("read-only", "workspace", "personal-console")
SHELL_PROFILES = frozenset({"workspace", "personal-console"})


def _env_flag(environ: Mapping[str, str], name: str, *, default: bool) -> bool:
    raw = environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def resolve_profile(environ: Mapping[str, str] | None = None) -> str:
    """Return the effective profile: strip, lowercase, and map the legacy flag.

    An empty VM_MCP_PROFILE means ``workspace`` when VM_MCP_SHELL_ENABLED is set
    (first vm-mcp release), else ``read-only``. Unknown names raise ValueError.
    """
    env = os.environ if environ is None else environ
    profile = env.get("VM_MCP_PROFILE", "").strip().lower()
    if not profile:
        profile = "workspace" if _env_flag(env, "VM_MCP_SHELL_ENABLED", default=False) else "read-only"
    if profile not in PROFILES:
        raise ValueError(f"VM_MCP_PROFILE must be one of {PROFILES}: {profile!r}")
    return profile


def runs_shell(profile: str) -> bool:
    """True when the profile runs same-UID shell children (shell_exec)."""
    return profile in SHELL_PROFILES


if __name__ == "__main__":
    # `python -I profiles.py` prints the resolved profile from the environment
    # (install.sh uses it for an existing env file); exit 2 if it is unknown.
    import sys

    try:
        print(resolve_profile())
    except ValueError as exc:
        print(exc, file=sys.stderr)
        sys.exit(2)
# ratios: loc_comments=27:13 imports_exports=4:2 calls_definitions=9:3
