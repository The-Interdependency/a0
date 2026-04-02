from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from ..storage import storage

UI_META = {
    "tab_id": "bandits",
    "label": "Bandits",
    "icon": "Target",
    "order": 5,
    "sections": [
        {
            "id": "arms",
            "label": "Bandit Arms",
            "endpoint": "/api/v1/bandits/arms",
            "fields": [
                {"key": "domain", "type": "badge", "label": "Domain"},
                {"key": "arm_name", "type": "text", "label": "Arm"},
                {"key": "pulls", "type": "text", "label": "Pulls"},
                {"key": "avg_reward", "type": "gauge", "label": "Avg Reward"},
                {"key": "ucb_score", "type": "gauge", "label": "UCB Score"},
                {"key": "enabled", "type": "badge", "label": "Enabled"},
            ],
        },
        {
            "id": "correlations",
            "label": "Correlations",
            "endpoint": "/api/v1/bandits/correlations",
            "fields": [
                {"key": "tool_arm", "type": "text", "label": "Tool"},
                {"key": "model_arm", "type": "text", "label": "Model"},
                {"key": "joint_reward", "type": "gauge", "label": "Joint Reward"},
                {"key": "created_at", "type": "text", "label": "Time"},
            ],
        },
    ],
}

DATA_SCHEMA = {
    "endpoints": [
        {"method": "GET", "path": "/api/v1/bandits/arms"},
        {"method": "POST", "path": "/api/v1/bandits/arms"},
        {"method": "GET", "path": "/api/v1/bandits/arms/{id}"},
        {"method": "PATCH", "path": "/api/v1/bandits/arms/{id}"},
        {"method": "POST", "path": "/api/v1/bandits/arms/reset"},
        {"method": "GET", "path": "/api/v1/bandits/correlations"},
    ],
}

router = APIRouter(prefix="/api/v1", tags=["bandits"])


class UpsertArm(BaseModel):
    domain: str
    arm_name: str
    pulls: int = 0
    total_reward: float = 0
    avg_reward: float = 0
    ema_reward: float = 0
    ucb_score: float = 0
    enabled: bool = True


class UpdateArm(BaseModel):
    pulls: Optional[int] = None
    total_reward: Optional[float] = None
    avg_reward: Optional[float] = None
    ema_reward: Optional[float] = None
    ucb_score: Optional[float] = None
    enabled: Optional[bool] = None


class ResetDomain(BaseModel):
    domain: str


@router.get("/bandits/arms")
async def list_arms(domain: Optional[str] = None):
    return await storage.get_bandit_arms(domain)


@router.post("/bandits/arms")
async def upsert_arm(body: UpsertArm):
    return await storage.upsert_bandit_arm(body.model_dump())


@router.get("/bandits/arms/{arm_id}")
async def get_arm(arm_id: int):
    arm = await storage.get_bandit_arm(arm_id)
    if not arm:
        raise HTTPException(status_code=404, detail="arm not found")
    return arm


@router.patch("/bandits/arms/{arm_id}")
async def update_arm(arm_id: int, body: UpdateArm):
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="no updates provided")
    await storage.update_bandit_arm(arm_id, updates)
    return {"ok": True}


@router.post("/bandits/arms/reset")
async def reset_domain(body: ResetDomain):
    await storage.reset_bandit_domain(body.domain)
    return {"ok": True, "domain": body.domain}


@router.get("/bandits/correlations")
async def list_correlations(limit: int = 50):
    return await storage.get_bandit_correlations(limit)
