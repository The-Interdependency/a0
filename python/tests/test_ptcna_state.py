# 69:42 0:0 0:0
"""Evidence for the Platonic Agent's exact PTCNA runtime-state binding."""
from __future__ import annotations

import json
from pathlib import Path
from tempfile import TemporaryDirectory

import numpy as np
import pytest

from python.engine import PTCNAState, PTCNAStateTamperError

# === CHECKS ===
# id: check_a0_ptcna_exact_pair
#   proves: a0_ptcna_uses_exact_pair
#   call: self::test_target_uses_exact_pair_by_default
#   requires: python3, numpy, interdependent-lib, ptcna, ucns
#   timeout: 30
#   mutates: none
#   cleanup: none
#
# id: check_a0_ptcna_explicit_routing
#   proves: a0_ptcna_routing_is_explicit
#   call: self::test_fallback_is_explicit_and_separately_attributed
#   requires: python3, numpy, interdependent-lib, ptcna, ucns
#   timeout: 30
#   mutates: none
#   cleanup: none
#
# id: check_a0_ptcna_restart
#   proves: a0_ptcna_restart_round_trip
#   call: self::test_checkpoint_restart_recovers_state_and_routing
#   requires: python3, numpy, interdependent-lib, ptcna, ucns
#   timeout: 30
#   mutates: filesystem
#   cleanup: tempdir_teardown
#
# id: check_a0_ptcna_tamper
#   proves: a0_ptcna_tamper_fails_closed
#   call: self::test_checkpoint_tamper_is_rejected
#   requires: python3, numpy, interdependent-lib, ptcna, ucns
#   timeout: 30
#   mutates: filesystem
#   cleanup: tempdir_teardown
#
# id: check_a0_ptcna_platonic_binding
#   proves: a0_ptcna_binds_platonic_region
#   call: self::test_state_binds_only_declared_platonic_region
#   requires: python3, numpy, interdependent-lib, ptcna, ucns
#   timeout: 30
#   mutates: none
#   cleanup: none
# === END CHECKS ===


def _temporary_state() -> tuple[TemporaryDirectory, Path]:
    directory = TemporaryDirectory()
    return directory, Path(directory.name) / "state.json"


def test_target_uses_exact_pair_by_default() -> None:
    directory, path = _temporary_state()
    state = PTCNAState(state_path=path)
    receipt = state.infer("exact pair")
    assert receipt["requested_backend"] == "ptcna"
    assert receipt["backend_used"] == "ptcna.experimental.v1"
    assert receipt["fallback_used"] is False
    assert receipt["layers"]["core"]["ucns_state"] == "active"
    assert state.pair_receipt["compatibility"] == "SURVIVED"
    directory.cleanup()


def test_fallback_is_explicit_and_separately_attributed() -> None:
    directory, path = _temporary_state()
    state = PTCNAState(state_path=path)
    receipt = state.infer("explicit fallback", backend="fallback")
    assert receipt["requested_backend"] == "fallback"
    assert receipt["backend_used"] == "fallback.hashed-linear.v1"
    assert receipt["fallback_used"] is True
    assert receipt["routing_reason"] == "requested"
    assert state.routing_state["fallback_count"] == 1
    directory.cleanup()


@pytest.mark.asyncio
async def test_checkpoint_restart_recovers_state_and_routing() -> None:
    directory, path = _temporary_state()
    original = PTCNAState(state_path=path)
    inference = original.infer("persist me")
    original.reward(inference["winner"], 0.5)
    saved = await original.save_checkpoint()

    restarted = PTCNAState(state_path=path)
    assert await restarted.load_checkpoint() is True
    assert restarted.routing_state == original.routing_state
    assert restarted.theta.instance_id == original.theta.instance_id
    assert restarted.infer_count == original.infer_count
    assert restarted.reward_count == original.reward_count
    assert restarted.pair_receipt == saved["pair_receipt"]
    for name in ("phi", "psi", "omega", "theta", "memory_l", "memory_s"):
        assert np.array_equal(getattr(restarted, name).tensor, getattr(original, name).tensor)
    directory.cleanup()


@pytest.mark.asyncio
async def test_checkpoint_tamper_is_rejected() -> None:
    directory, path = _temporary_state()
    state = PTCNAState(state_path=path)
    state.infer("tamper evidence")
    await state.save_checkpoint()
    receipt = json.loads(path.read_text("utf-8"))
    receipt["routing_state"]["fallback_count"] = 99
    path.write_text(json.dumps(receipt), encoding="utf-8")
    with pytest.raises(PTCNAStateTamperError, match="receipt digest"):
        await PTCNAState(state_path=path).load_checkpoint()
    directory.cleanup()


def test_state_binds_only_declared_platonic_region() -> None:
    directory, path = _temporary_state()
    state = PTCNAState(state_path=path)
    projection = state.platonic_projection()
    assert projection.region == "ptcna_runtime_state"
    assert projection.unresolved == ()
    assert projection.bindings["relations"]["semantic_memory_merge_authorized"] is False
    assert "memory" not in projection.selected
    assert "inference" not in projection.selected
    directory.cleanup()
# 69:42 0:0 0:0
