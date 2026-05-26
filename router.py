# 36:5 0:0 4:7
# a0/router.py
# hmmm: router chooses tool vs model. Keep deterministic when possible.

from __future__ import annotations
from typing import Any, Dict
from pathlib import Path

from .contract import A0Request, A0Response
from .logging import log_event
from .state import load_state, save_state
from .model_adapter import ModelAdapter, LocalEchoAdapter

from .tools.edcm_tool import run_edcm
from .tools.pdf_tool import run_pdf_extract
from .tools.whisper_tool import run_whisper_segments

LOG_DIR = Path(__file__).resolve().parent / "logs"

def pick_adapter(req: A0Request) -> ModelAdapter:
    # hmmm: replace with real provider selection when ready
    return LocalEchoAdapter()

def handle(req: A0Request) -> A0Response:
    state = load_state()
    adapter = pick_adapter(req)
    state["last_model"] = adapter.name
    save_state(state)

    log_event(LOG_DIR, req.task_id, {"type": "request", "mode": req.mode, "tools_allowed": req.tools_allowed, "hmm": req.hmm})

    text = (req.input or {}).get("text", "")
    files = (req.input or {}).get("files", []) or []

    # Tooling order: (1) CLI usefulness: allow explicit tool calls via tools_allowed
    if "pdf_extract" in req.tools_allowed and files:
        out = run_pdf_extract(files)
        log_event(LOG_DIR, req.task_id, {"type": "tool", "name": "pdf_extract"})
        return A0Response(task_id=req.task_id, result={"text": "", "artifacts": [out]}, hmm=req.hmm)

    if "whisper" in req.tools_allowed and files:
        out = run_whisper_segments(files)
        log_event(LOG_DIR, req.task_id, {"type": "tool", "name": "whisper"})
        return A0Response(task_id=req.task_id, result={"text": "", "artifacts": [out]}, hmm=req.hmm)

    if "edcm" in req.tools_allowed:
        out = run_edcm(text)
        log_event(LOG_DIR, req.task_id, {"type": "tool", "name": "edcm"})
        return A0Response(task_id=req.task_id, result={"text": "", "artifacts": [out]}, hmm=req.hmm)

    # Default: model completion
    resp = adapter.complete([{"role": "user", "content": text}])
    log_event(LOG_DIR, req.task_id, {"type": "model", "name": adapter.name})
    return A0Response(task_id=req.task_id, result={"text": resp.get("text", ""), "artifacts": []}, hmm=req.hmm)
# 36:5 0:0 4:7
