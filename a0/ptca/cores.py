"""
a0/ptca/cores.py — factory functions for each core type.

Spec constants (working freeze 2026-03-20):
    Live cores    (Phi, Psi, Omega): 53 seeds × 7 circles × 7 tensors
    Memory core                    : 17 seeds × 7 circles × 9 tensors
    Guardian core                  : 29 seeds total
        25 functional seeds G_k^f:
            2 UI seeds with active circles:
                guardian:cli  — 7 circles  (ingress + validate + 4 artifact circles + egress)
                guardian:http — 10 circles (ingress + validate + 5 UI components + api_response + envelope + egress)
            23 unassigned functional seeds — 0 circles (capacity for future surfaces)
            inward face per circle : 5 tensors  (t0–t4)
            outward face per circle: 9 tensors  (t5–t13)
            total per circle       : 14 tensors, all standard type
        4 sentinel seeds G_k^s:
            circles: 0 (preflight/postflight future)
            when active: 11 Γ-typed tensors per circle
                Γ₁–Γ₄ structural | Γ₅–Γ₈ executable | Γ₉–Γ₁₁ integrity

    Architectural principle: each UI artifact = one circle.
    Guardian is the sole owner of CLI, UI, and all human-readable outward emission.

    Hard rules (canon-locked):
        functional seeds CANNOT write Γ tensors
        Γ updates require unanimous 4-sentinel consent + Meta-13 signature
        hmmm invariant: enforced at validate circle (fail-closed on empty hmm, Core Law 14)
        BAD screening: enforced at ingress circle (t1: bad_clear)
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Callable, Dict, List
from uuid import uuid4

from ..contract import A0Request, A0Response
from ..logging import log_event
from .types import (
    Circle,
    CircularTensor,
    Core,
    GuardianTensorTopology,
    PhononField,
    Seed,
    SentinelCode,
    Tensor,
)

# ─────────────────────────────────────────────────────────────────────────────
# Spec constants
# ─────────────────────────────────────────────────────────────────────────────

LIVE_SEEDS = 53
LIVE_CIRCLES = 7
LIVE_TENSORS = 7
JURY_SEEDS_PER_CORE = 4          # seeds 0–3 in each live core are sentinel seeds

MEM_SEEDS = 17
MEM_CIRCLES = 7
MEM_TENSORS = 9                  # 7 standard + phase_variance + spin_variance

GUARD_SEEDS = 29
GUARD_FUNCTIONAL_SEEDS = 25      # G_k^f  (indices 0–24)
GUARD_SENTINEL_SEEDS = 4         # G_k^s  (indices 25–28)

GUARD_CLI_CIRCLES = 7            # ingress + validate + 4 artifact circles + egress
GUARD_HTTP_CIRCLES = 10          # ingress + validate + 5 UI components + api_response + envelope + egress
GUARD_CIRCLE_TENSORS = 14        # 5 inward (t0–t4) + 9 outward (t5–t13) per functional circle
GUARD_INWARD_TENSORS = 5         # per functional circle inward face
GUARD_OUTWARD_TENSORS = 9        # per functional circle outward face
GUARD_SENTINEL_TENSORS = 11      # Γ₁–Γ₁₁ per sentinel circle (when active)

# Γ tensor layout (index 0-based): structural × 4, executable × 4, integrity × 3
GAMMA_LAYOUT: List[str] = (
    ["structural"] * 4 +    # Γ₁–Γ₄
    ["executable"] * 4 +    # Γ₅–Γ₈
    ["integrity"]  * 3      # Γ₉–Γ₁₁
)

# Log directory for guardian assembly events (mirrors router.LOG_DIR)
_GUARD_LOG_DIR = Path(__file__).resolve().parent.parent / "logs"

# Topology singletons (shared across all seeds of each kind)
_FUNCTIONAL_TOPOLOGY = GuardianTensorTopology(
    inward_count=GUARD_INWARD_TENSORS,
    outward_count=GUARD_OUTWARD_TENSORS,
)
_SENTINEL_TOPOLOGY = GuardianTensorTopology(
    gamma_count=GUARD_SENTINEL_TENSORS,
    gamma_layout=GAMMA_LAYOUT,
)


# ─────────────────────────────────────────────────────────────────────────────
# Internal helpers
# ─────────────────────────────────────────────────────────────────────────────

def _make_tensors(circle_id: str, count: int) -> List[Tensor]:
    """Build *count* Tensor objects for a circle.

    Memory circles (count == MEM_TENSORS == 9) use phase_variance / spin_variance
    for tensors at index count-2 and count-1 respectively.
    All other circles (live, guardian) use standard type throughout.
    """
    tensors = []
    for i in range(count):
        if i == count - 2 and count == MEM_TENSORS:
            t_type = "phase_variance"
        elif i == count - 1 and count == MEM_TENSORS:
            t_type = "spin_variance"
        else:
            t_type = "standard"
        tensors.append(Tensor(
            id=f"{circle_id}:t{i}",
            circle_id=circle_id,
            tensor_type=t_type,
        ))
    return tensors


def _make_circles(seed_id: str, n_circles: int, n_tensors: int) -> List[Circle]:
    """Build live/memory circles (no handler, no phase)."""
    circles = []
    for c in range(n_circles):
        cid = f"{seed_id}:c{c}"
        circles.append(Circle(
            id=cid,
            seed_id=seed_id,
            tensors=_make_tensors(cid, n_tensors),
        ))
    return circles


def _make_guardian_circle(
    seed_id: str,
    index: int,
    phase: str,
    handler: Callable,
) -> Circle:
    """Build one Guardian functional circle with handler and phase attached.

    14 tensors (5 inward t0–t4, 9 outward t5–t13), all standard type.
    Tensor roles are positional — documented in each handler's comments below.
    """
    cid = f"{seed_id}:c{index}"
    return Circle(
        id=cid,
        seed_id=seed_id,
        tensors=_make_tensors(cid, GUARD_CIRCLE_TENSORS),
        handler=handler,
        phase=phase,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Guardian CLI handlers  (guardian:cli — 7 circles)
#
#   Circle 0 — ingress       : receive stdin/file → A0Request
#   Circle 1 — validate      : hmmm invariant gate (FAIL-CLOSED, Core Law 14)
#   Circle 2 — response_text : render result.text
#   Circle 3 — artifacts     : render result.artifacts
#   Circle 4 — logs          : render resp.logs
#   Circle 5 — hmm_display   : render resp.hmm register
#   Circle 6 — egress        : assemble + write to stdout
# ─────────────────────────────────────────────────────────────────────────────

def _cli_ingress(raw: str) -> A0Request:
    # Inward face (5 tensors):
    #   t0: gate_open       — entry permitted
    #   t1: bad_clear       — BAD screening: input non-empty, not adversarial
    #   t2: raw_valid       — raw non-empty after strip
    #   t3: parse_ok        — json.loads succeeds
    #   t4: request_formed  — A0Request constructed
    # Outward face (9 tensors):
    #   t5:  task_id          t6:  input_text       t7:  file_count
    #   t8:  tools_allowed    t9:  mode             t10: metadata_present
    #   t11: hmm              t12: format("json")   t13: encode("utf-8")
    if not raw or not raw.strip():
        raise ValueError("guardian:cli ingress — empty input (bad_clear=False)")
    data = json.loads(raw)
    return A0Request(
        task_id=data.get("task_id") or f"task_{uuid4().hex[:12]}",
        input=data.get("input") or {"text": "", "files": [], "metadata": {}},
        tools_allowed=data.get("tools_allowed") or ["none"],
        mode=data.get("mode") or "analyze",
        hmm=data.get("hmm") or ["hmm"],
    )


def _cli_validate(resp: A0Response) -> A0Response:
    # Inward face (5 tensors):
    #   t0: result_ok         — resp is non-None
    #   t1: hmmm_present      — FAIL-CLOSED: hmmm invariant gate (Core Law 14)
    #   t2: task_id_ok        — task_id non-empty
    #   t3: format_ok         — result is a dict
    #   t4: source_valid      — result has expected keys
    # Outward face (9 tensors):
    #   t5:  task_id          t6:  result_text       t7:  artifact_count
    #   t8:  log_count        t9:  hmm               t10: mode
    #   t11: tools            t12: adapter           t13: version
    if not resp.hmm:
        raise ValueError("guardian:cli validate — hmmm absent, emission blocked (fail-closed)")
    return resp


def _cli_response_text(resp: A0Response) -> str:
    # Artifact circle: renders result.text.
    # Inward:  t0: source_ok  t1: content_present  t2: format_ok  t3: encode_ok  t4: hmm_present
    # Outward: t5: rendered   t6: component_id     t7: content    t8: count      t9: format
    #          t10: style      t11: encoding        t12: audit     t13: hmm_out
    return (resp.result or {}).get("text", "")


def _cli_artifacts(resp: A0Response) -> list:
    # Artifact circle: renders result.artifacts list.
    # Inward:  t0: source_ok  t1: content_present  t2: format_ok  t3: encode_ok  t4: hmm_present
    # Outward: t5: rendered   t6: component_id     t7: content    t8: count      t9: format
    #          t10: style      t11: encoding        t12: audit     t13: hmm_out
    return (resp.result or {}).get("artifacts", [])


def _cli_logs(resp: A0Response) -> Any:
    # Artifact circle: renders resp.logs.
    # Inward:  t0: source_ok  t1: content_present  t2: format_ok  t3: encode_ok  t4: hmm_present
    # Outward: t5: rendered   t6: component_id     t7: content    t8: count      t9: format
    #          t10: style      t11: encoding        t12: audit     t13: hmm_out
    return resp.logs


def _cli_hmm_display(resp: A0Response) -> list:
    # Artifact circle: renders resp.hmm register.
    # Inward:  t0: source_ok  t1: content_present  t2: format_ok  t3: encode_ok  t4: hmm_present
    # Outward: t5: rendered   t6: component_id     t7: content    t8: count      t9: format
    #          t10: style      t11: encoding        t12: audit     t13: hmm_out
    return resp.hmm


def _cli_egress(resp: A0Response) -> None:
    # Egress circle: assemble all components and write to stdout.
    # Inward:  t0: display_valid  t1: channel_open   t2: encode_ok    t3: flush_ok  t4: gate_closed
    # Outward: t5: bytes_written  t6: stdout_fd      t7: newline      t8: flush     t9: encoding("utf-8")
    #          t10: exit_code      t11: stream_closed  t12: audit_hash  t13: hmm_out
    out = {
        "task_id": resp.task_id,
        "result":  resp.result,
        "logs":    resp.logs,
        "hmm":     resp.hmm,
    }
    print(json.dumps(out, indent=2, ensure_ascii=False))


# ─────────────────────────────────────────────────────────────────────────────
# Guardian HTTP handlers  (guardian:http — 10 circles)
#
#   Circle 0 — ingress        : receive POST payload → A0Request
#   Circle 1 — validate       : hmmm invariant gate (FAIL-CLOSED, Core Law 14)
#   Circle 2 — agent_chat     : agent chat tab / conversation display (placeholder)
#   Circle 3 — energy_display : energy / resource / token usage display (placeholder)
#   Circle 4 — tools_display  : active tools panel (placeholder)
#   Circle 5 — api_set        : API / model / adapter configuration panel (placeholder)
#   Circle 6 — env_display    : .env / environment configuration panel (placeholder)
#   Circle 7 — api_response   : POST /a0 JSON response body
#   Circle 8 — envelope       : HTTP status, Content-Type, CORS headers
#   Circle 9 — egress         : return final response dict to FastAPI
# ─────────────────────────────────────────────────────────────────────────────

def _http_ingress(payload: Dict[str, Any]) -> A0Request:
    # Inward face (5 tensors):
    #   t0: gate_open       — entry permitted
    #   t1: bad_clear       — BAD screening: payload is a dict
    #   t2: raw_valid       — payload non-empty
    #   t3: parse_ok        — fields extractable
    #   t4: request_formed  — A0Request constructed
    # Outward face (9 tensors):
    #   t5:  task_id          t6:  input_text       t7:  file_count
    #   t8:  tools_allowed    t9:  mode             t10: metadata_present
    #   t11: hmm              t12: content_type("application/json")  t13: encoding("utf-8")
    if not isinstance(payload, dict):
        raise ValueError("guardian:http ingress — payload not a dict (bad_clear=False)")
    return A0Request(
        task_id=payload.get("task_id", "hub_task"),
        input=payload.get("input", {
            "text": payload.get("text", ""),
            "files": payload.get("files", []),
            "metadata": payload.get("metadata", {}),
        }),
        tools_allowed=payload.get("tools_allowed", ["none"]),
        mode=payload.get("mode", "analyze"),
        hmm=payload.get("hmm", ["hmm"]),
    )


def _http_validate(resp: A0Response) -> A0Response:
    # Inward face (5 tensors):
    #   t0: result_ok         — resp is non-None
    #   t1: hmmm_present      — FAIL-CLOSED: hmmm invariant gate (Core Law 14)
    #   t2: task_id_ok        — task_id non-empty
    #   t3: format_ok         — result is a dict
    #   t4: source_valid      — result has expected keys
    # Outward face (9 tensors):
    #   t5:  task_id          t6:  result_text       t7:  artifact_count
    #   t8:  log_count        t9:  hmm               t10: mode
    #   t11: tools            t12: adapter           t13: version
    if not resp.hmm:
        raise ValueError("guardian:http validate — hmmm absent, emission blocked (fail-closed)")
    return resp


def _http_agent_chat(resp: A0Response) -> A0Response:
    # Artifact circle: agent chat tab / conversation display.
    # Inward:  t0: source_ok  t1: content_present  t2: format_ok  t3: encode_ok  t4: hmm_present
    # Outward: t5: rendered   t6: component_id("agent_chat")  t7: content  t8: count  t9: format
    #          t10: style      t11: encoding        t12: audit     t13: hmm_out
    # Placeholder — future: render conversation as HTML/JSON component.
    return resp


def _http_energy_display(resp: A0Response) -> A0Response:
    # Artifact circle: energy / resource / token usage display.
    # Inward:  t0: source_ok  t1: content_present  t2: format_ok  t3: encode_ok  t4: hmm_present
    # Outward: t5: rendered   t6: component_id("energy_display")  t7: content  t8: count  t9: format
    #          t10: style      t11: encoding        t12: audit     t13: hmm_out
    # Placeholder — future: compute and render energy/resource metrics.
    return resp


def _http_tools_display(resp: A0Response) -> A0Response:
    # Artifact circle: active tools panel.
    # Placeholder — future: render tools_allowed as a UI panel.
    return resp


def _http_api_set(resp: A0Response) -> A0Response:
    # Artifact circle: API / model / adapter configuration panel.
    # Placeholder — future: render API and model configuration.
    return resp


def _http_env_display(resp: A0Response) -> A0Response:
    # Artifact circle: .env / environment configuration panel.
    # Placeholder — future: render safe/permitted environment variables.
    return resp


def _http_api_response(resp: A0Response) -> Dict[str, Any]:
    # Artifact circle: POST /a0 JSON response body.
    # Inward:  t0: source_ok  t1: content_present  t2: format_ok  t3: encode_ok  t4: hmm_present
    # Outward: t5: body_dict  t6: task_id  t7: result_text  t8: artifact_count  t9: log_count
    #          t10: hmm        t11: status(200)      t12: schema_version  t13: render_format("json")
    return {"task_id": resp.task_id, "result": resp.result, "logs": resp.logs, "hmm": resp.hmm}


def _http_envelope(body: Dict[str, Any]) -> Dict[str, Any]:
    # Envelope circle: HTTP status, Content-Type, CORS.
    # Inward:  t0: body_ok   t1: status_set  t2: cors_ok   t3: type_set  t4: gate_closed
    # Outward: t5: status_code(200)  t6: content_type  t7: cors_header  t8: cache_ctrl  t9: encoding
    #          t10: audit_hash  t11: schema_ver  t12: hmm_out  t13: newline
    # Currently passthrough — grows into header management, compression, signing.
    return body


def _http_egress(body: Dict[str, Any]) -> Dict[str, Any]:
    # Egress circle: return final response dict to FastAPI.
    # Inward:  t0: display_valid  t1: channel_open  t2: encode_ok  t3: flush_ok  t4: gate_closed
    # Outward: t5: wire_body  t6: content_type  t7: cors_header  t8: status_code(200)  t9: encoding
    #          t10: cache_control  t11: audit_hash  t12: hmm_out  t13: newline
    return body


# ─────────────────────────────────────────────────────────────────────────────
# Guardian seed builders
# ─────────────────────────────────────────────────────────────────────────────

def _build_cli_seed() -> Seed:
    """Build the guardian:cli UI seed with 7 executable circles.

    Each circle owns one displayable artifact or gate role.
    Tensor roles are positional (5 inward t0–t4, 9 outward t5–t13).
    See handler function comments above for per-circle tensor documentation.
    """
    phases_and_handlers = [
        ("ingress",       _cli_ingress),
        ("validate",      _cli_validate),
        ("response_text", _cli_response_text),
        ("artifacts",     _cli_artifacts),
        ("logs",          _cli_logs),
        ("hmm_display",   _cli_hmm_display),
        ("egress",        _cli_egress),
    ]
    circles = [
        _make_guardian_circle("guardian:cli", i, phase, handler)
        for i, (phase, handler) in enumerate(phases_and_handlers)
    ]
    return Seed(
        id="guardian:cli",
        core_id="guardian",
        circles=circles,
        seed_kind="guardian_ui_cli",
        guardian_topology=_FUNCTIONAL_TOPOLOGY,
    )


def _build_http_seed() -> Seed:
    """Build the guardian:http UI seed with 10 executable circles.

    Each circle owns one displayable component or gate role.
    Circles 2–6 are placeholder (identity passthrough) — architecture declared
    before implementation. They are named, logged, and carry full tensor layouts.
    """
    phases_and_handlers = [
        ("ingress",        _http_ingress),
        ("validate",       _http_validate),
        ("agent_chat",     _http_agent_chat),
        ("energy_display", _http_energy_display),
        ("tools_display",  _http_tools_display),
        ("api_set",        _http_api_set),
        ("env_display",    _http_env_display),
        ("api_response",   _http_api_response),
        ("envelope",       _http_envelope),
        ("egress",         _http_egress),
    ]
    circles = [
        _make_guardian_circle("guardian:http", i, phase, handler)
        for i, (phase, handler) in enumerate(phases_and_handlers)
    ]
    return Seed(
        id="guardian:http",
        core_id="guardian",
        circles=circles,
        seed_kind="guardian_ui_http",
        guardian_topology=_FUNCTIONAL_TOPOLOGY,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Public factories
# ─────────────────────────────────────────────────────────────────────────────

def build_live_core(family: str) -> Core:
    """Build one private PTCA live core (Phi, Psi, or Omega).

    53 seeds × 7 circles × 7 tensors.
    Seeds 0–3 are marked as sentinel seeds with shared + unique codes.
    """
    family = family.lower()
    seeds: List[Seed] = []
    for s in range(LIVE_SEEDS):
        seed_id = f"{family}:s{s}"
        is_sentinel = s < JURY_SEEDS_PER_CORE
        sentinel_code = (
            SentinelCode(
                shared_code=family,
                unique_code=f"{family}_{s}",
            )
            if is_sentinel
            else None
        )
        seeds.append(Seed(
            id=seed_id,
            core_id=family,
            circles=_make_circles(seed_id, LIVE_CIRCLES, LIVE_TENSORS),
            sentinel_code=sentinel_code,
        ))
    return Core(name=family, core_type="live", seeds=seeds)


def build_memory_core() -> Core:
    """Build the shared memory core.

    17 seeds × 7 circles × 9 tensors.
    Tensors 7 and 8 of every circle carry phase_variance and spin_variance.
    """
    seeds: List[Seed] = []
    for s in range(MEM_SEEDS):
        seed_id = f"memory:s{s}"
        seeds.append(Seed(
            id=seed_id,
            core_id="memory",
            circles=_make_circles(seed_id, MEM_CIRCLES, MEM_TENSORS),
        ))
    return Core(name="memory", core_type="memory", seeds=seeds)


def build_guardian_core() -> Core:
    """Build the Guardian microkernel core.

    29 seeds total:
        Seed 0  (guardian:cli)  — 7 circles: ingress + validate + 4 artifact circles + egress
        Seed 1  (guardian:http) — 10 circles: ingress + validate + 5 UI components + api_response + envelope + egress
        Seeds 2–24              — 23 unassigned functional seeds (0 circles, capacity for future surfaces)
        Seeds 25–28             — 4 sentinel seeds (0 circles, Γ topology locked)

    Logs each seed to guardian_assembly.jsonl (one event per seed, task_id="guardian_assembly").
    Architectural principle: each UI artifact = one circle.
    Guardian is the sole owner of CLI, UI, and all human-readable outward emission.
    """
    seeds: List[Seed] = []

    # ── Seed 0: guardian:cli ─────────────────────────────────────────────────
    cli_seed = _build_cli_seed()
    seeds.append(cli_seed)
    log_event(_GUARD_LOG_DIR, "guardian_assembly", {
        "type": "guardian_seed",
        "seed_id": "guardian:cli",
        "seed_kind": "guardian_ui_cli",
        "circles": GUARD_CLI_CIRCLES,
        "hmm": ["assembly"],
    })

    # ── Seed 1: guardian:http ────────────────────────────────────────────────
    http_seed = _build_http_seed()
    seeds.append(http_seed)
    log_event(_GUARD_LOG_DIR, "guardian_assembly", {
        "type": "guardian_seed",
        "seed_id": "guardian:http",
        "seed_kind": "guardian_ui_http",
        "circles": GUARD_HTTP_CIRCLES,
        "hmm": ["assembly"],
    })

    # ── Seeds 2–24: unassigned functional seeds ───────────────────────────────
    for i in range(2, GUARD_FUNCTIONAL_SEEDS):
        seed_id = f"guardian:s{i}"
        seeds.append(Seed(
            id=seed_id,
            core_id="guardian",
            circles=[],
            seed_kind="guardian_functional",
            guardian_topology=_FUNCTIONAL_TOPOLOGY,
        ))
        log_event(_GUARD_LOG_DIR, "guardian_assembly", {
            "type": "guardian_seed",
            "seed_id": seed_id,
            "seed_kind": "guardian_functional",
            "circles": 0,
            "hmm": ["assembly"],
        })

    # ── Seeds 25–28: sentinel seeds ───────────────────────────────────────────
    for i in range(GUARD_FUNCTIONAL_SEEDS, GUARD_SEEDS):
        seed_id = f"guardian:s{i}"
        seeds.append(Seed(
            id=seed_id,
            core_id="guardian",
            circles=[],
            seed_kind="guardian_sentinel",
            guardian_topology=_SENTINEL_TOPOLOGY,
        ))
        log_event(_GUARD_LOG_DIR, "guardian_assembly", {
            "type": "guardian_seed",
            "seed_id": seed_id,
            "seed_kind": "guardian_sentinel",
            "circles": 0,
            "hmm": ["assembly"],
        })

    return Core(name="guardian", core_type="guardian", seeds=seeds)


def build_phonon_field() -> PhononField:
    """Build the shared phonon / PCTA transport field.

    Connects Phi / Psi / Omega without mixing their private seed geometries.
    Circular tensor machinery initialised to identity state (θ=0, r=1).
    """
    return PhononField(
        circular_tensor=CircularTensor(
            theta=0.0,
            r=1.0,
            ell=0.0,
            A_k=[],
            H_k=[],
            P_k=[],
        ),
        connected_cores=["phi", "psi", "omega"],
    )
