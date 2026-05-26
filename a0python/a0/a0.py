# 21:8 0:0 0:3
"""a0 CLI entry point — Guardian-owned.

Thin shell that imports from psi tensors and emits through Guardian.

Import paths:
    a0.cores.psi.tensors.contract  — A0Request
    a0.cores.psi.tensors.router    — handle()
    a0.guardian.emitter            — emit()

Law 9: Guardian alone owns human-readable outward emission.
"""
from __future__ import annotations

import sys
import json
from uuid import uuid4

from .cores.psi.tensors.contract import A0Request
from .cores.psi.tensors.router import handle
from .guardian.emitter import emit


def main() -> None:
    raw = open(sys.argv[1], "r", encoding="utf-8").read() if len(sys.argv) > 1 else sys.stdin.read()
    data = json.loads(raw) if raw.strip() else {}

    req = A0Request(
        task_id=data.get("task_id") or f"task_{uuid4().hex[:12]}",
        input=data.get("input") or {"text": "", "files": [], "metadata": {}},
        tools_allowed=data.get("tools_allowed") or ["none"],
        mode=data.get("mode") or "analyze",
        hmmm=data.get("hmmm") or data.get("hmm") or [],
    )

    resp = handle(req)
    emit(resp)


if __name__ == "__main__":
    main()
# 21:8 0:0 0:3
