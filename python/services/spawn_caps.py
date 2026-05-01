# 111:30
# N:M
"""Recursion-cap enforcement for sub_agent_spawn.

Caps come from two sources, in priority order:
  1. settings table key 'spawn_caps_by_tier' (jsonb) — per-tier overrides
  2. env vars A0P_MAX_SPAWN_DEPTH / A0P_MAX_SPAWN_FANOUT — global defaults

Tier defaults baked into code (used when neither setting nor env present):
  free=2, seeker=3, operator=4, patron=5, admin=5

NO silent truncation: a violation raises SpawnCapExceeded which the tool
dispatcher converts into a tool_result error visible to the model.
"""
import json
import os
from typing import Optional

from sqlalchemy import text as _sa_text


_DEFAULT_DEPTH = int(os.environ.get("A0P_MAX_SPAWN_DEPTH", "3"))
_DEFAULT_FANOUT = int(os.environ.get("A0P_MAX_SPAWN_FANOUT", "5"))
# Task #122 — concurrent-live cap. Per-call depth+fanout already exists;
# this third dimension bounds how many sub-agents a single parent can
# have *alive at the same time*, regardless of how many spawn calls it
# made. Counted from the in-memory _sub_agents registry, so it tracks
# real PCNA forks, not bookkeeping rows.
_DEFAULT_CONCURRENT_LIVE = int(os.environ.get("A0P_MAX_SPAWN_CONCURRENT_LIVE", "10"))

_TIER_FALLBACKS = {
    "free": 2, "seeker": 3, "operator": 4, "patron": 5, "admin": 5,
}
_TIER_CONCURRENT_LIVE = {
    "free": 2, "seeker": 4, "operator": 8, "patron": 12, "admin": 20,
}


class SpawnCapExceeded(RuntimeError):
    """Raised when a spawn would exceed the configured depth or fanout cap."""

    def __init__(self, cap: str, current: int, limit: int, tier: str):
        self.cap = cap
        self.current = current
        self.limit = limit
        self.tier = tier
        super().__init__(
            f"spawn cap exceeded: {cap}={current} > limit={limit} (tier={tier}). "
            f"Override via settings.spawn_caps_by_tier or env "
            f"A0P_MAX_SPAWN_DEPTH / A0P_MAX_SPAWN_FANOUT."
        )


async def _load_tier_overrides() -> dict:
    """Read settings.spawn_caps_by_tier (global scope, user_id='')."""
    try:
        from ..database import get_session
        async with get_session() as s:
            r = await s.execute(
                _sa_text(
                    "SELECT value FROM settings "
                    "WHERE user_id = '' AND key = 'spawn_caps_by_tier' LIMIT 1"
                )
            )
            row = r.first()
            if row and row[0]:
                v = row[0]
                if isinstance(v, str):
                    v = json.loads(v)
                return v or {}
    except Exception:
        pass
    return {}


async def get_caps_for_tier(tier: str) -> dict:
    overrides = await _load_tier_overrides()
    depth = overrides.get(tier)
    if depth is None:
        depth = _TIER_FALLBACKS.get(tier, _DEFAULT_DEPTH)
    fanout = overrides.get(f"{tier}_fanout")
    if fanout is None:
        fanout = _DEFAULT_FANOUT
    concurrent_live = overrides.get(f"{tier}_concurrent_live")
    if concurrent_live is None:
        concurrent_live = _TIER_CONCURRENT_LIVE.get(tier, _DEFAULT_CONCURRENT_LIVE)
    return {
        "max_depth": int(depth),
        "max_fanout": int(fanout),
        "max_concurrent_live": int(concurrent_live),
        "tier": tier,
    }


async def sibling_count(parent_run_id: Optional[str]) -> int:
    """Count agent_runs already spawned under the same parent."""
    if not parent_run_id:
        return 0
    try:
        from ..database import get_session
        async with get_session() as s:
            r = await s.execute(
                _sa_text(
                    "SELECT COUNT(*) FROM agent_runs WHERE parent_run_id = :pid"
                ),
                {"pid": parent_run_id},
            )
            return int(r.scalar_one() or 0)
    except Exception:
        return 0


def _count_concurrent_live(parent_run_id: Optional[str]) -> int:
    """Lazy import — agent_lifecycle owns the canonical registry. The
    import is local so this module stays usable in cold-start tests
    that don't initialize the lifecycle module."""
    try:
        from .agent_lifecycle import count_live_for_parent
        return int(count_live_for_parent(parent_run_id))
    except Exception:
        return 0


async def check_can_spawn(
    parent_run_id: Optional[str],
    current_depth: int,
    tier: str,
) -> dict:
    """Raise SpawnCapExceeded if the caps would be violated. Returns caps dict.

    Three dimensions are enforced:
      * depth — how many spawn frames we're nested under
      * fanout — how many DB rows already exist for this parent (per-call)
      * concurrent_live — how many in-memory PCNA forks the parent has
        right now (Task #122 — bounds spawn-spawn-merge-spawn loops)
    """
    caps = await get_caps_for_tier(tier)
    if current_depth + 1 > caps["max_depth"]:
        raise SpawnCapExceeded(
            "depth", current_depth + 1, caps["max_depth"], tier,
        )
    siblings = await sibling_count(parent_run_id)
    if siblings + 1 > caps["max_fanout"]:
        raise SpawnCapExceeded(
            "fanout", siblings + 1, caps["max_fanout"], tier,
        )
    live = _count_concurrent_live(parent_run_id)
    if live + 1 > caps["max_concurrent_live"]:
        raise SpawnCapExceeded(
            "concurrent_live", live + 1, caps["max_concurrent_live"], tier,
        )
    return caps


def caps_description_tail() -> str:
    """One-line summary appended to sub_agent_spawn SCHEMA description."""
    return (
        f"\n\nRecursion caps: depth ≤ {_DEFAULT_DEPTH}, "
        f"fanout ≤ {_DEFAULT_FANOUT}, concurrent_live ≤ "
        f"{_DEFAULT_CONCURRENT_LIVE} (tier overrides via "
        f"settings.spawn_caps_by_tier; env "
        f"A0P_MAX_SPAWN_DEPTH / A0P_MAX_SPAWN_FANOUT / "
        f"A0P_MAX_SPAWN_CONCURRENT_LIVE)."
    )
# N:M
# 111:30
