import math
from datetime import datetime
from typing import Any


EMA_ALPHA = 0.3
EXPLORATION_C = 1.41


def ucb1_score(pulls: int, avg_reward: float, total_pulls: int) -> float:
    if pulls == 0:
        return float("inf")
    exploration = EXPLORATION_C * math.sqrt(math.log(max(total_pulls, 1)) / pulls)
    return avg_reward + exploration


def update_arm_stats(arm: dict[str, Any], reward: float) -> dict[str, Any]:
    pulls = (arm.get("pulls") or 0) + 1
    total_reward = (arm.get("total_reward") or 0) + reward
    avg_reward = total_reward / pulls
    prev_ema = arm.get("ema_reward") or 0
    ema_reward = EMA_ALPHA * reward + (1 - EMA_ALPHA) * prev_ema
    return {
        "pulls": pulls,
        "total_reward": round(total_reward, 6),
        "avg_reward": round(avg_reward, 6),
        "ema_reward": round(ema_reward, 6),
        "last_pulled": datetime.utcnow(),
    }


def select_arm(arms: list[dict[str, Any]]) -> dict[str, Any] | None:
    enabled = [a for a in arms if a.get("enabled", True)]
    if not enabled:
        return None
    total_pulls = sum(a.get("pulls", 0) for a in enabled)
    best = None
    best_score = -1.0
    for arm in enabled:
        score = ucb1_score(arm.get("pulls", 0), arm.get("avg_reward", 0), total_pulls)
        arm["ucb_score"] = round(score, 6) if score != float("inf") else 999.0
        if score > best_score:
            best_score = score
            best = arm
    return best


def decay_domain(arms: list[dict[str, Any]], factor: float = 0.95) -> list[dict[str, Any]]:
    for arm in arms:
        arm["ema_reward"] = round((arm.get("ema_reward") or 0) * factor, 6)
    return arms
