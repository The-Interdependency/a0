# 40:5
"""Contracts protecting python/routes/energy.py."""
from __future__ import annotations
from . import client, new_uid


async def test_seed_patch_requires_admin() -> None:
    """PATCH /providers/{id}/seed must 403 for non-admin on every field."""
    uid = new_uid("nonadmin")
    async with client() as c:
        # No admin role header — every field must be rejected.
        for payload in (
            {"enabled": False},
            {"disabled_models": ["grok-4"]},
            {"model_assignments": {"derive": "grok-4-fast-reasoning"}},
        ):
            r = await c.patch(
                "/api/energy/providers/grok/seed",
                json=payload,
                headers={"x-user-id": uid},
            )
            assert r.status_code == 403, (
                f"authz hole: PATCH /seed with {list(payload)[0]} "
                f"returned {r.status_code} for non-admin (expected 403)"
            )
        # Sanity: with admin role, the same call succeeds.
        r_admin = await c.patch(
            "/api/energy/providers/grok/seed",
            json={"model_assignments": {"derive": "grok-4-fast-reasoning"}},
            headers={"x-user-id": uid, "x-user-role": "admin"},
        )
        assert r_admin.status_code == 200, (
            f"admin path broken: {r_admin.status_code} {r_admin.text}"
        )


async def test_providers_list_public_read() -> None:
    """GET /providers is readable without admin (powers the model picker)."""
    uid = new_uid("reader")
    async with client() as c:
        r = await c.get("/api/energy/providers", headers={"x-user-id": uid})
        assert r.status_code == 200, r.text
        providers = r.json()
        assert isinstance(providers, list) and len(providers) > 0, (
            f"providers list shape changed: {providers!r}"
        )
        for p in providers:
            assert "id" in p and "route_config" in p, (
                f"provider entry missing required fields: {p!r}"
            )
# 40:5
