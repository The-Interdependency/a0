# 65:7
# DOC module: tests.test_energy_registry_persistence
# DOC label: Provider persistence path
# DOC description: Exercises success/failure behavior of
# set_active_provider_persistent with controlled async session doubles.
import importlib
import sys
import types

import pytest


def _load_energy_registry_with_sqlalchemy_stub(monkeypatch):
    """Import python.services.energy_registry even when sqlalchemy is absent.

    We stub only what this module needs: sqlalchemy.text.
    """
    sa = types.SimpleNamespace(text=lambda s: s)
    monkeypatch.setitem(sys.modules, "sqlalchemy", sa)
    mod = importlib.import_module("python.services.energy_registry")
    return importlib.reload(mod)


class _SessionOK:
    def __init__(self):
        self.executed = []
        self.committed = False

    async def execute(self, stmt, params):
        self.executed.append((stmt, params))

    async def commit(self):
        self.committed = True


class _AsyncCtx:
    def __init__(self, session):
        self.session = session

    async def __aenter__(self):
        return self.session

    async def __aexit__(self, exc_type, exc, tb):
        return False


def test_persistent_switch_writes_and_commits_async(monkeypatch):
    er_mod = _load_energy_registry_with_sqlalchemy_stub(monkeypatch)

    session = _SessionOK()
    fake_db = types.SimpleNamespace(get_session=lambda: _AsyncCtx(session))
    monkeypatch.setitem(sys.modules, "python.database", fake_db)

    registry = er_mod.EnergyRegistry()
    provider_id = registry.list_providers()[0]["id"]

    import asyncio
    ok = asyncio.run(registry.set_active_provider_persistent(provider_id))
    assert ok is True
    assert registry.get_active_provider() == provider_id
    assert session.committed is True
    assert len(session.executed) == 1
    stmt, params = session.executed[0]
    assert "INSERT INTO a0p_settings" in stmt
    assert params == {"pid": provider_id}


def test_persistent_switch_db_failure_is_non_fatal(monkeypatch):
    er_mod = _load_energy_registry_with_sqlalchemy_stub(monkeypatch)

    class _SessionFails(_SessionOK):
        async def execute(self, stmt, params):
            raise RuntimeError("db down")

    session = _SessionFails()
    fake_db = types.SimpleNamespace(get_session=lambda: _AsyncCtx(session))
    monkeypatch.setitem(sys.modules, "python.database", fake_db)

    registry = er_mod.EnergyRegistry()
    provider_id = registry.list_providers()[0]["id"]

    import asyncio
    ok = asyncio.run(registry.set_active_provider_persistent(provider_id))
    assert ok is True, "in-memory switch should still succeed"
    assert registry.get_active_provider() == provider_id
    assert session.committed is False


def test_persistent_switch_rejects_unknown_provider(monkeypatch):
    er_mod = _load_energy_registry_with_sqlalchemy_stub(monkeypatch)

    fake_db = types.SimpleNamespace(get_session=lambda: _AsyncCtx(_SessionOK()))
    monkeypatch.setitem(sys.modules, "python.database", fake_db)

    registry = er_mod.EnergyRegistry()
    current = registry.get_active_provider()

    import asyncio
    ok = asyncio.run(registry.set_active_provider_persistent("definitely-not-a-provider"))
    assert ok is False
    assert registry.get_active_provider() == current
# 65:7
