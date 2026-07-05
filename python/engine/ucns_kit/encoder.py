# 36:35
"""
text_to_ucns — tokenize text; map closed-class tokens to UCNSObject.
Open-class tokens emit None; caller decides handling.

hmmm: edcmbone import path not resolved — pip-install vs vendored.
      Blocked on edcmbone issue #46 (ucns_v04 must be on sys.path).
      Function raises RuntimeError at call time until resolved.
"""
from __future__ import annotations

# === MODULE_BUILD ===
# id: a0_engine_ucns_kit_encoder
#   module_name: encoder
#   module_kind: engine
#   summary: text_to_ucns — tokenizes text and maps closed-class tokens to UCNSObjects (open-class tokens emit None); currently blocked on edcmbone import resolution.
#   owner: Erin Spencer
#   public_surface: text_to_ucns
#   internal_surface: _tokenize, _entry_to_ucns
#   auth_boundary: none
#   storage_boundary: none
#   network_boundary: none
#   user_data_boundary: read
#   admin_only: false
#   tests: hmmm
#   rollout: default_enabled
#   rollback: Revert this file; encoder raises RuntimeError at call time until edcmbone import is resolved, so no live consumers depend on it.
#   requires: none
#   since: 2026-06-02
#   unresolved: edcmbone import path unresolved (pip-install vs vendored); blocked on edcmbone issue #46 (ucns_v04 on sys.path); raises RuntimeError at call time until resolved.
# === END MODULE_BUILD ===

import re

try:
    from ucns_v04 import UCNSObject, AnchorPayload
    from closed_tokens import DISPATCH
    _EDCMBONE_AVAILABLE = True
except ImportError:
    _EDCMBONE_AVAILABLE = False

_TOKEN_RE = re.compile(r"[a-z']+|[0-9]+|[^\s\w]", re.IGNORECASE)


def _tokenize(text: str) -> list[str]:
    return [t.lower() for t in _TOKEN_RE.findall(text)]


def text_to_ucns(text: str) -> list:
    """
    Tokenize text; return list[UCNSObject | None] per token.
    None indicates open-class (no bone entry); caller decides handling.
    """
    if not _EDCMBONE_AVAILABLE:
        raise RuntimeError(
            "edcmbone dependencies not importable (expected `ucns_v04` and "
            "`closed_tokens`). Run from repo root or resolve edcmbone issue #46."
        )
    result = []
    for token in _tokenize(text):
        entry = DISPATCH.get(token)
        result.append(_entry_to_ucns(entry) if entry is not None else None)
    return result


def _entry_to_ucns(entry: dict):
    """Build a UCNSObject from a closed_tokens DISPATCH entry.

    hmmm: entry-to-UCNSObject mapping not yet specified in protocol.
    Provisional: unit object with n_dec derived from bone class hash.
    """
    from fractions import Fraction
    import hashlib
    cls = str(entry.get("class", ""))
    bone_class_hash = int.from_bytes(
        hashlib.sha256(cls.encode("utf-8")).digest()[:2], "big"
    ) % 53 or 1
    return UCNSObject(
        n_dec=bone_class_hash,
        n_min=1,
        anchors_pos=(AnchorPayload(theta=Fraction(0), payload=None),),
        faces_pos=(0,),
    )
# 36:35
