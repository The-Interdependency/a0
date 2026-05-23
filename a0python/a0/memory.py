# 69:9
"""Memory — continuity substrate.

Memory is not raw history.
Memory is continuity substrate.

Logs are not Memory. Memory is not logs. (Law 11)
Only Jury-adjudicated writes land in Memory.

Law 4: Persistence requires adjudication.
Law 11: Logs belong to event history, not continuity itself.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

from .encryption import decrypt, encrypt
from .invariants import InvalidStateError
from .tiers import Tier2


MEMORY_PATH = Path(__file__).resolve().parent / "state" / "memory.json"


@dataclass
class MemoryEntry:
    key: str
    value: Any
    jury_token: str
    compressed: bool = False


class Memory:
    """Continuity substrate — only Jury-adjudicated writes permitted."""

    def __init__(self, path: Optional[Path] = None) -> None:
        self._path = path or MEMORY_PATH
        self._store: Dict[str, MemoryEntry] = {}
        self._load()

    def commit(self, key: str, value: Any, jury_token: str) -> None:
        if not jury_token:
            raise InvalidStateError(
                "Memory write requires a Jury token — direct writes are blocked."
            )
        self._store[key] = MemoryEntry(key=key, value=value, jury_token=jury_token)
        self._persist()

    def commit_tier2(self, tier2: Tier2) -> None:
        if not isinstance(tier2, Tier2):
            raise InvalidStateError("Only Tier2 objects may be committed to Memory.")
        self.commit(
            key=str(id(tier2.content)),
            value=tier2.content,
            jury_token=tier2.jury_token,
        )

    def recall(self, key: str) -> Optional[Any]:
        entry = self._store.get(key)
        return entry.value if entry else None

    def all_keys(self) -> List[str]:
        return list(self._store.keys())

    def _persist(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        serialized = {
            k: {
                "key": e.key,
                "value": e.value,
                "jury_token": e.jury_token,
                "compressed": e.compressed,
            }
            for k, e in self._store.items()
        }
        self._path.write_text(
            encrypt(json.dumps(serialized, indent=2, ensure_ascii=False)),
            encoding="utf-8",
        )

    def _load(self) -> None:
        if not self._path.exists():
            return
        try:
            data = json.loads(decrypt(self._path.read_text(encoding="utf-8")))
            for k, v in data.items():
                self._store[k] = MemoryEntry(
                    key=v["key"],
                    value=v["value"],
                    jury_token=v["jury_token"],
                    compressed=v.get("compressed", False),
                )
        except (json.JSONDecodeError, KeyError):
            pass
# 69:9
