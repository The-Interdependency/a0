from __future__ import annotations

from pathlib import Path
from .contract import A0Request, A0Response
from .logging import log_event
from .state import load_state, save_state
from .adapters import get_adapter

from .tools.edcm_tool import run_edcm
from .tools.pdf_tool import run_pdf_extract
from .tools.whisper_tool import run_whisper_segments

LOG_DIR = Path(__file__).resolve().parent / "logs"

def handle(req: A0Request) -> A0Response:
    state = load_state()
    adapter = get_adapter()
    state["last_model"] = adapter.name
    save_state(state)

    log_event(LOG_DIR, req.task_id, {
        "type": "request",
        "mode": req.mode,
        "tools_allowed": req.tools_allowed,
        "hmm": req.hmm
    })

    text = (req.input or {}).get("text", "")
    files = (req.input or {}).get("files", []) or []

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

    resp = adapter.complete([{"role": "user", "content": text}])
    log_event(LOG_DIR, req.task_id, {"type": "model", "name": adapter.name})
    return A0Response(task_id=req.task_id, result={"text": resp.get("text", ""), "artifacts": []}, hmm=req.hmm)
