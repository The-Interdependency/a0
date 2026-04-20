# 165:10
"""Unit tests for the artifacts archive: schema defaults, sha256 dedupe,
dispatcher's "produces" wrapping, and the rewired image_generate tool.

The Object Storage client is monkeypatched out — these tests do not touch
the real bucket. They DO touch the real Postgres (test row inserts/cleanup)
because the helper module is async-SQLAlchemy bound. Each test runs in a
single asyncio.run() so the connection pool stays bound to one event loop.
"""
import asyncio
import hashlib
import json
import os

import pytest
from sqlalchemy import text

from python.database import get_session
from python.services import artifacts as _A


class _FakeBucketClient:
    def __init__(self):
        self.uploaded: dict[str, bytes] = {}

    def upload_from_bytes(self, key: str, data: bytes) -> None:
        self.uploaded[key] = data

    def download_as_bytes(self, key: str) -> bytes:
        return self.uploaded[key]


@pytest.fixture
def fake_bucket(monkeypatch):
    fb = _FakeBucketClient()
    monkeypatch.setattr(_A, "_client", lambda: fb)
    return fb


@pytest.fixture(autouse=True)
def _dispose_engine_each_test():
    """Each test runs its own asyncio.run(); dispose the async engine pool
    afterwards so the next test's loop gets fresh connections (asyncpg
    connections are bound to the loop they were opened on)."""
    yield
    from python.database import engine as _eng

    async def _close():
        await _eng.dispose()

    try:
        asyncio.run(_close())
    except Exception:
        pass


async def _delete_ids(ids: list[str]) -> None:
    if not ids:
        return
    async with get_session() as s:
        await s.execute(
            text("DELETE FROM artifacts WHERE id = ANY(:ids)"),
            {"ids": ids},
        )


def test_artifact_schema_defaults(fake_bucket):
    async def go():
        rec = await _A.archive_artifact(
            data=b"hello-world-uniq-1",
            kind="text",
            tool_name="unit_test",
            filename="hello.txt",
            mime="text/plain",
            provenance={"who": "test"},
        )
        try:
            assert rec["sha256"] == hashlib.sha256(b"hello-world-uniq-1").hexdigest()
            assert rec["size_bytes"] == len(b"hello-world-uniq-1")
            assert rec["public_url"] is None
            assert rec["deduped"] is False
            row = await _A._fetch_row(rec["id"])
            assert row["public"] is False
            assert row["created_at"] is not None
            assert row["kind"] == "text"
        finally:
            await _delete_ids([rec["id"]])
    asyncio.run(go())


def test_archive_artifact_dedupes_by_sha256(fake_bucket):
    async def go():
        a = await _A.archive_artifact(
            data=b"dup-payload-uniq-2", kind="text", tool_name="unit_test",
            filename="a.txt", mime="text/plain", provenance={},
        )
        try:
            b = await _A.archive_artifact(
                data=b"dup-payload-uniq-2", kind="text", tool_name="unit_test",
                filename="b-different-name.txt", mime="text/plain", provenance={},
            )
            assert b["id"] == a["id"]
            assert b["deduped"] is True
            assert len(fake_bucket.uploaded) == 1
        finally:
            await _delete_ids([a["id"]])
    asyncio.run(go())


def test_dispatcher_wraps_tools_with_produces(fake_bucket):
    from python.services import tools as tools_pkg
    pkg_dir = os.path.dirname(tools_pkg.__file__)
    fake_path = os.path.join(pkg_dir, "fake_archive_test_tool.py")
    fake_src = (
        '# 14:1\n'
        '"""Test-only tool — auto-archives via SCHEMA[\'produces\']."""\n'
        'SCHEMA = {\n'
        '    "type": "function",\n'
        '    "function": {"name": "fake_archive_test_tool",\n'
        '                 "description": "test tool",\n'
        '                 "parameters": {"type": "object", "properties": {}}},\n'
        '    "tier": "free", "approval_scope": None, "enabled": True,\n'
        '    "category": "test", "cost_hint": "free", "side_effects": [],\n'
        '    "version": 1,\n'
        '    "produces": {"kind": "text", "mime_pattern": "text/*"},\n'
        '}\n'
        'async def handle(**_):\n'
        '    return {"data": b"fake-tool-payload-uniq-3", "filename": "fake.txt",\n'
        '            "mime": "text/plain", "provenance": {"src": "test"}}\n'
        '# 14:1\n'
    )
    with open(fake_path, "w") as fh:
        fh.write(fake_src)
    tools_pkg._CACHE["modules"] = None
    tools_pkg._CACHE["fingerprint"] = ""
    art_id_holder: list[str] = []

    async def go():
        try:
            result = await tools_pkg.dispatch("fake_archive_test_tool")
            assert isinstance(result, dict)
            assert result["count"] == 1
            art = result["artifacts"][0]
            art_id_holder.append(art["id"])
            assert art["kind"] == "text"
            assert art["mime"] == "text/plain"
            row = await _A._fetch_row(art["id"])
            assert row["tool_name"] == "fake_archive_test_tool"
            assert row["filename"] == "fake.txt"
        finally:
            await _delete_ids(art_id_holder)

    try:
        asyncio.run(go())
    finally:
        try:
            os.remove(fake_path)
        except FileNotFoundError:
            pass
        tools_pkg._CACHE["modules"] = None
        tools_pkg._CACHE["fingerprint"] = ""


def test_image_generate_now_returns_artifact_id(fake_bucket, monkeypatch):
    from python.services.tools import image_generate as ig
    from python.services import tools as tools_pkg

    async def _fake_handle(prompt: str = "", aspect_ratio: str = "1:1", style_hint=None, **_):
        return {
            "data": b"\x89PNG-fake-bytes-imagen3-uniq-4",
            "filename": "imagen3_unitfake.png",
            "mime": "image/png",
            "provenance": {"prompt": prompt, "aspect_ratio": aspect_ratio,
                           "model": "imagen-3"},
        }

    monkeypatch.setattr(ig, "handle", _fake_handle)
    tools_pkg._CACHE["modules"] = None
    tools_pkg._CACHE["fingerprint"] = ""
    art_id_holder: list[str] = []

    async def go():
        try:
            result = await tools_pkg.dispatch("image_generate", prompt="a cat")
            assert result["count"] == 1
            art = result["artifacts"][0]
            art_id_holder.append(art["id"])
            assert art["kind"] == "image"
            assert art["mime"] == "image/png"
            assert art["url"].startswith("/api/v1/artifacts/")
            row = await _A._fetch_row(art["id"])
            assert row["tool_name"] == "image_generate"
            assert row["mime"] == "image/png"
            prov = row["provenance"]
            if isinstance(prov, str):
                prov = json.loads(prov)
            assert prov.get("prompt") == "a cat"
        finally:
            await _delete_ids(art_id_holder)

    try:
        asyncio.run(go())
    finally:
        tools_pkg._CACHE["modules"] = None
        tools_pkg._CACHE["fingerprint"] = ""
# 165:10
