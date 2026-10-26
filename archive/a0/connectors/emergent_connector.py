# 14:3 0:0 1:2
# a0/connectors/emergent_connector.py
# hmmm: adapter layer for “model hub” style calling conventions.
# Implement: translate hub payload <-> A0Request/A0Response.

from __future__ import annotations
from typing import Any, Dict
from ..contract import A0Request, A0Response
from ..router import handle

def handle_hub_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    req = A0Request(
        task_id=payload.get("task_id", "hub_task"),
        input=payload.get("input", {"text": payload.get("text", ""), "files": payload.get("files", []), "metadata": payload.get("metadata", {})}),
        tools_allowed=payload.get("tools_allowed", ["none"]),
        mode=payload.get("mode", "analyze"),
        hmmm=payload.get("hmmm") or payload.get("hmm") or [],
    )
    resp = handle(req)
    return {"task_id": resp.task_id, "result": resp.result, "logs": resp.logs, "hmmm": resp.hmmm}
# 14:3 0:0 1:2
