"""env — Psi tensor for runtime configuration.

Reads .env at the repo root (if present), then os.environ.
Values here drive adapter selection and server binding.

Usage::

    from a0.cores.psi.tensors.env import A0_MODEL, ANTHROPIC_API_KEY

.env keys:

    A0_MODEL            local-echo | anthropic-api | claude-agent  (default: local-echo)
    ANTHROPIC_API_KEY   sk-ant-...  required for A0_MODEL=anthropic-api
    A0_PORT             7860        Gradio server port
    A0_HOST             0.0.0.0     Gradio server host (0.0.0.0 = all interfaces)
"""
from __future__ import annotations

import os
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
_ENV_FILE = _REPO_ROOT / ".env"

# Load .env if present (silent if missing — python-dotenv is optional)
try:
    from dotenv import load_dotenv
    load_dotenv(_ENV_FILE, override=False)
except ImportError:
    # dotenv not installed — fall back to pure os.environ
    if _ENV_FILE.exists():
        for _line in _ENV_FILE.read_text().splitlines():
            _line = _line.strip()
            if _line and not _line.startswith("#") and "=" in _line:
                _k, _, _v = _line.partition("=")
                os.environ.setdefault(_k.strip(), _v.strip())

A0_MODEL: str = os.environ.get("A0_MODEL", "local-echo")
ANTHROPIC_API_KEY: str = os.environ.get("ANTHROPIC_API_KEY", "")
A0_PORT: int = int(os.environ.get("A0_PORT", "7860"))
A0_HOST: str = os.environ.get("A0_HOST", "0.0.0.0")

ENV_PATH: Path = _ENV_FILE
