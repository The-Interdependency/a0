# N:M
# DOC module: tests.test_spawn_caps
# DOC label: Recursion caps
# DOC description: Verifies SpawnCapExceeded fires when depth+1 or sibling+1
# would exceed the per-tier cap, and that get_caps_for_tier honors fallbacks.
import asyncio
import pytest

from python.services import spawn_caps as SC


def test_depth_cap_raises_for_free_tier(monkeypatch):
    async def _no_db(_tier=None):
        return {}

    async def _no_siblings(_pid):
        return 0

    monkeypatch.setattr(SC, "_load_tier_overrides", _no_db)
    monkeypatch.setattr(SC, "sibling_count", _no_siblings)

    async def _go():
        await SC.check_can_spawn(parent_run_id=None, current_depth=2, tier="free")

    with pytest.raises(SC.SpawnCapExceeded) as ei:
        asyncio.run(_go())
    assert ei.value.cap == "depth"
    assert ei.value.limit == 2


def test_fanout_cap_raises(monkeypatch):
    async def _no_db():
        return {}

    async def _many(_pid):
        return 5

    monkeypatch.setattr(SC, "_load_tier_overrides", _no_db)
    monkeypatch.setattr(SC, "sibling_count", _many)

    async def _go():
        await SC.check_can_spawn(parent_run_id="p", current_depth=0, tier="admin")

    with pytest.raises(SC.SpawnCapExceeded) as ei:
        asyncio.run(_go())
    assert ei.value.cap == "fanout"


def test_settings_overrides_take_precedence(monkeypatch):
    async def _override():
        return {"free": 7}

    async def _no_siblings(_pid):
        return 0

    monkeypatch.setattr(SC, "_load_tier_overrides", _override)
    monkeypatch.setattr(SC, "sibling_count", _no_siblings)

    async def _go():
        return await SC.get_caps_for_tier("free")

    caps = asyncio.run(_go())
    assert caps["max_depth"] == 7


def test_caps_description_mentions_env_keys():
    s = SC.caps_description_tail()
    assert "A0P_MAX_SPAWN_DEPTH" in s
    assert "A0P_MAX_SPAWN_FANOUT" in s
# N:M
