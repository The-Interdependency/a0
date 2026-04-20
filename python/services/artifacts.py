# 206:26
"""Unified artifacts archive — Replit Object Storage backed.

Every byte stream a0 produces (images, reports, evidence files, generated
code) lands here automatically through the dispatcher's `produces` wrapper
in python/services/tools/__init__.py.

Storage layout:
    artifacts/<kind>/<yyyy>/<mm>/<dd>/<sha256_first16>_<filename>

Dedupe: if a row already exists with the same sha256, no re-upload happens
and the existing row is returned. Per-user doctrine: every error raises
explicitly — no silent fallbacks, no "best effort" writes.

Bucket comes from DEFAULT_OBJECT_STORAGE_BUCKET_ID (set automatically by
`setup_object_storage`). REPLIT_OBJECT_STORAGE_BUCKET_ID is also accepted
as an alias for forward-compat with future skill versions.
"""
import asyncio
import datetime as _dt
import hashlib
import os
from typing import Any

from sqlalchemy import text

from ..database import get_session


def _bucket_id() -> str:
    bid = (
        os.environ.get("DEFAULT_OBJECT_STORAGE_BUCKET_ID")
        or os.environ.get("REPLIT_OBJECT_STORAGE_BUCKET_ID")
    )
    if not bid:
        raise RuntimeError(
            "artifacts: object storage not configured. Set "
            "DEFAULT_OBJECT_STORAGE_BUCKET_ID (created via Replit "
            "'Object Storage' tool / setup_object_storage tool)."
        )
    return bid


def _client():
    """Construct a Replit Object Storage client. Imported lazily so that
    the test suite can monkeypatch this function without requiring the
    SDK at import time."""
    from replit.object_storage import Client as _RClient
    return _RClient(bucket_id=_bucket_id())


def _storage_key(kind: str, sha: str, filename: str) -> str:
    today = _dt.datetime.utcnow()
    safe = "".join(c if c.isalnum() or c in "._-" else "_" for c in filename) or "blob"
    return f"artifacts/{kind}/{today:%Y/%m/%d}/{sha[:16]}_{safe}"


async def _find_by_sha(sha: str) -> dict | None:
    async with get_session() as s:
        r = await s.execute(
            text(
                "SELECT id, storage_path, sha256, size_bytes, public "
                "FROM artifacts WHERE sha256 = :sha LIMIT 1"
            ),
            {"sha": sha},
        )
        row = r.mappings().first()
        return dict(row) if row else None


async def _insert_row(
    *,
    kind: str,
    tool_name: str | None,
    agent_run_id: str | None,
    storage_path: str,
    filename: str,
    mime: str,
    size_bytes: int,
    sha256: str,
    provenance: dict,
    public: bool,
    created_at: _dt.datetime | None = None,
) -> str:
    """Insert and return the new row id. created_at is server-default unless
    explicitly provided (used by backfill to preserve original timestamps)."""
    import json as _json
    cols = [
        "kind", "tool_name", "agent_run_id", "storage_path", "filename",
        "mime", "size_bytes", "sha256", "provenance", "public",
    ]
    params: dict[str, Any] = {
        "kind": kind, "tool_name": tool_name, "agent_run_id": agent_run_id,
        "storage_path": storage_path, "filename": filename, "mime": mime,
        "size_bytes": size_bytes, "sha256": sha256,
        "provenance": _json.dumps(provenance or {}),
        "public": public,
    }
    placeholders = [
        ":kind", ":tool_name", ":agent_run_id", ":storage_path", ":filename",
        ":mime", ":size_bytes", ":sha256", "CAST(:provenance AS jsonb)", ":public",
    ]
    if created_at is not None:
        cols.append("created_at")
        placeholders.append(":created_at")
        params["created_at"] = created_at
    sql = (
        f"INSERT INTO artifacts ({', '.join(cols)}) "
        f"VALUES ({', '.join(placeholders)}) RETURNING id"
    )
    async with get_session() as s:
        r = await s.execute(text(sql), params)
        new_id = r.scalar_one()
        return str(new_id)


async def archive_artifact(
    data: bytes,
    kind: str,
    tool_name: str | None,
    filename: str,
    mime: str,
    provenance: dict,
    agent_run_id: str | None = None,
    public: bool = False,
    created_at: _dt.datetime | None = None,
) -> dict:
    """Archive `data` to Object Storage + insert artifacts row.

    Returns {id, storage_path, public_url, sha256, size_bytes}.
    Dedupes by sha256: if a row exists, return it without re-upload.
    """
    if not isinstance(data, (bytes, bytearray)):
        raise TypeError("archive_artifact: data must be bytes")
    if not data:
        raise ValueError("archive_artifact: data is empty")
    sha = hashlib.sha256(data).hexdigest()
    existing = await _find_by_sha(sha)
    if existing:
        return {
            "id": str(existing["id"]),
            "storage_path": existing["storage_path"],
            "public_url": _public_url(existing["storage_path"]) if existing.get("public") else None,
            "sha256": sha,
            "size_bytes": existing["size_bytes"],
            "deduped": True,
        }
    key = _storage_key(kind, sha, filename)
    client = _client()

    def _upload():
        client.upload_from_bytes(key, bytes(data))

    await asyncio.to_thread(_upload)
    new_id = await _insert_row(
        kind=kind, tool_name=tool_name, agent_run_id=agent_run_id,
        storage_path=key, filename=filename, mime=mime,
        size_bytes=len(data), sha256=sha, provenance=provenance or {},
        public=public, created_at=created_at,
    )
    return {
        "id": new_id,
        "storage_path": key,
        "public_url": _public_url(key) if public else None,
        "sha256": sha,
        "size_bytes": len(data),
        "deduped": False,
    }


def _public_url(storage_path: str) -> str:
    """Server-relative URL the Express layer proxies into the bucket."""
    return f"/api/v1/artifacts/by-path/{storage_path}"


async def _fetch_row(artifact_id: str) -> dict | None:
    async with get_session() as s:
        r = await s.execute(
            text(
                "SELECT id, kind, tool_name, agent_run_id, storage_path, "
                "filename, mime, size_bytes, sha256, provenance, public, "
                "created_at FROM artifacts WHERE id = :id"
            ),
            {"id": artifact_id},
        )
        row = r.mappings().first()
        return dict(row) if row else None


async def get_artifact_bytes(artifact_id: str) -> bytes:
    row = await _fetch_row(artifact_id)
    if not row:
        raise KeyError(f"artifact {artifact_id!r} not found")
    client = _client()

    def _dl() -> bytes:
        return client.download_as_bytes(row["storage_path"])

    return await asyncio.to_thread(_dl)


async def get_artifact_signed_url(artifact_id: str, ttl_seconds: int = 900) -> str:
    """Return a short-lived GCS signed URL. Raises if the underlying SDK
    does not expose a signing path (the Replit object-storage client wraps
    google-cloud-storage internally — we reach through to the GCS handle)."""
    row = await _fetch_row(artifact_id)
    if not row:
        raise KeyError(f"artifact {artifact_id!r} not found")
    client = _client()
    bucket_handle = client._Client__get_bucket_handle()  # noqa: SLF001
    blob = bucket_handle.blob(row["storage_path"])

    def _sign() -> str:
        from datetime import timedelta as _td
        return blob.generate_signed_url(
            version="v4",
            expiration=_td(seconds=ttl_seconds),
            method="GET",
        )

    return await asyncio.to_thread(_sign)


async def list_artifacts(
    *,
    kind: str | None = None,
    tool_name: str | None = None,
    since: _dt.datetime | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    where: list[str] = []
    params: dict[str, Any] = {"limit": limit, "offset": offset}
    if kind:
        where.append("kind = :kind")
        params["kind"] = kind
    if tool_name:
        where.append("tool_name = :tool_name")
        params["tool_name"] = tool_name
    if since:
        where.append("created_at >= :since")
        params["since"] = since
    where_sql = ("WHERE " + " AND ".join(where)) if where else ""
    sql = (
        "SELECT id, kind, tool_name, agent_run_id, storage_path, filename, "
        "mime, size_bytes, sha256, provenance, public, created_at "
        f"FROM artifacts {where_sql} ORDER BY created_at DESC NULLS LAST "
        "LIMIT :limit OFFSET :offset"
    )
    async with get_session() as s:
        r = await s.execute(text(sql), params)
        return [dict(row) for row in r.mappings().all()]


async def distinct_tool_names() -> list[str]:
    async with get_session() as s:
        r = await s.execute(
            text(
                "SELECT DISTINCT tool_name FROM artifacts "
                "WHERE tool_name IS NOT NULL ORDER BY tool_name"
            )
        )
        return [row[0] for row in r.fetchall()]


async def set_public(artifact_id: str, public: bool) -> dict | None:
    async with get_session() as s:
        await s.execute(
            text("UPDATE artifacts SET public = :p WHERE id = :id"),
            {"p": public, "id": artifact_id},
        )
    return await _fetch_row(artifact_id)
# 206:26
