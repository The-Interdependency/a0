"""
tests/test_ptca.py — structural verification of the PTCA architecture.

Every assertion maps directly to a line in the working freeze spec
(2026-03-20).  These tests do NOT require any API keys or network access.
"""

import pytest
from a0.contract import A0Response
from a0.ptca import assemble_system
from a0.ptca.cores import (
    GUARD_CIRCLE_TENSORS,
    GUARD_CLI_CIRCLES,
    GUARD_HTTP_CIRCLES,
    GUARD_SEEDS,
    JURY_SEEDS_PER_CORE,
    LIVE_CIRCLES,
    LIVE_SEEDS,
    LIVE_TENSORS,
    MEM_CIRCLES,
    MEM_SEEDS,
    MEM_TENSORS,
    _cli_validate,
    _http_validate,
)


@pytest.fixture(scope="module")
def stack():
    return assemble_system()


# ─────────────────────────────────────────────────────────────────────────────
# Live cores (Phi, Psi, Omega)
# ─────────────────────────────────────────────────────────────────────────────

class TestLiveCores:
    def test_three_live_cores_exist(self, stack):
        assert stack.phi.core_type == "live"
        assert stack.psi.core_type == "live"
        assert stack.omega.core_type == "live"

    def test_live_core_names(self, stack):
        assert stack.phi.name == "phi"
        assert stack.psi.name == "psi"
        assert stack.omega.name == "omega"

    @pytest.mark.parametrize("core_attr", ["phi", "psi", "omega"])
    def test_seed_count_per_live_core(self, stack, core_attr):
        core = getattr(stack, core_attr)
        assert len(core.seeds) == LIVE_SEEDS, (
            f"{core_attr} has {len(core.seeds)} seeds, expected {LIVE_SEEDS}"
        )

    @pytest.mark.parametrize("core_attr", ["phi", "psi", "omega"])
    def test_circles_per_live_seed(self, stack, core_attr):
        core = getattr(stack, core_attr)
        for seed in core.seeds:
            assert len(seed.circles) == LIVE_CIRCLES, (
                f"seed {seed.id} has {len(seed.circles)} circles"
            )

    @pytest.mark.parametrize("core_attr", ["phi", "psi", "omega"])
    def test_tensors_per_live_circle(self, stack, core_attr):
        core = getattr(stack, core_attr)
        for seed in core.seeds:
            for circle in seed.circles:
                assert len(circle.tensors) == LIVE_TENSORS, (
                    f"circle {circle.id} has {len(circle.tensors)} tensors"
                )

    @pytest.mark.parametrize("core_attr", ["phi", "psi", "omega"])
    def test_all_live_tensors_are_standard(self, stack, core_attr):
        core = getattr(stack, core_attr)
        for seed in core.seeds:
            for circle in seed.circles:
                for tensor in circle.tensors:
                    assert tensor.tensor_type == "standard"

    @pytest.mark.parametrize("core_attr", ["phi", "psi", "omega"])
    def test_live_circles_have_no_handler(self, stack, core_attr):
        core = getattr(stack, core_attr)
        for seed in core.seeds:
            for circle in seed.circles:
                assert circle.handler is None
                assert circle.phase == ""


# ─────────────────────────────────────────────────────────────────────────────
# Memory core
# ─────────────────────────────────────────────────────────────────────────────

class TestMemoryCore:
    def test_memory_core_type(self, stack):
        assert stack.memory.core_type == "memory"

    def test_memory_seed_count(self, stack):
        assert len(stack.memory.seeds) == MEM_SEEDS

    def test_memory_circles_per_seed(self, stack):
        for seed in stack.memory.seeds:
            assert len(seed.circles) == MEM_CIRCLES

    def test_memory_tensor_count_per_circle(self, stack):
        for seed in stack.memory.seeds:
            for circle in seed.circles:
                assert len(circle.tensors) == MEM_TENSORS

    def test_memory_phase_spin_variance_tensors(self, stack):
        for seed in stack.memory.seeds:
            for circle in seed.circles:
                types = [t.tensor_type for t in circle.tensors]
                assert types[-2] == "phase_variance", f"tensor[-2] = {types[-2]}"
                assert types[-1] == "spin_variance",  f"tensor[-1] = {types[-1]}"
                # all others are standard
                assert all(t == "standard" for t in types[:-2])


# ─────────────────────────────────────────────────────────────────────────────
# Guardian core
# ─────────────────────────────────────────────────────────────────────────────

class TestGuardianCore:
    def test_guardian_core_type(self, stack):
        assert stack.guardian.core_type == "guardian"

    def test_guardian_seed_count(self, stack):
        assert len(stack.guardian.seeds) == GUARD_SEEDS

    # ── CLI seed ──────────────────────────────────────────────────────────────

    def test_cli_seed_exists(self, stack):
        cli = next((s for s in stack.guardian.seeds if s.id == "guardian:cli"), None)
        assert cli is not None
        assert cli.seed_kind == "guardian_ui_cli"

    def test_cli_seed_has_correct_circle_count(self, stack):
        cli = next(s for s in stack.guardian.seeds if s.id == "guardian:cli")
        assert len(cli.circles) == GUARD_CLI_CIRCLES

    def test_cli_circle_phases(self, stack):
        cli = next(s for s in stack.guardian.seeds if s.id == "guardian:cli")
        expected = ["ingress", "validate", "response_text", "artifacts", "logs", "hmm_display", "egress"]
        assert [c.phase for c in cli.circles] == expected

    def test_cli_circles_have_handlers(self, stack):
        cli = next(s for s in stack.guardian.seeds if s.id == "guardian:cli")
        for circle in cli.circles:
            assert circle.handler is not None, f"circle {circle.phase} has no handler"

    def test_cli_circles_have_14_tensors(self, stack):
        cli = next(s for s in stack.guardian.seeds if s.id == "guardian:cli")
        for circle in cli.circles:
            assert len(circle.tensors) == GUARD_CIRCLE_TENSORS, (
                f"circle {circle.phase} has {len(circle.tensors)} tensors, expected {GUARD_CIRCLE_TENSORS}"
            )

    def test_cli_all_tensors_standard(self, stack):
        cli = next(s for s in stack.guardian.seeds if s.id == "guardian:cli")
        for circle in cli.circles:
            for tensor in circle.tensors:
                assert tensor.tensor_type == "standard"

    # ── HTTP seed ─────────────────────────────────────────────────────────────

    def test_http_seed_exists(self, stack):
        http = next((s for s in stack.guardian.seeds if s.id == "guardian:http"), None)
        assert http is not None
        assert http.seed_kind == "guardian_ui_http"

    def test_http_seed_has_correct_circle_count(self, stack):
        http = next(s for s in stack.guardian.seeds if s.id == "guardian:http")
        assert len(http.circles) == GUARD_HTTP_CIRCLES

    def test_http_circle_phases(self, stack):
        http = next(s for s in stack.guardian.seeds if s.id == "guardian:http")
        expected = [
            "ingress", "validate",
            "agent_chat", "energy_display", "tools_display", "api_set", "env_display",
            "api_response", "envelope", "egress",
        ]
        assert [c.phase for c in http.circles] == expected

    def test_http_circles_have_handlers(self, stack):
        http = next(s for s in stack.guardian.seeds if s.id == "guardian:http")
        for circle in http.circles:
            assert circle.handler is not None, f"circle {circle.phase} has no handler"

    def test_http_circles_have_14_tensors(self, stack):
        http = next(s for s in stack.guardian.seeds if s.id == "guardian:http")
        for circle in http.circles:
            assert len(circle.tensors) == GUARD_CIRCLE_TENSORS

    # ── Unassigned functional seeds ───────────────────────────────────────────

    def test_unassigned_functional_seeds_count(self, stack):
        unassigned = [
            s for s in stack.guardian.seeds
            if s.seed_kind == "guardian_functional"
        ]
        # 25 functional total − 2 UI seeds = 23 unassigned
        assert len(unassigned) == 23

    def test_unassigned_functional_seeds_have_zero_circles(self, stack):
        for seed in stack.guardian.seeds:
            if seed.seed_kind == "guardian_functional":
                assert len(seed.circles) == 0, (
                    f"unassigned seed {seed.id} has {len(seed.circles)} circles"
                )

    # ── Sentinel seeds ────────────────────────────────────────────────────────

    def test_sentinel_seeds_count(self, stack):
        sentinels = [s for s in stack.guardian.seeds if s.seed_kind == "guardian_sentinel"]
        assert len(sentinels) == 4

    def test_sentinel_seeds_have_zero_circles(self, stack):
        for seed in stack.guardian.seeds:
            if seed.seed_kind == "guardian_sentinel":
                assert len(seed.circles) == 0

    def test_sentinel_seeds_have_gamma_topology(self, stack):
        for seed in stack.guardian.seeds:
            if seed.seed_kind == "guardian_sentinel":
                assert seed.guardian_topology is not None
                assert seed.guardian_topology.gamma_count == 11

    # ── hmmm invariant enforcement ────────────────────────────────────────────

    def test_cli_validate_blocks_on_empty_hmm(self):
        bad_resp = A0Response(task_id="t", result={}, hmm=[])
        with pytest.raises(ValueError, match="hmmm absent"):
            _cli_validate(bad_resp)

    def test_http_validate_blocks_on_empty_hmm(self):
        bad_resp = A0Response(task_id="t", result={}, hmm=[])
        with pytest.raises(ValueError, match="hmmm absent"):
            _http_validate(bad_resp)

    def test_cli_validate_passes_with_hmm(self):
        good_resp = A0Response(task_id="t", result={}, hmm=["hmm"])
        result = _cli_validate(good_resp)
        assert result is good_resp

    def test_http_validate_passes_with_hmm(self):
        good_resp = A0Response(task_id="t", result={}, hmm=["hmm"])
        result = _http_validate(good_resp)
        assert result is good_resp


# ─────────────────────────────────────────────────────────────────────────────
# Phonon field
# ─────────────────────────────────────────────────────────────────────────────

class TestPhononField:
    def test_phonon_field_exists(self, stack):
        assert stack.phonon_field is not None

    def test_phonon_field_connects_three_cores(self, stack):
        assert sorted(stack.phonon_field.connected_cores) == ["omega", "phi", "psi"]

    def test_phonon_field_circular_tensor(self, stack):
        ct = stack.phonon_field.circular_tensor
        assert ct.theta == 0.0
        assert ct.r == 1.0
        assert ct.ell == 0.0


# ─────────────────────────────────────────────────────────────────────────────
# Jury sentinels
# ─────────────────────────────────────────────────────────────────────────────

class TestJury:
    def test_twelve_jury_sentinels(self, stack):
        assert len(stack.jury) == 12

    def test_four_sentinels_per_family(self, stack):
        for family in ("phi", "psi", "omega"):
            count = sum(1 for j in stack.jury if j.family == family)
            assert count == JURY_SEEDS_PER_CORE, (
                f"{family} has {count} sentinels, expected {JURY_SEEDS_PER_CORE}"
            )

    def test_sentinel_indices_unique_and_sequential(self, stack):
        indices = [j.sentinel_index for j in stack.jury]
        assert indices == list(range(12))

    def test_sentinel_codes_unique(self, stack):
        unique_codes = [j.sentinel_code.unique_code for j in stack.jury]
        assert len(set(unique_codes)) == 12

    def test_sentinel_shared_codes_match_family(self, stack):
        for j in stack.jury:
            assert j.sentinel_code.shared_code == j.family

    def test_sentinel_seeds_have_sentinel_code_set(self, stack):
        for j in stack.jury:
            assert j.seed.sentinel_code is not None


# ─────────────────────────────────────────────────────────────────────────────
# Meta-sentinel (13th)
# ─────────────────────────────────────────────────────────────────────────────

class TestMetaSentinel:
    def test_meta_sentinel_integrates_all_twelve(self, stack):
        assert len(stack.meta_sentinel.jury) == 12

    def test_integrated_codes_count(self, stack):
        # 12 unique + 3 shared family codes = 15
        assert len(stack.meta_sentinel.integrated_codes) == 15

    def test_integrated_codes_contain_all_families(self, stack):
        codes = stack.meta_sentinel.integrated_codes
        for family in ("phi", "psi", "omega"):
            assert family in codes

    def test_integrated_codes_contain_all_unique(self, stack):
        codes = set(stack.meta_sentinel.integrated_codes)
        for j in stack.jury:
            assert j.sentinel_code.unique_code in codes


# ─────────────────────────────────────────────────────────────────────────────
# Tokens
# ─────────────────────────────────────────────────────────────────────────────

class TestTokens:
    def test_token_count(self, stack):
        # 3 live cores × 53 seeds = 159
        assert len(stack.tokens) == 3 * LIVE_SEEDS

    def test_each_token_has_seven_token_tensors(self, stack):
        for tok in stack.tokens:
            assert len(tok.token_circle.token_tensors) == LIVE_CIRCLES, (
                f"token for {tok.seed_id} has "
                f"{len(tok.token_circle.token_tensors)} token-tensors"
            )

    def test_token_seed_ids_unique(self, stack):
        seed_ids = [tok.seed_id for tok in stack.tokens]
        assert len(seed_ids) == len(set(seed_ids))

    def test_tokens_reference_live_seeds(self, stack):
        live_seed_ids = set()
        for core in (stack.phi, stack.psi, stack.omega):
            for seed in core.seeds:
                live_seed_ids.add(seed.id)
        for tok in stack.tokens:
            assert tok.seed_id in live_seed_ids


# ─────────────────────────────────────────────────────────────────────────────
# End-to-end: router smoke (no API key needed)
# ─────────────────────────────────────────────────────────────────────────────

class TestRouterSmoke:
    def test_router_returns_meta_sentinel_codes_in_state(self):
        import json, subprocess, sys
        payload = json.dumps({"input": {"text": "ping"}})
        result = subprocess.run(
            [sys.executable, "-m", "a0.a0"],
            input=payload,
            capture_output=True,
            text=True,
            cwd="/home/user/a0",
        )
        assert result.returncode == 0
        out = json.loads(result.stdout)
        assert out["task_id"]
        assert out["result"]["text"] == "(local-echo) ping"
