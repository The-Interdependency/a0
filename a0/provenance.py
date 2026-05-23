# 89:28
"""Provenance — hash-chain event history.

Canonical law:
- no hidden memory
- no silent external action
- no persistence without adjudicated legality
- audit-relevant state must be reconstructible from sealed event history
  plus committed snapshots

Canonical model:
- logs are active during cycle
- sealed after cycle
- append-only after seal/archive
- events.jsonl is event truth after seal
- provenance.json carries hash-chain / version material
- snapshots may compress or aid recovery
- snapshots do not replace event truth

Guardian never logs phonon content.
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional


_SEALED_SUFFIX = ".sealed"


def _sha256(data: str) -> str:
    return hashlib.sha256(data.encode("utf-8")).hexdigest()


def _read_chain_tip(provenance_path: Path) -> Optional[str]:
    if not provenance_path.exists():
        return None
    try:
        data = json.loads(provenance_path.read_text(encoding="utf-8"))
        entries = data.get("chain", [])
        if entries:
            return entries[-1].get("hash")
    except (json.JSONDecodeError, KeyError):
        pass
    return None


def append_event(
    log_dir: Path,
    task_id: str,
    event: Dict[str, Any],
) -> str:
    """Append an event to the active JSONL log and update provenance hash-chain.

    Returns the hash of the appended event.
    Raises if the log has been sealed (append-only enforcement).
    """
    log_dir.mkdir(parents=True, exist_ok=True)
    events_path = log_dir / f"{task_id}.jsonl"
    sealed_path = log_dir / f"{task_id}.jsonl{_SEALED_SUFFIX}"
    provenance_path = log_dir / f"{task_id}_provenance.json"

    if sealed_path.exists():
        raise PermissionError(
            f"Event log for {task_id} has been sealed — append-only after seal."
        )

    e = dict(event)
    e["ts"] = datetime.now(timezone.utc).isoformat()
    line = json.dumps(e, ensure_ascii=False)

    with events_path.open("a", encoding="utf-8") as f:
        f.write(line + "\n")

    prior_hash = _read_chain_tip(provenance_path) or ""
    event_hash = _sha256(prior_hash + line)

    _extend_chain(provenance_path, event_hash, e["ts"], event.get("type", "unknown"))

    return event_hash


def seal_log(log_dir: Path, task_id: str) -> str:
    """Seal the event log for task_id.

    After sealing:
    - the .jsonl file is renamed to .jsonl.sealed (append-only)
    - provenance.json records the seal hash and timestamp
    - the original .jsonl file is removed

    Returns the final chain hash.
    """
    log_dir.mkdir(parents=True, exist_ok=True)
    events_path = log_dir / f"{task_id}.jsonl"
    sealed_path = log_dir / f"{task_id}.jsonl{_SEALED_SUFFIX}"
    provenance_path = log_dir / f"{task_id}_provenance.json"

    if not events_path.exists():
        raise FileNotFoundError(f"No active event log found for {task_id}")

    content = events_path.read_text(encoding="utf-8")
    seal_hash = _sha256(content)
    sealed_path.write_text(content, encoding="utf-8")
    events_path.unlink()

    _record_seal(provenance_path, seal_hash)

    return seal_hash


def _extend_chain(
    provenance_path: Path,
    event_hash: str,
    ts: str,
    event_type: str,
) -> None:
    if provenance_path.exists():
        data = json.loads(provenance_path.read_text(encoding="utf-8"))
    else:
        data = {"chain": [], "sealed": False, "seal_hash": None}

    data["chain"].append({
        "hash": event_hash,
        "ts": ts,
        "type": event_type,
    })
    provenance_path.write_text(
        json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8"
    )


def _record_seal(provenance_path: Path, seal_hash: str) -> None:
    if provenance_path.exists():
        data = json.loads(provenance_path.read_text(encoding="utf-8"))
    else:
        data = {"chain": [], "sealed": False, "seal_hash": None}

    data["sealed"] = True
    data["seal_hash"] = seal_hash
    data["sealed_at"] = datetime.now(timezone.utc).isoformat()
    provenance_path.write_text(
        json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8"
    )


def read_provenance(log_dir: Path, task_id: str) -> Dict[str, Any]:
    provenance_path = log_dir / f"{task_id}_provenance.json"
    if not provenance_path.exists():
        return {"chain": [], "sealed": False, "seal_hash": None}
    return json.loads(provenance_path.read_text(encoding="utf-8"))
# 89:28
