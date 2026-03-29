from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, Optional

_DEFAULT_STATE_PATH = Path(__file__).resolve().parent / "state" / "a0_state.json"


def _state_path(home: Optional[Path]) -> Path:
    return (home / "state" / "a0_state.json") if home else _DEFAULT_STATE_PATH


def load_state(home: Optional[Path] = None) -> Dict[str, Any]:
    path = _state_path(home)
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return {"last_model": None}


def save_state(state: Dict[str, Any], home: Optional[Path] = None) -> None:
    path = _state_path(home)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8")
