# 31:7 0:0 0:0
"""Unit tests for python/engine/ucns_kit/coherence_primes.py."""
from __future__ import annotations

import importlib
import types

import pytest


def _load() -> types.ModuleType:
    spec = importlib.util.spec_from_file_location(
        "coherence_primes",
        "python/engine/ucns_kit/coherence_primes.py",
    )
    mod = importlib.util.module_from_spec(spec)  # type: ignore[arg-type]
    spec.loader.exec_module(mod)  # type: ignore[union-attr]
    return mod


@pytest.fixture(scope="module")
def cp():
    return _load()


def test_sequence_up_to_100(cp) -> None:
    """Sequence of coherence primes up to 100 matches pinned definition."""
    assert cp.sequence_up_to(100) == [3, 5, 7, 13, 29, 53, 61]


def test_base_elements_are_coherence_primes(cp) -> None:
    """Base set {3, 5, 7} are all coherence primes."""
    for p in (3, 5, 7):
        assert cp.is_coherence_prime(p), f"{p} should be a coherence prime"


def test_17_rejected_not_squarefree(cp) -> None:
    """17 is rejected: kernel (17-1)//4 = 4 = 2² is not squarefree."""
    assert not cp.is_coherence_prime(17)


def test_19_rejected_fails_mod4(cp) -> None:
    """19 is rejected: (19-1) % 4 = 2 ≠ 0, fails condition 1."""
    assert not cp.is_coherence_prime(19)


def test_nth_returns_correct_elements(cp) -> None:
    """nth() returns the correct 1-indexed coherence prime."""
    expected = [3, 5, 7, 13, 29, 53, 61]
    for i, val in enumerate(expected, start=1):
        assert cp.nth(i) == val


def test_nth_invalid_k_raises(cp) -> None:
    """nth(k) raises ValueError for k < 1."""
    with pytest.raises(ValueError):
        cp.nth(0)
# 31:7 0:0 0:0
