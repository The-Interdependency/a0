# 106:20
from fastapi import APIRouter
from typing import Optional

from ..storage import storage

# DOC module: bandits
# DOC label: Bandits
# DOC description: UCB1 bandit driving provider selection on the PCNA core (Task #112). Live arm stats live in PCNAEngine.bandit_state; bandit_pulls is the append-only audit log.
# DOC tier: free
# DOC endpoint: GET /api/v1/bandits/state | Live in-memory bandit_state on the primary PCNA — source of truth for the next pull
# DOC endpoint: GET /api/v1/bandits/pulls | Append-only audit log of bandit decisions + rewards (Task #112)
# DOC endpoint: GET /api/v1/bandits/correlations | Joint tool/model reward correlations

UI_META = {
    "tab_id": "bandits",
    "label": "Bandits",
    "icon": "Target",
    "order": 5,
    "sections": [
        {
            "id": "state",
            "label": "Live Arms",
            "endpoint": "/api/v1/bandits/state",
            "fields": [
                {"key": "arm_id", "type": "text", "label": "Arm"},
                {"key": "pulls", "type": "text", "label": "Pulls"},
                {"key": "avg_reward", "type": "gauge", "label": "Avg Reward"},
                {"key": "ucb_score", "type": "gauge", "label": "UCB Score"},
                {"key": "last_pulled", "type": "text", "label": "Last Pulled"},
            ],
        },
        {
            "id": "pulls",
            "label": "Pull Log",
            "endpoint": "/api/v1/bandits/pulls",
            "fields": [
                {"key": "ts", "type": "text", "label": "Time"},
                {"key": "domain", "type": "badge", "label": "Domain"},
                {"key": "arm_id", "type": "text", "label": "Arm"},
                {"key": "reward", "type": "gauge", "label": "Reward"},
                {"key": "cost_usd", "type": "text", "label": "Cost (USD)"},
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
        {"method": "GET", "path": "/api/v1/bandits/state"},
        {"method": "GET", "path": "/api/v1/bandits/pulls"},
        {"method": "GET", "path": "/api/v1/bandits/correlations"},
    ],
}

router = APIRouter(prefix="/api/v1", tags=["bandits"])


# Task #112 — bandit_arms (table + endpoints) is gone. Live arms live
# on PCNAEngine.bandit_state (see /bandits/state); the audit log of
# every pull lives in bandit_pulls (see /bandits/pulls). The legacy
# table is dropped at lifespan startup so operators are not misled by
# a stale summary that the selector no longer reads from.


@router.get("/bandits/correlations")
async def list_correlations(limit: int = 50):
    return await storage.get_bandit_correlations(limit)


@router.get("/bandits/state")
async def get_live_state():
    """Live in-memory bandit_state on the primary PCNA core.

    Task #112: this is the source of truth for the next bandit pull.
    The append-only audit log is at GET /bandits/pulls. The legacy
    bandit_arms table was retired and is dropped at lifespan startup.
    """
    from ..services.spawn_executor import _try_get_primary_pcna
    pcna, err = _try_get_primary_pcna()
    if pcna is None:
        return {"available": False, "reason": err or "primary_pcna_unreachable", "domains": {}}
    state = getattr(pcna, "bandit_state", {}) or {}
    domains = {
        domain: [
            {
                "arm_id": a.get("arm_id"),
                "pulls": int(a.get("pulls", 0)),
                "total_reward": float(a.get("total_reward", 0.0)),
                "avg_reward": float(a.get("avg_reward", 0.0)),
                "ema_reward": float(a.get("ema_reward", 0.0)),
                "ucb_score": float(a.get("ucb_score", 0.0)),
                "last_pulled": (
                    a.get("last_pulled").isoformat()
                    if a.get("last_pulled")
                    else None
                ),
            }
            for a in arms
        ]
        for domain, arms in state.items()
    }
    return {
        "available": True,
        "pcna_instance_id": getattr(pcna.theta, "instance_id", "unknown"),
        "domains": domains,
    }


@router.get("/bandits/pulls")
async def list_pulls(domain: Optional[str] = None, limit: int = 100):
    """Append-only audit log of bandit decisions and their rewards.

    Read-only. Newer rows first. Filterable by domain.
    """
    limit = max(1, min(int(limit), 1000))
    from ..database import get_session
    from sqlalchemy import text as _sa_text
    sql = (
        "SELECT id, spawn_id, parent_pcna_id, domain, arm_id, reward, "
        "       reward_shape, cost_usd, ts "
        "  FROM bandit_pulls "
        + ("WHERE domain = :dom " if domain else "")
        + "ORDER BY ts DESC LIMIT :lim"
    )
    params: dict = {"lim": limit}
    if domain:
        params["dom"] = domain
    async with get_session() as s:
        rows = (await s.execute(_sa_text(sql), params)).mappings().all()
    return [dict(r) for r in rows]
# 106:20
