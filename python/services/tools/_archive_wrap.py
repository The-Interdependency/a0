# 62:10
"""Auto-archive wrapper for tools that declare a `produces` SCHEMA key.

Filename starts with underscore so the tool discovery scanner in this
package's __init__.py skips it (it is not itself a tool — it wraps tools).

Contract for tool handlers under "produces":
    handle(...) returns either:
      * dict with keys {data: bytes, filename: str, mime: str, provenance: dict}
      * list[dict] of the above (multi-artifact tools)
Anything else raises TypeError. Per the no-silent-fallback doctrine, we
fail loudly so the model sees the wrong shape.
"""
from typing import Any
import fnmatch

from ..artifacts import archive_artifact


def _validate_item(item: Any) -> dict:
    if not isinstance(item, dict):
        raise TypeError(
            f"tool produced non-dict artifact item: {type(item).__name__}"
        )
    for required in ("data", "filename", "mime"):
        if required not in item:
            raise KeyError(f"artifact item missing required key: {required!r}")
    if not isinstance(item["data"], (bytes, bytearray)):
        raise TypeError("artifact item 'data' must be bytes")
    return item


async def wrap(
    result: Any,
    *,
    tool_name: str,
    produces: dict,
    agent_run_id: str | None = None,
) -> dict:
    if isinstance(result, dict) and "data" in result:
        items = [result]
    elif isinstance(result, list):
        items = list(result)
    else:
        raise TypeError(
            f"tool {tool_name!r} declares 'produces' but returned "
            f"{type(result).__name__}; expected dict or list[dict]"
        )

    declared_kind = produces.get("kind", "binary")
    pattern = produces.get("mime_pattern")

    archived: list[dict] = []
    for raw in items:
        item = _validate_item(raw)
        mime = item["mime"]
        if pattern and not fnmatch.fnmatch(mime, pattern):
            raise ValueError(
                f"tool {tool_name!r} produced mime={mime!r} which does not "
                f"match declared pattern {pattern!r}"
            )
        kind = item.get("kind", declared_kind)
        rec = await archive_artifact(
            data=bytes(item["data"]),
            kind=kind,
            tool_name=tool_name,
            filename=item["filename"],
            mime=mime,
            provenance=item.get("provenance") or {},
            agent_run_id=agent_run_id,
            public=bool(item.get("public", False)),
        )
        archived.append({
            "id": rec["id"],
            "url": f"/api/v1/artifacts/{rec['id']}/download",
            "kind": kind,
            "mime": mime,
            "filename": item["filename"],
            "sha256": rec["sha256"],
            "size_bytes": rec["size_bytes"],
        })
    return {"artifacts": archived, "count": len(archived)}
# 62:10
