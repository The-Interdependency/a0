# 59:5 0:0 4:8
from __future__ import annotations

import os
from pathlib import Path
from .contract import A0Request, A0Response, normalize_hmmm
from .logging import log_event
from .state import load_state, save_state
from .model_adapter import LocalEchoAdapter

from .tools.edcm_tool import run_edcm
from .tools.pdf_tool import run_pdf_extract
from .tools.whisper_tool import run_whisper_segments

_DEFAULT_LOG_DIR = Path(__file__).resolve().parent / "logs"
LOG_DIR = Path(os.environ.get("A0_LOG_DIR", _DEFAULT_LOG_DIR))


def _select_adapter(req: A0Request):
    """Select the best available adapter for this request.

    Prefers ClaudeAgentAdapter (full PTCA subagent pipeline).
    Falls back to LocalEchoAdapter if agent mode is not requested
    or if the SDK is unavailable.
    """
    try:
        from .adapters.claude_agent_adapter import ClaudeAgentAdapter, _SDK_AVAILABLE
    except (ImportError, ModuleNotFoundError):
        _SDK_AVAILABLE = False
        ClaudeAgentAdapter = None  # type: ignore[assignment]

    if _SDK_AVAILABLE and ClaudeAgentAdapter and req.mode in ("analyze", "act", "route"):
        return ClaudeAgentAdapter(mode=req.mode)
    return LocalEchoAdapter()


def handle(req: A0Request) -> A0Response:
    hmmm = normalize_hmmm(req.hmmm)
    state = load_state()
    adapter = _select_adapter(req)
    state["last_model"] = adapter.name
    save_state(state)

    log_event(LOG_DIR, req.task_id, {
        "type": "request",
        "mode": req.mode,
        "tools_allowed": req.tools_allowed,
        "hmmm": hmmm,
    })

    text = (req.input or {}).get("text", "")
    files = (req.input or {}).get("files", []) or []

    if "pdf_extract" in req.tools_allowed and files:
        out = run_pdf_extract(files)
        log_event(LOG_DIR, req.task_id, {"type": "tool", "name": "pdf_extract", "hmmm": hmmm})
        return A0Response(task_id=req.task_id, result={"text": "", "artifacts": [out]}, hmmm=hmmm)

    if "whisper" in req.tools_allowed and files:
        out = run_whisper_segments(files)
        log_event(LOG_DIR, req.task_id, {"type": "tool", "name": "whisper", "hmmm": hmmm})
        return A0Response(task_id=req.task_id, result={"text": "", "artifacts": [out]}, hmmm=hmmm)

    if "edcm" in req.tools_allowed:
        out = run_edcm(text)
        log_event(LOG_DIR, req.task_id, {"type": "tool", "name": "edcm", "hmmm": hmmm})
        return A0Response(task_id=req.task_id, result={"text": "", "artifacts": [out]}, hmmm=hmmm)

    resp = adapter.complete(
        [{"role": "user", "content": text}],
        mode=req.mode,
        hmmm=hmmm,
    )
    log_event(LOG_DIR, req.task_id, {
        "type": "model",
        "name": adapter.name,
        "subagents_used": resp.get("subagents_used", []),
        "hmmm": hmmm,
    })
    return A0Response(task_id=req.task_id, result={"text": resp.get("text", ""), "artifacts": []}, hmmm=hmmm)
# 59:5 0:0 4:8
