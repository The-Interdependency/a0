"""
Environment configuration loader for a0.

Loads .env from the repo root (if present) and exposes all keys as
module-level constants. Falls back to shell environment if python-dotenv
is not installed.

Usage:
    from a0.config import A0_MODEL, ANTHROPIC_API_KEY
"""

from __future__ import annotations

import os
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
except ImportError:
    pass  # python-dotenv not installed; rely on shell environment

# ── Model selection ────────────────────────────────────────────────────────
A0_MODEL: str = os.getenv("A0_MODEL", "local")

# ── LLM API Keys ───────────────────────────────────────────────────────────
ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")
OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
GROK_API_KEY: str = os.getenv("GROK_API_KEY", "")
DEEPSEEK_API_KEY: str = os.getenv("DEEPSEEK_API_KEY", "")

# ── GitHub ─────────────────────────────────────────────────────────────────
GITHUB_TOKEN: str = os.getenv("GITHUB_TOKEN", "")

# ── Google Cloud ───────────────────────────────────────────────────────────
GOOGLE_CLOUD_PROJECT: str = os.getenv("GOOGLE_CLOUD_PROJECT", "")
GOOGLE_APPLICATION_CREDENTIALS: str = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "")
