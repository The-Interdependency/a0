import os
import time
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

from .database import engine
from .engine import PCNAEngine, InstanceMerge

_pcna: PCNAEngine | None = None
_instances: dict[str, PCNAEngine] = {}


def get_pcna() -> PCNAEngine:
    global _pcna
    if _pcna is None:
        _pcna = PCNAEngine()
        _instances[_pcna.guardian.instance_id] = _pcna
    return _pcna


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[python] FastAPI starting — DB engine initialized")
    get_pcna()
    print(f"[python] PCNA engine online — blueprint {get_pcna().blueprint_hash[:12]}...")
    yield
    await engine.dispose()
    print("[python] FastAPI shutdown")


app = FastAPI(title="A0P Python Backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5000",
        "http://localhost:5173",
        "http://0.0.0.0:5000",
        "http://0.0.0.0:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class InferRequest(BaseModel):
    text: str


class RewardRequest(BaseModel):
    winner: str
    outcome: float


class MergeRequest(BaseModel):
    mode: str
    target_instance_id: str | None = None
    alpha: float = 0.5


class NudgeRequest(BaseModel):
    reward: float
    lr: float = 0.02


class PropagateRequest(BaseModel):
    phi_steps: int = 10
    guardian_steps: int = 5


@app.get("/api/health")
async def health():
    pcna = get_pcna()
    return {
        "status": "ok",
        "service": "python-backend",
        "pcna": "online",
        "instance_id": pcna.guardian.instance_id,
        "uptime_s": round(time.time() - pcna.created_at, 1),
    }


@app.post("/api/pcna/infer")
async def pcna_infer(req: InferRequest):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="text is required")
    return get_pcna().infer(req.text)


@app.post("/api/pcna/reward")
async def pcna_reward(req: RewardRequest):
    if req.outcome < -1.0 or req.outcome > 1.0:
        raise HTTPException(status_code=400, detail="outcome must be in [-1, 1]")
    return get_pcna().reward(req.winner, req.outcome)


@app.get("/api/pcna/state")
async def pcna_state():
    return get_pcna().state()


@app.get("/api/pcna/phi/state")
async def phi_state():
    return get_pcna().phi.state()


@app.get("/api/pcna/phi/audit")
async def phi_audit():
    return get_pcna().phi.ptca_seed_audit()


@app.post("/api/pcna/phi/propagate")
async def phi_propagate(req: PropagateRequest):
    get_pcna().phi.propagate(steps=req.phi_steps)
    return get_pcna().phi.state()


@app.post("/api/pcna/phi/nudge")
async def phi_nudge(req: NudgeRequest):
    get_pcna().phi.nudge(req.reward, lr=req.lr)
    return get_pcna().phi.state()


@app.get("/api/pcna/psi/state")
async def psi_state():
    return get_pcna().psi.state()


@app.get("/api/pcna/psi/audit")
async def psi_audit():
    return get_pcna().psi.ptca_seed_audit()


@app.post("/api/pcna/psi/propagate")
async def psi_propagate(req: PropagateRequest):
    get_pcna().psi.propagate(steps=req.phi_steps)
    return get_pcna().psi.state()


@app.post("/api/pcna/psi/nudge")
async def psi_nudge(req: NudgeRequest):
    get_pcna().psi.nudge(req.reward, lr=req.lr)
    return get_pcna().psi.state()


@app.get("/api/pcna/omega/state")
async def omega_state():
    return get_pcna().omega.state()


@app.get("/api/pcna/omega/audit")
async def omega_audit():
    return get_pcna().omega.ptca_seed_audit()


@app.post("/api/pcna/omega/propagate")
async def omega_propagate(req: PropagateRequest):
    get_pcna().omega.propagate(steps=req.phi_steps)
    return get_pcna().omega.state()


@app.post("/api/pcna/omega/nudge")
async def omega_nudge(req: NudgeRequest):
    get_pcna().omega.nudge(req.reward, lr=req.lr)
    return get_pcna().omega.state()


@app.get("/api/pcna/guardian/state")
async def guardian_state():
    return get_pcna().guardian.state()


@app.get("/api/pcna/guardian/gates")
async def guardian_gates():
    return get_pcna().guardian.gate_status()


@app.get("/api/pcna/guardian/audit")
async def guardian_audit():
    return get_pcna().guardian.pcta_circle_audit()


@app.get("/api/pcna/guardian/crypto")
async def guardian_crypto():
    return get_pcna().guardian.crypto_meta()


@app.post("/api/pcna/guardian/propagate")
async def guardian_propagate(req: PropagateRequest):
    get_pcna().guardian.propagate(steps=req.guardian_steps)
    return get_pcna().guardian.state()


@app.post("/api/pcna/guardian/reward")
async def guardian_reward(req: NudgeRequest):
    get_pcna().guardian.apply_reward(req.reward)
    return get_pcna().guardian.state()


@app.get("/api/pcna/memory/l/state")
async def memory_l_state():
    return get_pcna().memory_l.state()


@app.get("/api/pcna/memory/s/state")
async def memory_s_state():
    return get_pcna().memory_s.state()


@app.post("/api/pcna/memory/flush")
async def memory_flush(req: RewardRequest):
    flushed = get_pcna().memory_s.flush_to(get_pcna().memory_l, req.outcome)
    return {
        "flushed": flushed,
        "memory_l": get_pcna().memory_l.state(),
        "memory_s": get_pcna().memory_s.state(),
    }


@app.get("/api/pcna/instances")
async def list_instances():
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
            for iid, eng in _instances.items()
        ],
        "count": len(_instances),
    }


@app.post("/api/pcna/instances/spawn")
async def spawn_instance():
    child, result = InstanceMerge.fork(get_pcna())
    _instances[child.guardian.instance_id] = child
    return result


@app.post("/api/pcna/instances/merge")
async def merge_instances(req: MergeRequest):
    primary = get_pcna()
    if req.mode == "fork":
        child, result = InstanceMerge.fork(primary)
        _instances[child.guardian.instance_id] = child
        return result

    target_id = req.target_instance_id
    if not target_id or target_id not in _instances:
        raise HTTPException(status_code=404, detail="target_instance_id not found")

    target = _instances[target_id]

    if req.mode == "absorb":
        result = InstanceMerge.absorb(primary, target)
        if target_id in _instances and target_id != primary.guardian.instance_id:
            del _instances[target_id]
        return result

    if req.mode == "converge":
        result = InstanceMerge.converge(primary, target, alpha=req.alpha)
        return result

    raise HTTPException(status_code=400, detail="mode must be absorb|fork|converge")


STATIC_DIR = os.path.join(os.path.dirname(__file__), "..", "dist", "public")
if os.path.isdir(STATIC_DIR):
    app.mount("/assets", StaticFiles(directory=os.path.join(STATIC_DIR, "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        index = os.path.join(STATIC_DIR, "index.html")
        return FileResponse(index)
