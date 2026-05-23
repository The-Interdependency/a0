# 38:23
"""Internal encryption for a0 persistent state.

Uses Fernet (AES-128-CBC + HMAC-SHA256) when A0_MEMORY_KEY is set.
Falls back to plaintext transparently when the key is absent or
the cryptography package is not installed — existing deployments
keep working with zero changes.

Generate a key (run once, store in Replit Secrets or .env):

    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

Set in .env or Replit Secrets:

    A0_MEMORY_KEY=<output above>

What is encrypted:
    state/memory.json      — jury-adjudicated cognitive state
    logs/{task_id}.jsonl   — per-request event log lines

What stays plaintext (low sensitivity):
    logs/{task_id}_provenance.json — hashes + types + timestamps only
    state/a0_state.json            — last_model string only
"""
from __future__ import annotations

import os
from typing import Optional


def _load_fernet() -> Optional[object]:
    """Return a Fernet instance if key + library are available, else None."""
    from a0.cores.psi.tensors.env import A0_MEMORY_KEY
    key = A0_MEMORY_KEY.strip()
    if not key:
        return None
    try:
        from cryptography.fernet import Fernet  # type: ignore[import]
        return Fernet(key.encode())
    except Exception:
        return None


# Lazy singleton — initialized on first use to avoid circular imports at
# module load time (encryption ← env ← psi/tensors ← logging ← encryption).
_fernet: Optional[object] = None
_fernet_ready: bool = False


def _get_fernet() -> Optional[object]:
    global _fernet, _fernet_ready
    if not _fernet_ready:
        _fernet = _load_fernet()
        _fernet_ready = True
    return _fernet


def is_active() -> bool:
    """True when encryption is on (key present + cryptography installed)."""
    return _get_fernet() is not None


def encrypt(plaintext: str) -> str:
    """Encrypt a UTF-8 string. Returns ciphertext string or original if inactive."""
    f = _get_fernet()
    if f is None:
        return plaintext
    token: bytes = f.encrypt(plaintext.encode("utf-8"))
    return token.decode("ascii")


def decrypt(ciphertext: str) -> str:
    """Decrypt a ciphertext string. Returns plaintext or original if inactive."""
    f = _get_fernet()
    if f is None:
        return ciphertext
    try:
        plain: bytes = f.decrypt(ciphertext.encode("ascii"))
        return plain.decode("utf-8")
    except Exception:
        # Tolerate legacy plaintext files written before encryption was enabled.
        return ciphertext
# 38:23
