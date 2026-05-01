# 291:11
import time
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from ._admin_gate import require_admin

# DOC module: pcna
# DOC label: PCNA Engine
# DOC description: Probabilistic Cognitive Network Architecture engine. Manages inference, reward signaling, phi-state propagation, and audit trails for the core reasoning subsystem.
# DOC tier: ws
# DOC endpoint: GET /api/v1/pcna/state | Get current PCNA engine state
# DOC endpoint: POST /api/v1/pcna/infer | Run an inference step
# DOC endpoint: POST /api/v1/pcna/reward | Submit a reward signal
# DOC endpoint: GET /api/v1/pcna/phi/state | Get phi-state values
# DOC endpoint: GET /api/v1/pcna/phi/audit | Get phi-state audit history
# DOC endpoint: POST /api/v1/pcna/phi/propagate | Trigger phi-state propagation

UI_META = {
    "tab_id": "pcna",
    "label": "PCNA Engine",
    "icon": "Cpu",
    "order": 9,
    "sections": [
        {
            "id": "state",
            "label": "Engine State",
            "endpoint": "/api/v1/pcna/state",
            "fields": [
                {"key": "infer_count", "type": "text", "label": "Inferences"},
                {"key": "reward_count", "type": "text", "label": "Rewards"},
                {"key": "last_coherence", "type": "gauge", "label": "Coherence"},
                {"key": "last_winner", "type": "badge", "label": "Winner"},
            ],
        },
        {
            "id": "rings",
            "label": "Ring Detail",
            "endpoint": "/api/v1/pcna/state",
            "fields": [
                {"key": "rings.phi.ring_coherence", "type": "gauge", "label": "Φ Coherence"},
                {"key": "rings.psi.ring_coherence", "type": "gauge", "label": "Ψ Coherence"},
                {"key": "rings.omega.ring_coherence", "type": "gauge", "label": "Ω Coherence"},
                {"key": "rings.theta.ring_coherence", "type": "gauge", "label": "Θ (Theta)"},
                {"key": "rings.sigma.ring_coherence", "type": "gauge", "label": "Σ (Sigma)"},
                {"key": "rings.memory_l.avg_hub", "type": "gauge", "label": "Memory-L"},
                {"key": "rings.memory_s.avg_hub", "type": "gauge", "label": "Memory-S"},
            ],
        },
        {
            "id": "instances",
            "label": "PCNA Instances",
            "endpoint": "/api/v1/pcna/instances",
            "fields": [
                {"key": "instance_id", "type": "text", "label": "Instance"},
                {"key": "phi_coherence", "type": "gauge", "label": "Φ"},
                {"key": "psi_coherence", "type": "gauge", "label": "Ψ"},
                {"key": "omega_coherence", "type": "gauge", "label": "Ω"},
                {"key": "infer_count", "type": "text", "label": "Inferences"},
            ],
        },
        {
            "id": "pnct_compare",
            "label": "PNCT Comparison (p7 vs p8)",
            "endpoint": "/api/v1/pcna/compare",
            "fields": [
                {"key": "p7.phases", "type": "text", "label": "p7 Phases"},
                {"key": "p7.phi_coherence", "type": "gauge", "label": "p7 Φ"},
                {"key": "p7.psi_coherence", "type": "gauge", "label": "p7 Ψ"},
                {"key": "p7.omega_coherence", "type": "gauge", "label": "p7 Ω"},
                {"key": "p8.phases", "type": "text", "label": "p8 Phases"},
                {"key": "p8.phi_coherence", "type": "gauge", "label": "p8 Φ"},
                {"key": "p8.psi_coherence", "type": "gauge", "label": "p8 Ψ"},
                {"key": "p8.omega_coherence", "type": "gauge", "label": "p8 Ω"},
                {"key": "phi_delta", "type": "text", "label": "Φ Delta"},
                {"key": "psi_delta", "type": "text", "label": "Ψ Delta"},
                {"key": "omega_delta", "type": "text", "label": "Ω Delta"},
            ],
        },
    ],
}

DATA_SCHEMA = {
    "endpoints": [
        {"method": "GET", "path": "/api/v1/pcna/state"},
        {"method": "POST", "path": "/api/v1/pcna/infer"},
        {"method": "POST", "path": "/api/v1/pcna/reward"},
        {"method": "GET", "path": "/api/v1/pcna/instances"},
        {"method": "POST", "path": "/api/v1/pcna/instances/spawn"},
        {"method": "POST", "path": "/api/v1/pcna/instances/merge"},
        {"method": "GET", "path": "/api/v1/pcna/compare"},
    ],
}

router = APIRouter(prefix="/api/v1", tags=["pcna"])


class InferRequest(BaseModel):
    text: str


class RewardRequest(BaseModel):
    winner: str
    outcome: float


class NudgeRequest(BaseModel):
    reward: float
    lr: float = 0.02


class PropagateRequest(BaseModel):
    steps: int = 10
    theta_steps: int = 5


class MergeRequest(BaseModel):
    mode: str
    target_instance_id: str | None = None
    alpha: float = 0.5


def _get_pcna():
    from ..main import get_pcna
    return get_pcna()


def _get_pcna_8():
    from ..main import get_pcna_8
    return get_pcna_8()


def _get_instances():
    from ..main import _instances
    return _instances


@router.get("/pcna/state")
async def pcna_state():
    return _get_pcna().state()


@router.post("/pcna/infer")
async def pcna_infer(req: InferRequest, request: Request):
    await require_admin(request)
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="text is required")
    return _get_pcna().infer(req.text)


@router.post("/pcna/reward")
async def pcna_reward(req: RewardRequest, request: Request):
    await require_admin(request)
    if req.outcome < -1.0 or req.outcome > 1.0:
        raise HTTPException(status_code=400, detail="outcome must be in [-1, 1]")
    return _get_pcna().reward(req.winner, req.outcome)


@router.get("/pcna/phi/state")
async def phi_state():
    return _get_pcna().phi.state()


@router.get("/pcna/phi/audit")
async def phi_audit():
    return _get_pcna().phi.ptca_seed_audit()


@router.post("/pcna/phi/propagate")
async def phi_propagate(req: PropagateRequest, request: Request):
    await require_admin(request)
    _get_pcna().phi.propagate(steps=req.steps)
    return _get_pcna().phi.state()


@router.post("/pcna/phi/nudge")
async def phi_nudge(req: NudgeRequest, request: Request):
    await require_admin(request)
    _get_pcna().phi.nudge(req.reward, lr=req.lr)
    return _get_pcna().phi.state()


@router.get("/pcna/psi/state")
async def psi_state():
    return _get_pcna().psi.state()


@router.get("/pcna/psi/audit")
async def psi_audit():
    return _get_pcna().psi.ptca_seed_audit()


@router.post("/pcna/psi/propagate")
async def psi_propagate(req: PropagateRequest, request: Request):
    await require_admin(request)
    _get_pcna().psi.propagate(steps=req.steps)
    return _get_pcna().psi.state()


@router.post("/pcna/psi/nudge")
async def psi_nudge(req: NudgeRequest, request: Request):
    await require_admin(request)
    _get_pcna().psi.nudge(req.reward, lr=req.lr)
    return _get_pcna().psi.state()


@router.get("/pcna/omega/state")
async def omega_state():
    return _get_pcna().omega.state()


@router.get("/pcna/omega/audit")
async def omega_audit():
    return _get_pcna().omega.ptca_seed_audit()


@router.post("/pcna/omega/propagate")
async def omega_propagate(req: PropagateRequest, request: Request):
    await require_admin(request)
    _get_pcna().omega.propagate(steps=req.steps)
    return _get_pcna().omega.state()


@router.post("/pcna/omega/nudge")
async def omega_nudge(req: NudgeRequest, request: Request):
    await require_admin(request)
    _get_pcna().omega.nudge(req.reward, lr=req.lr)
    return _get_pcna().omega.state()


@router.get("/pcna/theta/state")
async def theta_state():
    return _get_pcna().theta.state()


@router.get("/pcna/theta/gates")
async def theta_gates():
    return _get_pcna().theta.gate_status()


@router.get("/pcna/theta/audit")
async def theta_audit():
    return _get_pcna().theta.pcta_circle_audit()


@router.get("/pcna/theta/crypto")
async def theta_crypto():
    return _get_pcna().theta.crypto_meta()


@router.post("/pcna/theta/propagate")
async def theta_propagate(req: PropagateRequest, request: Request):
    await require_admin(request)
    _get_pcna().theta.propagate(steps=req.theta_steps)
    return _get_pcna().theta.state()


@router.post("/pcna/theta/reward")
async def theta_reward(req: NudgeRequest, request: Request):
    await require_admin(request)
    _get_pcna().theta.apply_reward(req.reward)
    return _get_pcna().theta.state()


@router.get("/pcna/memory/l/state")
async def memory_l_state():
    return _get_pcna().memory_l.state()


@router.get("/pcna/memory/s/state")
async def memory_s_state():
    return _get_pcna().memory_s.state()


@router.post("/pcna/memory/flush")
async def memory_flush(req: RewardRequest, request: Request):
    await require_admin(request)
    pcna = _get_pcna()
    flushed = pcna.memory_s.flush_to(pcna.memory_l, req.outcome)
    return {
        "flushed": flushed,
        "memory_l": pcna.memory_l.state(),
        "memory_s": pcna.memory_s.state(),
    }


@router.get("/pcna/instances")
async def list_instances():
    instances = _get_instances()
    return {
        "instances": [
            {
                "instance_id": iid,
                "phi_coherence": round(eng.phi.ring_coherence, 4),
                "psi_coherence": round(eng.psi.ring_coherence, 4),
                "omega_coherence": round(eng.omega.ring_coherence, 4),
                "theta_coherence": round(float(eng.theta.node_coherence.mean()), 4),
                "infer_count": eng.infer_count,
                "uptime_s": round(time.time() - eng.created_at, 1),
            }
            for iid, eng in instances.items()
        ],
        "count": len(instances),
    }


@router.post("/pcna/instances/spawn")
async def spawn_instance(request: Request):
    await require_admin(request)
    from ..engine import InstanceMerge
    child, result = InstanceMerge.fork(_get_pcna())
    _get_instances()[child.theta.instance_id] = child
    return result


@router.post("/pcna/instances/merge")
async def merge_instances(req: MergeRequest, request: Request):
    await require_admin(request)
    from ..engine import InstanceMerge
    primary = _get_pcna()
    instances = _get_instances()
    if req.mode == "fork":
        child, result = InstanceMerge.fork(primary)
        instances[child.theta.instance_id] = child
        return result
    target_id = req.target_instance_id
    if not target_id or target_id not in instances:
        raise HTTPException(status_code=404, detail="target_instance_id not found")
    target = instances[target_id]
    if req.mode == "absorb":
        result = InstanceMerge.absorb(primary, target)
        if target_id != primary.theta.instance_id:
            del instances[target_id]
        return result
    if req.mode == "converge":
        return InstanceMerge.converge(primary, target, alpha=req.alpha)
    raise HTTPException(status_code=400, detail="mode must be absorb|fork|converge")


@router.get("/pcna/compare")
async def pcna_compare():
    """PNCT experiment — p7 vs p8 side-by-side coherence comparison."""
    p7 = _get_pcna()
    p8 = _get_pcna_8()

    p7_phi = round(p7.phi.ring_coherence, 4)
    p7_psi = round(p7.psi.ring_coherence, 4)
    p7_omega = round(p7.omega.ring_coherence, 4)
    p8_phi = round(p8.phi.ring_coherence, 4)
    p8_psi = round(p8.psi.ring_coherence, 4)
    p8_omega = round(p8.omega.ring_coherence, 4)

    return {
        "experiment": "PNCT — prime vs composite phase geometry",
        "hypothesis": "Prime-phase (7) develops different coherence dynamics than composite-phase (8) under identical training input",
        "same_training_input": True,
        "p7": {
            "phases": 7,
            "is_prime": True,
            "phi_coherence": p7_phi,
            "psi_coherence": p7_psi,
            "omega_coherence": p7_omega,
            "infer_count": p7.infer_count,
            "reward_count": p7.reward_count,
            "last_coherence": round(p7.last_coherence, 4),
            "checkpoint_key": p7._checkpoint_key,
        },
        "p8": {
            "phases": 8,
            "is_prime": False,
            "phi_coherence": p8_phi,
            "psi_coherence": p8_psi,
            "omega_coherence": p8_omega,
            "infer_count": p8.infer_count,
            "reward_count": p8.reward_count,
            "last_coherence": round(p8.last_coherence, 4),
            "checkpoint_key": p8._checkpoint_key,
        },
        "phi_delta": round(p7_phi - p8_phi, 4),
        "psi_delta": round(p7_psi - p8_psi, 4),
        "omega_delta": round(p7_omega - p8_omega, 4),
    }
# 291:11
