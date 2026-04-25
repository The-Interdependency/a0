# 378:32
# N:M
"""Fleet benchmarking — head-to-head comparison of model/agent/orchestration tuples.

A benchmark = persistent named recipe with 1-6 contestants. A run = one
execution that fans the prompt out to every contestant in parallel and
records latency, tokens, cost, and the response. Optional auto-judge.

Owner-scoped throughout. No CASCADE drops issued from API.
"""
import asyncio
import time
import uuid
import datetime as _dt
from typing import Optional, Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import text as _sa_text

from ..database import get_session
from ..services.inference_modes import run_inference_with_mode
from ..services import energy_registry

# DOC module: fleet
# DOC label: Fleet
# DOC description: Persistent benchmarks — fan one prompt across N (model, agent, orchestration) tuples and compare.
# DOC tier: free
# DOC endpoint: GET /api/v1/fleet/benchmarks | List user's saved benchmarks.
# DOC endpoint: POST /api/v1/fleet/benchmarks | Create a benchmark.
# DOC endpoint: GET /api/v1/fleet/benchmarks/{id} | Benchmark + contestants + recent runs.
# DOC endpoint: PATCH /api/v1/fleet/benchmarks/{id} | Update name/prompt/mode/judge.
# DOC endpoint: DELETE /api/v1/fleet/benchmarks/{id} | Delete benchmark.
# DOC endpoint: POST /api/v1/fleet/benchmarks/{id}/contestants | Add a contestant (cap 6).
# DOC endpoint: PATCH /api/v1/fleet/contestants/{id} | Update contestant tuple.
# DOC endpoint: DELETE /api/v1/fleet/contestants/{id} | Remove contestant.
# DOC endpoint: POST /api/v1/fleet/benchmarks/{id}/run | Start a fan-out run.
# DOC endpoint: GET /api/v1/fleet/runs/{id} | Run + per-contestant results.

router = APIRouter(prefix="/api/v1/fleet", tags=["fleet"])

UI_META = {
    "tab_id": "fleet_bench",
    "label": "Fleet Bench",
    "icon": "Trophy",
    "order": 26,
}

MAX_CONTESTANTS = 6
VALID_MODES = {"one_shot", "conversational"}
VALID_ORCH = {"single", "fan_out", "council", "daisy_chain"}


def _uid(request: Request) -> str:
    u = request.headers.get("x-user-id")
    if not u:
        raise HTTPException(status_code=401, detail="authentication required")
    return u


async def _get_owned_benchmark(bid: int, uid: str) -> dict:
    async with get_session() as sess:
        row = (await sess.execute(_sa_text(
            "SELECT * FROM fleet_benchmarks WHERE id = :id"
        ), {"id": bid})).mappings().first()
    if not row or row["user_id"] != uid:
        raise HTTPException(status_code=404, detail="benchmark not found")
    return dict(row)


async def _get_owned_contestant(cid: int, uid: str) -> dict:
    async with get_session() as sess:
        row = (await sess.execute(_sa_text(
            "SELECT c.*, b.user_id AS owner FROM fleet_contestants c "
            "JOIN fleet_benchmarks b ON b.id = c.benchmark_id WHERE c.id = :id"
        ), {"id": cid})).mappings().first()
    if not row or row["owner"] != uid:
        raise HTTPException(status_code=404, detail="contestant not found")
    d = dict(row)
    d.pop("owner", None)
    return d


# ---------- Benchmark CRUD ----------

class CreateBenchmark(BaseModel):
    name: str
    prompt: str = ""
    mode: str = "one_shot"
    judge_enabled: bool = False
    judge_model: Optional[str] = None


class UpdateBenchmark(BaseModel):
    name: Optional[str] = None
    prompt: Optional[str] = None
    mode: Optional[str] = None
    judge_enabled: Optional[bool] = None
    judge_model: Optional[str] = None


@router.get("/benchmarks")
async def list_benchmarks(request: Request):
    uid = _uid(request)
    async with get_session() as sess:
        rows = (await sess.execute(_sa_text(
            "SELECT b.*, "
            "  (SELECT COUNT(*) FROM fleet_contestants c WHERE c.benchmark_id = b.id) AS contestant_count "
            "FROM fleet_benchmarks b WHERE user_id = :uid ORDER BY updated_at DESC"
        ), {"uid": uid})).mappings().all()
    return [dict(r) for r in rows]


@router.post("/benchmarks")
async def create_benchmark(body: CreateBenchmark, request: Request):
    uid = _uid(request)
    if body.mode not in VALID_MODES:
        raise HTTPException(status_code=400, detail=f"mode must be one of {sorted(VALID_MODES)}")
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    async with get_session() as sess:
        row = (await sess.execute(_sa_text(
            "INSERT INTO fleet_benchmarks (user_id, name, prompt, mode, judge_enabled, judge_model) "
            "VALUES (:uid, :name, :prompt, :mode, :je, :jm) RETURNING *"
        ), {
            "uid": uid, "name": name, "prompt": body.prompt,
            "mode": body.mode, "je": body.judge_enabled, "jm": body.judge_model,
        })).mappings().first()
        await sess.commit()
    return dict(row)


@router.get("/benchmarks/{bid}")
async def get_benchmark(bid: int, request: Request):
    uid = _uid(request)
    bench = await _get_owned_benchmark(bid, uid)
    async with get_session() as sess:
        contestants = (await sess.execute(_sa_text(
            "SELECT * FROM fleet_contestants WHERE benchmark_id = :id ORDER BY slot"
        ), {"id": bid})).mappings().all()
        runs = (await sess.execute(_sa_text(
            "SELECT id, status, started_at, finished_at FROM fleet_benchmark_runs "
            "WHERE benchmark_id = :id ORDER BY started_at DESC LIMIT 20"
        ), {"id": bid})).mappings().all()
    return {
        "benchmark": bench,
        "contestants": [dict(c) for c in contestants],
        "runs": [dict(r) for r in runs],
    }


@router.patch("/benchmarks/{bid}")
async def update_benchmark(bid: int, body: UpdateBenchmark, request: Request):
    uid = _uid(request)
    await _get_owned_benchmark(bid, uid)
    fields = body.model_dump(exclude_none=True)
    if not fields:
        raise HTTPException(status_code=400, detail="no fields to update")
    if "mode" in fields and fields["mode"] not in VALID_MODES:
        raise HTTPException(status_code=400, detail=f"mode must be one of {sorted(VALID_MODES)}")
    sets = ", ".join(f"{k} = :{k}" for k in fields)
    fields["id"] = bid
    fields["uid"] = uid
    async with get_session() as sess:
        row = (await sess.execute(_sa_text(
            f"UPDATE fleet_benchmarks SET {sets}, updated_at = CURRENT_TIMESTAMP "
            f"WHERE id = :id AND user_id = :uid RETURNING *"
        ), fields)).mappings().first()
        await sess.commit()
    return dict(row)


@router.delete("/benchmarks/{bid}")
async def delete_benchmark(bid: int, request: Request):
    uid = _uid(request)
    await _get_owned_benchmark(bid, uid)
    async with get_session() as sess:
        await sess.execute(_sa_text(
            "DELETE FROM fleet_benchmarks WHERE id = :id AND user_id = :uid"
        ), {"id": bid, "uid": uid})
        await sess.commit()
    return {"ok": True}


# ---------- Contestant CRUD ----------

class CreateContestant(BaseModel):
    label: str = ""
    provider_id: str
    model_id: str = ""
    agent_id: Optional[int] = None
    orchestration_mode: str = "single"
    providers: list[str] = Field(default_factory=list)


class UpdateContestant(BaseModel):
    label: Optional[str] = None
    provider_id: Optional[str] = None
    model_id: Optional[str] = None
    agent_id: Optional[int] = None
    orchestration_mode: Optional[str] = None
    providers: Optional[list[str]] = None
    slot: Optional[int] = None


def _validate_orch(mode: str) -> None:
    if mode not in VALID_ORCH:
        raise HTTPException(status_code=400, detail=f"orchestration_mode must be one of {sorted(VALID_ORCH)}")


def _validate_agent_orch_combo(agent_id: Optional[int], mode: str) -> None:
    """Multi-model orchestration is a model-voice comparator, not an agentic
    surface. A contestant pairing a forge agent with fan_out/council/daisy_chain
    is a category error — refuse it at the boundary."""
    if agent_id and mode != "single":
        raise HTTPException(
            status_code=400,
            detail=(
                "agent_id can only be combined with orchestration_mode='single'. "
                "Multi-model modes (fan_out, council, daisy_chain) compare raw "
                "provider voices and do not carry an agent persona."
            ),
        )


@router.post("/benchmarks/{bid}/contestants")
async def add_contestant(bid: int, body: CreateContestant, request: Request):
    uid = _uid(request)
    await _get_owned_benchmark(bid, uid)
    _validate_orch(body.orchestration_mode)
    _validate_agent_orch_combo(body.agent_id, body.orchestration_mode)
    async with get_session() as sess:
        cnt = (await sess.execute(_sa_text(
            "SELECT COUNT(*) AS n, COALESCE(MAX(slot), 0) AS max_slot "
            "FROM fleet_contestants WHERE benchmark_id = :id"
        ), {"id": bid})).mappings().first()
        if int(cnt["n"]) >= MAX_CONTESTANTS:
            raise HTTPException(status_code=400, detail=f"max {MAX_CONTESTANTS} contestants per benchmark")
        next_slot = int(cnt["max_slot"]) + 1
        import json as _json
        row = (await sess.execute(_sa_text(
            "INSERT INTO fleet_contestants (benchmark_id, slot, label, provider_id, model_id, "
            "agent_id, orchestration_mode, providers) "
            "VALUES (:bid, :slot, :label, :pid, :mid, :aid, :om, CAST(:prov AS JSONB)) RETURNING *"
        ), {
            "bid": bid, "slot": next_slot, "label": body.label,
            "pid": body.provider_id, "mid": body.model_id,
            "aid": body.agent_id, "om": body.orchestration_mode,
            "prov": _json.dumps(body.providers),
        })).mappings().first()
        await sess.commit()
    return dict(row)


@router.patch("/contestants/{cid}")
async def update_contestant(cid: int, body: UpdateContestant, request: Request):
    uid = _uid(request)
    await _get_owned_contestant(cid, uid)
    fields = body.model_dump(exclude_none=True)
    if not fields:
        raise HTTPException(status_code=400, detail="no fields to update")
    if "orchestration_mode" in fields:
        _validate_orch(fields["orchestration_mode"])
    # Recheck the (agent_id, orchestration_mode) combo against the merged state.
    existing = await _get_owned_contestant(cid, uid)
    eff_agent = fields["agent_id"] if "agent_id" in fields else existing.get("agent_id")
    eff_mode = fields["orchestration_mode"] if "orchestration_mode" in fields else existing.get("orchestration_mode")
    _validate_agent_orch_combo(eff_agent, eff_mode or "single")
    import json as _json
    if "providers" in fields:
        fields["providers"] = _json.dumps(fields["providers"])
        prov_clause = "providers = CAST(:providers AS JSONB)"
        del fields["providers"]
        sets_parts = [f"{k} = :{k}" for k in fields] + [prov_clause]
    else:
        sets_parts = [f"{k} = :{k}" for k in fields]
    sets = ", ".join(sets_parts)
    params = dict(fields)
    if "providers" not in params and isinstance(body.providers, list):
        params["providers"] = _json.dumps(body.providers)
    params["id"] = cid
    async with get_session() as sess:
        row = (await sess.execute(_sa_text(
            f"UPDATE fleet_contestants SET {sets} WHERE id = :id RETURNING *"
        ), params)).mappings().first()
        await sess.commit()
    return dict(row)


@router.delete("/contestants/{cid}")
async def delete_contestant(cid: int, request: Request):
    uid = _uid(request)
    await _get_owned_contestant(cid, uid)
    async with get_session() as sess:
        await sess.execute(_sa_text(
            "DELETE FROM fleet_contestants WHERE id = :id"
        ), {"id": cid})
        await sess.commit()
    return {"ok": True}


# ---------- Run fan-out ----------

class StartRun(BaseModel):
    prompt: Optional[str] = None  # override; falls back to benchmark.prompt


async def _run_one_contestant(
    run_id: str,
    contestant: dict,
    prompt: str,
    uid: str,
) -> None:
    """Execute a single contestant. Always finishes (writes status + content
    or error). Never raises out — errors land in fleet_contestant_runs.error."""
    cr_id = f"fcr-{uuid.uuid4().hex[:16]}"
    async with get_session() as sess:
        await sess.execute(_sa_text(
            "INSERT INTO fleet_contestant_runs "
            "(id, run_id, contestant_id, slot, status) "
            "VALUES (:id, :rid, :cid, :slot, 'running')"
        ), {"id": cr_id, "rid": run_id, "cid": contestant["id"], "slot": contestant["slot"]})
        await sess.commit()

    # Optional system prompt from forge agent
    system_prompt: Optional[str] = None
    if contestant.get("agent_id"):
        async with get_session() as sess:
            arow = (await sess.execute(_sa_text(
                "SELECT system_prompt FROM agent_instances "
                "WHERE id = :id AND owner_id = :uid"
            ), {"id": contestant["agent_id"], "uid": uid})).mappings().first()
        if arow:
            system_prompt = arow["system_prompt"]

    messages = [{"role": "user", "content": prompt}]
    orch = contestant.get("orchestration_mode") or "single"
    if orch == "single":
        provider_list = [contestant["provider_id"]]
    else:
        provider_list = list(contestant.get("providers") or []) or [contestant["provider_id"]]

    t0 = time.perf_counter()
    content = ""
    error: Optional[str] = None
    usage: dict = {}
    try:
        content, usage = await run_inference_with_mode(
            messages=messages,
            orchestration_mode=orch,
            providers=provider_list,
            cut_mode="soft",
            user_id=uid,
            system_prompt=system_prompt,
        )
    except Exception as exc:
        error = f"{type(exc).__name__}: {exc}"
    elapsed_ms = int((time.perf_counter() - t0) * 1000)

    # Cost/token accounting (best-effort; multi-model usage may not be a single dict)
    prompt_tokens = 0
    completion_tokens = 0
    cost_usd = 0.0
    try:
        if isinstance(usage, dict):
            cb = energy_registry.cache_breakdown(usage)
            prompt_tokens = int(cb.get("fresh_input", 0))
            completion_tokens = int(cb.get("output", 0))
            cost_usd = float(energy_registry.estimate_cost(
                provider_list[0],
                prompt_tokens, completion_tokens,
                int(cb.get("cache_read", 0)), int(cb.get("cache_write", 0)),
            ))
    except Exception:
        pass

    async with get_session() as sess:
        await sess.execute(_sa_text(
            "UPDATE fleet_contestant_runs SET "
            "  status = :st, content = :c, error = :err, latency_ms = :lat, "
            "  prompt_tokens = :pt, completion_tokens = :ct, cost_usd = :cost, "
            "  finished_at = CURRENT_TIMESTAMP "
            "WHERE id = :id"
        ), {
            "id": cr_id,
            "st": "error" if error else "complete",
            "c": content or "",
            "err": error,
            "lat": elapsed_ms,
            "pt": prompt_tokens,
            "ct": completion_tokens,
            "cost": cost_usd,
        })
        await sess.commit()


@router.post("/benchmarks/{bid}/run")
async def start_run(bid: int, body: StartRun, request: Request):
    uid = _uid(request)
    bench = await _get_owned_benchmark(bid, uid)
    prompt = (body.prompt or bench["prompt"] or "").strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="prompt is required (set on benchmark or pass override)")
    async with get_session() as sess:
        contestants = (await sess.execute(_sa_text(
            "SELECT * FROM fleet_contestants WHERE benchmark_id = :id ORDER BY slot"
        ), {"id": bid})).mappings().all()
    if not contestants:
        raise HTTPException(status_code=400, detail="benchmark has no contestants")

    run_id = f"fbr-{uuid.uuid4().hex[:16]}"
    async with get_session() as sess:
        await sess.execute(_sa_text(
            "INSERT INTO fleet_benchmark_runs (id, benchmark_id, user_id, prompt_snapshot, status) "
            "VALUES (:id, :bid, :uid, :p, 'running')"
        ), {"id": run_id, "bid": bid, "uid": uid, "p": prompt})
        await sess.commit()

    async def _drive() -> None:
        try:
            await asyncio.gather(
                *[_run_one_contestant(run_id, dict(c), prompt, uid) for c in contestants],
                return_exceptions=True,
            )
        finally:
            async with get_session() as sess:
                await sess.execute(_sa_text(
                    "UPDATE fleet_benchmark_runs SET status = 'complete', "
                    "  finished_at = CURRENT_TIMESTAMP WHERE id = :id"
                ), {"id": run_id})
                await sess.commit()

    from ..services.bg_tasks import spawn as _spawn_bg
    _spawn_bg(_drive(), name=f"fleet_run:{run_id}")

    return {"run_id": run_id, "benchmark_id": bid, "status": "running"}


@router.get("/runs/{run_id}")
async def get_run(run_id: str, request: Request):
    uid = _uid(request)
    async with get_session() as sess:
        run = (await sess.execute(_sa_text(
            "SELECT * FROM fleet_benchmark_runs WHERE id = :id"
        ), {"id": run_id})).mappings().first()
        if not run or run["user_id"] != uid:
            raise HTTPException(status_code=404, detail="run not found")
        crows = (await sess.execute(_sa_text(
            "SELECT cr.*, c.label, c.provider_id, c.model_id, c.orchestration_mode "
            "FROM fleet_contestant_runs cr "
            "JOIN fleet_contestants c ON c.id = cr.contestant_id "
            "WHERE cr.run_id = :rid ORDER BY cr.slot"
        ), {"rid": run_id})).mappings().all()
        judgment = (await sess.execute(_sa_text(
            "SELECT * FROM fleet_judgments WHERE run_id = :rid "
            "ORDER BY created_at DESC LIMIT 1"
        ), {"rid": run_id})).mappings().first()
    return {
        "run": dict(run),
        "contestant_runs": [dict(r) for r in crows],
        "judgment": dict(judgment) if judgment else None,
    }


@router.get("/benchmarks/{bid}/runs")
async def list_runs(bid: int, request: Request):
    uid = _uid(request)
    await _get_owned_benchmark(bid, uid)
    async with get_session() as sess:
        rows = (await sess.execute(_sa_text(
            "SELECT id, status, started_at, finished_at FROM fleet_benchmark_runs "
            "WHERE benchmark_id = :bid ORDER BY started_at DESC LIMIT 50"
        ), {"bid": bid})).mappings().all()
    return [dict(r) for r in rows]
# 378:32
