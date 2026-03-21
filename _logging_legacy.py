# a0/logging.py
from __future__ import annotations
import json
from pathlib import Path
from datetime import datetime, timezone
from typing import Any, Dict

def log_event(log_dir: Path, task_id: str, event: Dict[str, Any]) -> None:
    log_dir.mkdir(parents=True, exist_ok=True)
    path = log_dir / f"{task_id}.jsonl"
    event = dict(event)
    event["ts"] = datetime.now(timezone.utc).isoformat()
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(event, ensure_ascii=False) + "\n")
