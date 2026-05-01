# 48:24
"""Contract test harness — see .local/skills/test-build/SKILL.md.

Provides a shared httpx AsyncClient configured against the running
FastAPI app (localhost:8001) with the live INTERNAL_API_SECRET attached.
Tests should use `client()` as an async context manager and `new_uid()`
for isolation.

The internal token is read at runtime from the uvicorn worker's environ
via /proc — same trick `start-dev.sh` uses to share the ephemeral dev
secret with curl smoke tests. This avoids requiring the runner to be
launched with a pre-shared token.
"""
from __future__ import annotations
import os
import uuid
import subprocess
from contextlib import asynccontextmanager
import httpx


_BASE = "http://localhost:8001"


def _resolve_internal_token() -> str:
    """Resolve the live INTERNAL_API_SECRET.

    First check the current env (works when run from start-dev.sh's
    shell). Fall back to scraping /proc/<uvicorn-pid>/environ for the
    ephemeral dev secret.
    """
    tok = os.environ.get("INTERNAL_API_SECRET")
    if tok:
        return tok
    try:
        pid = subprocess.check_output(
            ["pgrep", "-f", "uvicorn.*python.main"], text=True
        ).strip().splitlines()[0]
    except (subprocess.CalledProcessError, IndexError):
        raise RuntimeError(
            "FastAPI worker not running and INTERNAL_API_SECRET not in env — "
            "start the workflow before running contract tests"
        )
    with open(f"/proc/{pid}/environ", "rb") as f:
        for entry in f.read().split(b"\0"):
            if entry.startswith(b"INTERNAL_API_SECRET="):
                return entry.split(b"=", 1)[1].decode()
    raise RuntimeError(f"INTERNAL_API_SECRET not found in /proc/{pid}/environ")


@asynccontextmanager
async def client():
    """Async HTTP client targeting the live FastAPI app with auth attached."""
    token = _resolve_internal_token()
    async with httpx.AsyncClient(
        base_url=_BASE,
        headers={"x-a0p-internal": token},
        timeout=10.0,
    ) as c:
        yield c


def new_uid(prefix: str = "ctest") -> str:
    """Unique caller id so tests can't collide with each other or real users."""
    return f"{prefix}-{uuid.uuid4().hex[:12]}"


async def db_delete_conv(conv_id: int) -> None:
    """Direct-DB cleanup for anonymous conversations.

    The HTTP DELETE route requires the caller's x-user-id to match the
    row's owner; for anonymous (owner=NULL) conversations created
    during contract tests, no HTTP caller can match. This helper opens
    a transient SQLAlchemy connection and deletes by id so test runs
    don't leave residue in the conversations table.
    """
    from python.database import engine
    from sqlalchemy import text
    async with engine.begin() as conn:
        await conn.execute(
            text("DELETE FROM messages WHERE conversation_id = :cid"),
            {"cid": conv_id},
        )
        await conn.execute(
            text("DELETE FROM conversations WHERE id = :cid"),
            {"cid": conv_id},
        )
# 48:24
