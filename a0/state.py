# 14:0 0:0 2:0
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict

_DEFAULT_STATE_PATH = Path(__file__).resolve().parent / "state" / "a0_state.json"
STATE_PATH = Path(os.environ.get("A0_STATE_PATH", _DEFAULT_STATE_PATH))

def load_state() -> Dict[str, Any]:
    if STATE_PATH.exists():
        return json.loads(STATE_PATH.read_text(encoding="utf-8"))
    return {"last_model": None}

def save_state(state: Dict[str, Any]) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8")
# 14:0 0:0 2:0
