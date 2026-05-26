# 29:39 0:0 1:0
"""env — Psi tensor for runtime configuration.

Single source of truth for all a0 environment variables.
Reads .env at the repo root (if present), then os.environ.

All other modules must import from here — never call os.getenv directly.

Usage::

    from a0.cores.psi.tensors.env import A0_MODEL, A0_RUNTIME

.env / Replit Secrets keys:

    ADAPTER SELECTION
    A0_MODEL            local-echo | anthropic-api | claude-agent | local-ollama | local-llama | emergent

    LOCAL MODEL (ollama)
    A0_LOCAL_MODEL      model name as shown by `ollama list`  (default: llama3.2)
    A0_OLLAMA_BASE      ollama daemon URL                     (default: http://localhost:11434)

    LOCAL MODEL (llama-cpp-python)
    A0_MODEL_PATH       absolute path to a .gguf model file   (default: "")

    EXTERNAL APIs
    ANTHROPIC_API_KEY   sk-ant-...   required for anthropic-api
    EMERGENT_API_KEY                 required for emergent adapter
    EMERGENT_API_BASE                Emergent API base URL

    ENCRYPTION
    A0_MEMORY_KEY       Fernet key — generate:
                        python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
                        Store in Replit Secrets, never commit.

    SERVER
    A0_PORT             7860         Gradio server port
    A0_HOST             0.0.0.0      all interfaces; 127.0.0.1 = local only

    TRAINING (Path B — native PCNA)
    A0_RUNTIME          inference | training   (default: inference)
    A0_TRAINER_MODEL    external model used as trainer (e.g. claude-sonnet-4-6)
    A0_TRAINING_DIR     path where training data / checkpoints are written
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

# --- adapter ---
A0_MODEL: str           = os.environ.get("A0_MODEL",           "local-echo")

# --- local model (ollama) ---
A0_LOCAL_MODEL: str     = os.environ.get("A0_LOCAL_MODEL",     "llama3.2")
A0_OLLAMA_BASE: str     = os.environ.get("A0_OLLAMA_BASE",     "http://localhost:11434")

# --- local model (llama-cpp-python) ---
A0_MODEL_PATH: str      = os.environ.get("A0_MODEL_PATH",      "")

# --- external APIs ---
ANTHROPIC_API_KEY: str  = os.environ.get("ANTHROPIC_API_KEY",  "")
EMERGENT_API_KEY: str   = os.environ.get("EMERGENT_API_KEY",   "")
EMERGENT_API_BASE: str  = os.environ.get("EMERGENT_API_BASE",  "")

# --- encryption ---
A0_MEMORY_KEY: str      = os.environ.get("A0_MEMORY_KEY",      "")

# --- server ---
A0_PORT: int            = int(os.environ.get("A0_PORT",        "7860"))
A0_HOST: str            = os.environ.get("A0_HOST",            "0.0.0.0")

# --- training (Path B: native PCNA) ---
A0_RUNTIME: str         = os.environ.get("A0_RUNTIME",         "inference")
A0_TRAINER_MODEL: str   = os.environ.get("A0_TRAINER_MODEL",   "")
A0_TRAINING_DIR: str    = os.environ.get("A0_TRAINING_DIR",    "")

ENV_PATH: Path = _ENV_FILE
# 29:39 0:0 1:0
