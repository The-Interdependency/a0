import time
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

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
                {"key": "rings.guardian.avg_coherence", "type": "gauge", "label": "Guardian"},
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
    guardian_steps: int = 5


class MergeRequest(BaseModel):
    mode: str
    target_instance_id: str | None = None
    alpha: float = 0.5


def _get_pcna():
    from ..main import get_pcna
    return get_pcna()


def _get_instances():
    from ..main import _instances
    return _instances


@router.get("/pcna/state")
async def pcna_state():
    return _get_pcna().state()


@router.post("/pcna/infer")
async def pcna_infer(req: InferRequest):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="text is required")
    return _get_pcna().infer(req.text)


@router.post("/pcna/reward")
async def pcna_reward(req: RewardRequest):
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
async def phi_propagate(req: PropagateRequest):
    _get_pcna().phi.propagate(steps=req.steps)
    return _get_pcna().phi.state()


@router.post("/pcna/phi/nudge")
async def phi_nudge(req: NudgeRequest):
    _get_pcna().phi.nudge(req.reward, lr=req.lr)
    return _get_pcna().phi.state()


@router.get("/pcna/psi/state")
async def psi_state():
    return _get_pcna().psi.state()


@router.get("/pcna/psi/audit")
async def psi_audit():
    return _get_pcna().psi.ptca_seed_audit()


@router.post("/pcna/psi/propagate")
async def psi_propagate(req: PropagateRequest):
    _get_pcna().psi.propagate(steps=req.steps)
    return _get_pcna().psi.state()


@router.post("/pcna/psi/nudge")
async def psi_nudge(req: NudgeRequest):
    _get_pcna().psi.nudge(req.reward, lr=req.lr)
    return _get_pcna().psi.state()


@router.get("/pcna/omega/state")
async def omega_state():
    return _get_pcna().omega.state()


@router.get("/pcna/omega/audit")
async def omega_audit():
    return _get_pcna().omega.ptca_seed_audit()


@router.post("/pcna/omega/propagate")
async def omega_propagate(req: PropagateRequest):
    _get_pcna().omega.propagate(steps=req.steps)
    return _get_pcna().omega.state()


@router.post("/pcna/omega/nudge")
async def omega_nudge(req: NudgeRequest):
    _get_pcna().omega.nudge(req.reward, lr=req.lr)
    return _get_pcna().omega.state()


@router.get("/pcna/guardian/state")
async def guardian_state():
    return _get_pcna().guardian.state()


@router.get("/pcna/guardian/gates")
async def guardian_gates():
    return _get_pcna().guardian.gate_status()


@router.get("/pcna/guardian/audit")
async def guardian_audit():
    return _get_pcna().guardian.pcta_circle_audit()


@router.get("/pcna/guardian/crypto")
async def guardian_crypto():
    return _get_pcna().guardian.crypto_meta()


@router.post("/pcna/guardian/propagate")
async def guardian_propagate(req: PropagateRequest):
    _get_pcna().guardian.propagate(steps=req.guardian_steps)
    return _get_pcna().guardian.state()


@router.post("/pcna/guardian/reward")
async def guardian_reward(req: NudgeRequest):
    _get_pcna().guardian.apply_reward(req.reward)
    return _get_pcna().guardian.state()


@router.get("/pcna/memory/l/state")
async def memory_l_state():
    return _get_pcna().memory_l.state()


@router.get("/pcna/memory/s/state")
async def memory_s_state():
    return _get_pcna().memory_s.state()


@router.post("/pcna/memory/flush")
async def memory_flush(req: RewardRequest):
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
                "guardian_coherence": round(float(eng.guardian.node_coherence.mean()), 4),
                "infer_count": eng.infer_count,
                "uptime_s": round(time.time() - eng.created_at, 1),
            }
            for iid, eng in instances.items()
        ],
        "count": len(instances),
    }


@router.post("/pcna/instances/spawn")
async def spawn_instance():
    from ..engine import InstanceMerge
    child, result = InstanceMerge.fork(_get_pcna())
    _get_instances()[child.guardian.instance_id] = child
    return result


@router.post("/pcna/instances/merge")
async def merge_instances(req: MergeRequest):
    from ..engine import InstanceMerge
    primary = _get_pcna()
    instances = _get_instances()
    if req.mode == "fork":
        child, result = InstanceMerge.fork(primary)
        instances[child.guardian.instance_id] = child
        return result
    target_id = req.target_instance_id
    if not target_id or target_id not in instances:
        raise HTTPException(status_code=404, detail="target_instance_id not found")
    target = instances[target_id]
    if req.mode == "absorb":
        result = InstanceMerge.absorb(primary, target)
        if target_id != primary.guardian.instance_id:
            del instances[target_id]
        return result
    if req.mode == "converge":
        return InstanceMerge.converge(primary, target, alpha=req.alpha)
    raise HTTPException(status_code=400, detail="mode must be absorb|fork|converge")
