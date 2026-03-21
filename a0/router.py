from __future__ import annotations

from pathlib import Path
from .contract import A0Request, A0Response
from .logging import log_event
from .state import load_state, save_state
from .model_adapter import LocalEchoAdapter
from .adapters.claude_agent_adapter import ClaudeAgentAdapter

from .tools.edcm_tool import run_edcm
from .tools.pdf_tool import run_pdf_extract
from .tools.whisper_tool import run_whisper_segments

LOG_DIR = Path(__file__).resolve().parent / "logs"


def _select_adapter(req: A0Request):
    """Select the best available adapter for this request.

    Prefers ClaudeAgentAdapter (full PTCA subagent pipeline).
    Falls back to LocalEchoAdapter if agent mode is not requested
    or if the SDK is unavailable.
    """
    from .adapters.claude_agent_adapter import _SDK_AVAILABLE
    if _SDK_AVAILABLE and req.mode in ("analyze", "act", "route"):
        return ClaudeAgentAdapter(mode=req.mode)
    return LocalEchoAdapter()


def handle(req: A0Request) -> A0Response:
    state = load_state()
    adapter = _select_adapter(req)
    state["last_model"] = adapter.name
    save_state(state)

    log_event(LOG_DIR, req.task_id, {
        "type": "request",
        "mode": req.mode,
        "tools_allowed": req.tools_allowed,
        "hmmm": req.hmmm,
    })

    text = (req.input or {}).get("text", "")
    files = (req.input or {}).get("files", []) or []

    if "pdf_extract" in req.tools_allowed and files:
        out = run_pdf_extract(files)
        log_event(LOG_DIR, req.task_id, {"type": "tool", "name": "pdf_extract", "hmmm": []})
        return A0Response(task_id=req.task_id, result={"text": "", "artifacts": [out]}, hmmm=req.hmmm)

    if "whisper" in req.tools_allowed and files:
        out = run_whisper_segments(files)
        log_event(LOG_DIR, req.task_id, {"type": "tool", "name": "whisper", "hmmm": []})
        return A0Response(task_id=req.task_id, result={"text": "", "artifacts": [out]}, hmmm=req.hmmm)

    if "edcm" in req.tools_allowed:
        out = run_edcm(text)
        log_event(LOG_DIR, req.task_id, {"type": "tool", "name": "edcm", "hmmm": []})
        return A0Response(task_id=req.task_id, result={"text": "", "artifacts": [out]}, hmmm=req.hmmm)

    resp = adapter.complete(
        [{"role": "user", "content": text}],
        mode=req.mode,
        hmmm=req.hmmm,
    )
    log_event(LOG_DIR, req.task_id, {
        "type": "model",
        "name": adapter.name,
        "subagents_used": resp.get("subagents_used", []),
        "hmmm": req.hmmm,
    })
    return A0Response(task_id=req.task_id, result={"text": resp.get("text", ""), "artifacts": []}, hmmm=req.hmmm)
