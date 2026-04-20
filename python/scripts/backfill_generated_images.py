# 71:8
"""One-shot backfill: copy every generated_images row into the new artifacts
table, preserving created_at. Idempotent (sha256 dedupe). Surfaces every
failure explicitly — never a silent skip.

Run from the project root:
    uv run python -m python.scripts.backfill_generated_images
"""
import asyncio
import os
import sys

from sqlalchemy import text

from python.database import get_session
from python.services import artifacts as _A


_SEARCH_ROOTS = ["uploads", "attached_assets"]


def _find_local_bytes(storage_url: str) -> bytes | None:
    """generated_images.storage_url is typically /uploads/<file>. Try that
    first, then a couple of likely fallbacks. Returns None if not found."""
    if not storage_url:
        return None
    name = storage_url.lstrip("/")
    candidates: list[str] = [name]
    base = os.path.basename(name)
    for root in _SEARCH_ROOTS:
        candidates.append(os.path.join(root, base))
    for path in candidates:
        if path and os.path.isfile(path):
            with open(path, "rb") as fh:
                return fh.read()
    return None


async def _all_generated_images() -> list[dict]:
    async with get_session() as s:
        r = await s.execute(text(
            "SELECT id, owner_user_id, prompt, model, aspect_ratio, "
            "storage_url, bytes, created_at FROM generated_images "
            "ORDER BY id"
        ))
        return [dict(row) for row in r.mappings().all()]


async def main() -> int:
    rows = await _all_generated_images()
    print(f"backfill: found {len(rows)} generated_images rows")
    backfilled = 0
    deduped = 0
    failed: list[tuple[int, str]] = []
    for row in rows:
        gid = row["id"]
        url = row.get("storage_url") or ""
        try:
            data = _find_local_bytes(url)
            if data is None:
                raise FileNotFoundError(f"local bytes not found for {url!r}")
            filename = os.path.basename(url) or f"genimage_{gid}.png"
            rec = await _A.archive_artifact(
                data=data,
                kind="image",
                tool_name="image_generate",
                filename=filename,
                mime="image/png",
                provenance={
                    "prompt": row.get("prompt"),
                    "model": row.get("model"),
                    "aspect_ratio": row.get("aspect_ratio"),
                    "owner_user_id": row.get("owner_user_id"),
                    "backfilled_from": "generated_images",
                    "legacy_id": gid,
                },
                public=False,
                created_at=row.get("created_at"),
            )
            if rec.get("deduped"):
                deduped += 1
            else:
                backfilled += 1
        except Exception as e:
            failed.append((gid, f"{type(e).__name__}: {e}"))
    print(f"backfill: {backfilled} backfilled, {deduped} deduped, {len(failed)} failed")
    for gid, reason in failed:
        print(f"  FAILED id={gid}: {reason}")
    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
# 71:8
