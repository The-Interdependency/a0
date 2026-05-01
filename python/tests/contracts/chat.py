# 100:20
"""Contracts protecting python/routes/chat.py.

Source-of-truth declarations live in the CONTRACTS block of chat.py;
this file implements the assertions.
"""
from __future__ import annotations
from . import client, new_uid, db_delete_conv


async def _make_conv(c, uid: str, *, model: str = "grok-4", title: str | None = None) -> dict:
    r = await c.post(
        "/api/v1/conversations",
        json={"title": title or "ctest", "model": model},
        headers={"x-user-id": uid},
    )
    assert r.status_code == 200, f"create_conversation: {r.status_code} {r.text}"
    return r.json()


async def _delete_conv(c, conv_id: int, uid: str) -> None:
    await c.delete(f"/api/v1/conversations/{conv_id}", headers={"x-user-id": uid})


async def test_create_owner_isolation() -> None:
    """Body-supplied user_id must be silently dropped; header uid wins."""
    legit = new_uid("legit")
    async with client() as c:
        r = await c.post(
            "/api/v1/conversations",
            json={"title": "ctest", "model": "grok-4", "user_id": "attacker"},
            headers={"x-user-id": legit},
        )
        assert r.status_code == 200, r.text
        conv = r.json()
        try:
            assert conv["user_id"] == legit, (
                f"mass-assignment hole: stored user_id={conv['user_id']!r} "
                f"(expected {legit!r}); attacker payload wasn't dropped"
            )
        finally:
            await _delete_conv(c, conv["id"], legit)


async def test_create_anonymous_owner_null() -> None:
    """No x-user-id header → conversation lands with user_id=NULL."""
    async with client() as c:
        r = await c.post(
            "/api/v1/conversations",
            json={"title": "ctest-anon", "model": "grok-4"},
        )
        assert r.status_code == 200, r.text
        conv = r.json()
        try:
            assert conv["user_id"] is None, (
                f"anonymous create leaked owner: user_id={conv['user_id']!r}"
            )
        finally:
            # The HTTP DELETE route gates on ownership match; an
            # anonymous (owner=NULL) row can't be deleted by any HTTP
            # caller, so use direct-DB cleanup to avoid leaving test
            # residue.
            await db_delete_conv(conv["id"])


async def test_get_other_owner_404() -> None:
    """GET /conversations/{id} of someone else's conv must return 404."""
    owner = new_uid("owner")
    other = new_uid("other")
    async with client() as c:
        conv = await _make_conv(c, owner)
        try:
            r = await c.get(
                f"/api/v1/conversations/{conv['id']}",
                headers={"x-user-id": other},
            )
            assert r.status_code == 404, (
                f"cross-user existence disclosure: GET returned "
                f"{r.status_code} (expected 404)"
            )
        finally:
            await _delete_conv(c, conv["id"], owner)


async def test_delete_other_owner_404() -> None:
    """DELETE on someone else's conv must return 404 (not 403)."""
    owner = new_uid("owner")
    other = new_uid("other")
    async with client() as c:
        conv = await _make_conv(c, owner)
        try:
            r = await c.delete(
                f"/api/v1/conversations/{conv['id']}",
                headers={"x-user-id": other},
            )
            assert r.status_code == 404, (
                f"cross-user delete: returned {r.status_code} (expected 404)"
            )
            # Owner can still see the row — the failed delete didn't go through.
            r2 = await c.get(
                f"/api/v1/conversations/{conv['id']}",
                headers={"x-user-id": owner},
            )
            assert r2.status_code == 200, "owner lost access after cross-user 404"
        finally:
            await _delete_conv(c, conv["id"], owner)


async def test_unknown_body_model_400() -> None:
    """User-supplied body.model that the catalog can't resolve must 400.

    Without this, a typo in the picker (e.g. "grok-4-fasst") would
    silently route to the active provider and the user would think
    they got the model they asked for. Server-side fallbacks (agent
    model, active_provider) are still allowed — only user input is
    strict.
    """
    uid = new_uid("typo")
    async with client() as c:
        conv = await _make_conv(c, uid)
        try:
            r = await c.post(
                f"/api/v1/conversations/{conv['id']}/messages",
                json={"content": "hi", "model": "grok-4-totally-not-a-model"},
                headers={"x-user-id": uid},
            )
            assert r.status_code == 400, (
                f"silent typo reroute: POST /messages with bogus "
                f"body.model returned {r.status_code} (expected 400). "
                f"Body: {r.text[:200]}"
            )
            body = r.json()
            assert "grok-4-totally-not-a-model" in (body.get("detail") or ""), (
                f"400 detail should name the unknown model id; got {body!r}"
            )
        finally:
            await _delete_conv(c, conv["id"], uid)
# 100:20
