# 14:0
from __future__ import annotations

import json
from pathlib import Path
from datetime import datetime, timezone
from typing import Any, Dict

from .invariants import require_hmmm


def log_event(log_dir: Path, task_id: str, event: Dict[str, Any]) -> None:
    require_hmmm(event)
    log_dir.mkdir(parents=True, exist_ok=True)
    path = log_dir / f"{task_id}.jsonl"
    e = dict(event)
    e["ts"] = datetime.now(timezone.utc).isoformat()
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(e, ensure_ascii=False) + "\n")
# 14:0
