# 68:35 0:0 1:0
"""
Coherence-prime sequence. Definition fully pinned.

  Base: C₀ = {3, 5, 7}
  A prime p ∈ C iff:
    1. (p - 1) % 4 == 0          — p ≡ 1 mod 4
    2. (p - 1) // 4 is squarefree — no repeated prime factors
    3. every prime factor of (p - 1) // 4 is already in C

Verified sequence: 3, 5, 7, 13, 29, 53, 61, 157, 349, 421, ...

Rejection examples (held as module-level documentation):
  17: kernel = (17-1)//4 = 4 = 2²  — not squarefree
  19: (19-1) % 4 = 2 ≠ 0           — fails condition 1
"""
from __future__ import annotations

# === MODULE_BUILD ===
# id: a0_engine_ucns_kit_coherence_primes
#   module_name: coherence_primes
#   module_kind: engine
#   summary: Coherence-prime sequence generator — pinned definition (base {3,5,7}; p≡1 mod 4 with squarefree kernel whose factors are already coherence primes) with membership and nth lookups.
#   owner: Erin Spencer
#   public_surface: is_coherence_prime, sequence_up_to, nth
#   internal_surface: _is_prime, _is_squarefree, _prime_factors, _build_up_to
#   auth_boundary: none
#   storage_boundary: none
#   network_boundary: none
#   user_data_boundary: none
#   admin_only: false
#   tests: python/tests/test_coherence_primes.py
#   rollout: default_enabled
#   rollback: Revert this file; pure deterministic sequence generator.
#   requires: none
#   since: 2026-06-02
#   unresolved: none
# === END MODULE_BUILD ===

_BASE: frozenset[int] = frozenset({3, 5, 7})
_CACHE: list[int] = sorted(_BASE)
_KNOWN: set[int] = set(_BASE)
_SCANNED_TO: int = max(_BASE)


def _is_prime(n: int) -> bool:
    if n < 2:
        return False
    if n == 2:
        return True
    if n % 2 == 0:
        return False
    d = 3
    while d * d <= n:
        if n % d == 0:
            return False
        d += 2
    return True


def _is_squarefree(n: int) -> bool:
    d = 2
    while d * d <= n:
        if n % (d * d) == 0:
            return False
        d += 1
    return True


def _prime_factors(n: int) -> set[int]:
    factors: set[int] = set()
    d = 2
    while d * d <= n:
        while n % d == 0:
            factors.add(d)
            n //= d
        d += 1
    if n > 1:
        factors.add(n)
    return factors


def _build_up_to(limit: int) -> None:
    global _SCANNED_TO
    if limit <= _SCANNED_TO:
        return
    for p in range(_SCANNED_TO + 1, limit + 1):
        if not _is_prime(p):
            continue
        if p in _BASE:
            continue
        if (p - 1) % 4 != 0:
            continue
        kernel = (p - 1) // 4
        if not _is_squarefree(kernel):
            continue
        if _prime_factors(kernel) <= _KNOWN:
            _CACHE.append(p)
            _KNOWN.add(p)
    _SCANNED_TO = limit


def is_coherence_prime(p: int) -> bool:
    """Return True if p is a coherence prime."""
    _build_up_to(p)
    return p in _KNOWN


def sequence_up_to(limit: int) -> list[int]:
    """All coherence primes ≤ limit, ascending."""
    _build_up_to(limit)
    return [x for x in _CACHE if x <= limit]


def nth(k: int) -> int:
    """k-th coherence prime, 1-indexed. Scans forward as needed."""
    if k < 1:
        raise ValueError(f"k must be >= 1, got {k}")
    target = max(_SCANNED_TO * 2, 1_000)
    while len(_CACHE) < k:
        _build_up_to(target)
        target *= 4
    return _CACHE[k - 1]
# 68:35 0:0 1:0
