# 66:16
"""Out-of-band progress bus for live multi-model orchestration meters.

aimmh-lib's CallFn is non-streaming, so progress is published on a
separate in-memory bus keyed by a client-generated client_run_id.
Ephemeral, bounded, ContextVar-isolated per request.
"""
import asyncio
import contextvars
import time as _time
from typing import Optional


# Set by chat.py around the multi-model branch so emitters publish without
# threading the id through every signature.
current_client_run_id: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "a0p_client_run_id", default=None,
)


_QUEUES: dict[str, list[asyncio.Queue]] = {}
_QUEUE_MAXSIZE = 256  # drop on full; final state still arrives via chat POST

# client_run_id -> user_id ("" for anonymous). Consulted by the SSE
# endpoint to reject cross-user subscriptions.
_OWNERSHIP: dict[str, str] = {}
_OWNERSHIP_MAX = 1024


def register_subscriber(client_run_id: str) -> asyncio.Queue:
    """Allocate a queue for an SSE subscriber; multiple subscribers per id supported."""
    q: asyncio.Queue = asyncio.Queue(maxsize=_QUEUE_MAXSIZE)
    _QUEUES.setdefault(client_run_id, []).append(q)
    return q


def unregister_subscriber(client_run_id: str, q: asyncio.Queue) -> None:
    lst = _QUEUES.get(client_run_id)
    if not lst:
        return
    try:
        lst.remove(q)
    except ValueError:
        pass
    if not lst:
        _QUEUES.pop(client_run_id, None)


def publish(event_type: str, payload: dict, client_run_id: Optional[str] = None) -> None:
    """Fan an event to subscribers on this client_run_id; no-op without any.
    Full queues drop the event rather than block the orchestration path."""
    cid = client_run_id or current_client_run_id.get()
    if not cid:
        return
    lst = _QUEUES.get(cid)
    if not lst:
        return
    msg = {
        "type": event_type,
        "ts": _time.time(),
        **payload,
    }
    for q in list(lst):
        try:
            q.put_nowait(msg)
        except asyncio.QueueFull:
            pass


def has_subscribers(client_run_id: Optional[str] = None) -> bool:
    cid = client_run_id or current_client_run_id.get()
    if not cid:
        return False
    return bool(_QUEUES.get(cid))


def register_owner(client_run_id: str, user_id: Optional[str]) -> None:
    """Bind a client_run_id to its initiator. Raises ValueError on conflict
    (different user already owns the id) to defend against UUID replay."""
    if not client_run_id:
        return
    existing = _OWNERSHIP.get(client_run_id)
    if existing is not None and existing != (user_id or ""):
        raise ValueError(
            f"client_run_id {client_run_id!r} already owned by a different user"
        )
    if len(_OWNERSHIP) >= _OWNERSHIP_MAX:
        # FIFO-evict ~10% (dict preserves insertion order in 3.7+).
        evict = max(1, _OWNERSHIP_MAX // 10)
        for k in list(_OWNERSHIP.keys())[:evict]:
            _OWNERSHIP.pop(k, None)
    _OWNERSHIP[client_run_id] = user_id or ""


def unregister_owner(client_run_id: str) -> None:
    _OWNERSHIP.pop(client_run_id, None)


def owner_matches(client_run_id: str, user_id: Optional[str]) -> bool:
    """True iff the id is registered and the caller is the recorded owner."""
    if not client_run_id or client_run_id not in _OWNERSHIP:
        return False
    return (_OWNERSHIP[client_run_id] or "") == (user_id or "")
# 66:16
