# 110:31
"""bandit — pure UCB1 math kernel; live state lives on PCNA core (Task #112).

Reward shape: one scalar per pull via compute_reward(). Default
"coherence_per_dollar" rewards learning per USD. Changing the shape
invalidates EMA history — treat as a deliberate reset_domain event.
"""

# === CONTRACTS ===
# id: bandit_select_arm_handles_negative_rewards
#   given: every enabled arm has been pulled at least once and all
#          avg_reward values are deeply negative (e.g. -1000)
#   then:  select_arm() still returns the highest-scoring arm rather
#          than None — guarding against a -1.0 best_score floor that
#          would silently disable the selector after a coherence
#          regression on every arm
#   class: correctness
#   call:  python.tests.contracts.spawn_executor.test_bandit_select_arm_handles_negative_rewards
# === END CONTRACTS ===

import math
from datetime import datetime
from typing import Any, Iterable


EMA_ALPHA = 0.3
EXPLORATION_C = 1.41

DEFAULT_REWARD_SHAPE = "coherence_per_dollar"
_MIN_COST_USD = 1e-4  # floor; protects coherence_per_dollar from /0
_MIN_TOKENS = 1


def ucb1_score(pulls: int, avg_reward: float, total_pulls: int) -> float:
    if pulls == 0:
        return float("inf")
    exploration = EXPLORATION_C * math.sqrt(math.log(max(total_pulls, 1)) / pulls)
    return avg_reward + exploration


def update_arm_stats(arm: dict[str, Any], reward: float) -> dict[str, Any]:
    """Mutating in-place update of a single arm dict.

    Returns the same dict (with new pulls / averages / EMA / last_pulled).
    Callers that need an immutable copy should ``dict(arm)`` first.
    """
    pulls = (arm.get("pulls") or 0) + 1
    total_reward = (arm.get("total_reward") or 0) + reward
    avg_reward = total_reward / pulls
    prev_ema = arm.get("ema_reward") or 0
    ema_reward = EMA_ALPHA * reward + (1 - EMA_ALPHA) * prev_ema
    arm.update({
        "pulls": pulls,
        "total_reward": round(total_reward, 6),
        "avg_reward": round(avg_reward, 6),
        "ema_reward": round(ema_reward, 6),
        "last_pulled": datetime.utcnow(),
    })
    return arm


def select_arm(arms: list[dict[str, Any]]) -> dict[str, Any] | None:
    enabled = [a for a in arms if a.get("enabled", True)]
    if not enabled:
        return None
    total_pulls = sum(a.get("pulls", 0) for a in enabled)
    best = None
    # -inf, not -1.0 — coherence_per_dollar can produce arbitrarily
    # negative rewards (regression in any of phi/psi/omega/theta), and
    # a -1.0 floor would silently return None for a domain whose all
    # arms have learned to lose value. Task #112.
    best_score = float("-inf")
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


# ---- reward shape -----------------------------------------------------

def _delta_sum(delta: dict[str, Any] | None) -> float:
    """Sum phi/psi/omega/theta_circles deltas; missing fields count as zero."""
    if not isinstance(delta, dict):
        return 0.0
    keys = ("phi_delta", "psi_delta", "omega_delta", "theta_circles_delta")
    total = 0.0
    for k in keys:
        v = delta.get(k)
        try:
            total += float(v) if v is not None else 0.0
        except (TypeError, ValueError):
            continue
    return total


def compute_reward(
    delta: dict[str, Any] | None,
    *,
    cost_usd: float = 0.0,
    total_tokens: int = 0,
    shape: str = DEFAULT_REWARD_SHAPE,
) -> float:
    """Merge delta → scalar reward. Shapes: coherence, coherence_per_dollar,
    coherence_per_token. Unknown shape raises ValueError."""
    s = _delta_sum(delta)
    if shape == "coherence":
        return round(s, 6)
    if shape == "coherence_per_dollar":
        denom = max(float(cost_usd or 0.0), _MIN_COST_USD)
        return round(s / denom, 6)
    if shape == "coherence_per_token":
        denom = max(int(total_tokens or 0), _MIN_TOKENS)
        return round(s / denom, 6)
    raise ValueError(
        f"unknown reward shape {shape!r}; "
        f"expected 'coherence' | 'coherence_per_dollar' | 'coherence_per_token'"
    )


# ---- domain helpers (operate on the arms list of one bandit_state domain)

def ensure_arm(arms: list[dict[str, Any]], arm_id: str) -> dict[str, Any]:
    """Find or insert arm by id; new arms start pulls=0 (UCB1 explores first)."""
    for a in arms:
        if a.get("arm_id") == arm_id:
            return a
    fresh = {
        "arm_id": arm_id,
        "pulls": 0,
        "total_reward": 0.0,
        "avg_reward": 0.0,
        "ema_reward": 0.0,
        "ucb_score": 0.0,
        "enabled": True,
        "last_pulled": None,
    }
    arms.append(fresh)
    return fresh


def select_filtered(
    arms: list[dict[str, Any]],
    candidate_ids: Iterable[str],
    *,
    is_eligible=None,
) -> dict[str, Any] | None:
    """UCB1 pick restricted to candidate_ids that also pass is_eligible."""
    candidates = list(candidate_ids)
    if not candidates:
        return None
    pool = []
    for arm_id in candidates:
        if is_eligible is not None and not is_eligible(arm_id):
            continue
        pool.append(ensure_arm(arms, arm_id))
    if not pool:
        return None
    return select_arm(pool)
# 110:31
