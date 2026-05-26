# 30:0 0:0 0:3
from __future__ import annotations

import sys
from uuid import uuid4

import json

from .contract import A0Request, A0Response, normalize_hmmm
from .guardian.emitter import emit
from .router import handle

def main() -> None:
    raw = open(sys.argv[1], "r", encoding="utf-8").read() if len(sys.argv) > 1 else sys.stdin.read()
    try:
        data = json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError as exc:
        resp = A0Response(
            task_id="task_invalid_json",
            result={"error": f"Invalid JSON payload: {exc.msg}"},
            hmmm=normalize_hmmm(None),
        )
        emit(resp)
        return

    req = A0Request(
        task_id=data.get("task_id") or f"task_{uuid4().hex[:12]}",
        input=data.get("input") or {"text": "", "files": [], "metadata": {}},
        tools_allowed=data.get("tools_allowed") or ["none"],
        mode=data.get("mode") or "analyze",
        hmmm=normalize_hmmm(data.get("hmmm") or data.get("hmm")),
    )

    resp = handle(req)
    emit(resp)

if __name__ == "__main__":
    main()
# 30:0 0:0 0:3
