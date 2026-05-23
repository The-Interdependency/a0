# 12:2
# a0/state.py
# hmmm: keep state minimal; default stateless.
from __future__ import annotations
import json
from pathlib import Path
from typing import Any, Dict

STATE_PATH = Path(__file__).resolve().parent / "state" / "a0_state.json"

def load_state() -> Dict[str, Any]:
    if STATE_PATH.exists():
        return json.loads(STATE_PATH.read_text(encoding="utf-8"))
    return {"last_model": None}

def save_state(state: Dict[str, Any]) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8")
# 12:2
