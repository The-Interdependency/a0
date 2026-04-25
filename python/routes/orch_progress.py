# 39:10
"""SSE endpoint for live multi-model orchestration progress.
GET /api/v1/orchestration/{client_run_id}/stream — read-only."""
import asyncio
import json

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from ..services.orch_progress import (
    owner_matches,
    register_subscriber,
    unregister_subscriber,
)

# DOC module: orch_progress
# DOC label: Live Orchestration
# DOC description: SSE channel for live per-voice token meters during multi-model chat sends.
# DOC tier: free
# DOC endpoint: GET /api/v1/orchestration/{client_run_id}/stream | SSE per-voice progress events for one in-flight send.
# DOC notes: Read-only. Bus is in-memory and ephemeral; events are not persisted.

router = APIRouter(prefix="/api/v1/orchestration", tags=["orchestration"])


_IDLE_TIMEOUT_SECS = 300.0  # 5 minutes
_HEARTBEAT_SECS = 15.0


@router.get("/{client_run_id}/stream")
async def stream_orch_progress(client_run_id: str, request: Request):
    """SSE stream for one chat send. Closes on orchestration_done.
    Returns 404 (not 403) on owner mismatch or unknown id."""
    caller = request.headers.get("x-user-id") or None
    if not owner_matches(client_run_id, caller):
        raise HTTPException(status_code=404, detail="run not found")
    q = register_subscriber(client_run_id)

    async def gen():
        idle_elapsed = 0.0
        try:
            yield f": connected to {client_run_id}\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    payload = await asyncio.wait_for(q.get(), timeout=_HEARTBEAT_SECS)
                    idle_elapsed = 0.0
                    yield f"event: progress\ndata: {json.dumps(payload, default=str)}\n\n"
                    if payload.get("type") == "orchestration_done":
                        break
                except asyncio.TimeoutError:
                    idle_elapsed += _HEARTBEAT_SECS
                    if idle_elapsed >= _IDLE_TIMEOUT_SECS:
                        break
                    yield ": heartbeat\n\n"
        finally:
            unregister_subscriber(client_run_id, q)

    return StreamingResponse(gen(), media_type="text/event-stream")
# 39:10
