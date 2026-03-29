from __future__ import annotations

from pathlib import Path
from .contract import A0Request, A0Response
from .logging import log_event
from .model_adapter import LocalEchoAdapter
from .tools.edcm_tool import run_edcm
from .tools.pdf_tool import run_pdf_extract
from .tools.whisper_tool import run_whisper_segments

from a0.state import load_state, save_state

LOG_DIR = Path(__file__).resolve().parent.parent.parent.parent / "logs"


def _select_adapter(req: A0Request):
    """Select adapter based on A0_MODEL env tensor.

    Priority:
        anthropic-api  → AnthropicAdapter (direct Anthropic Messages API)
        claude-agent   → ClaudeAgentAdapter (full PTCA subagent pipeline)
        local-echo     → LocalEchoAdapter (no network, always works)

    Falls back to LocalEchoAdapter if the requested adapter is unavailable.
    """
    from .env import A0_MODEL

    if A0_MODEL == "anthropic-api":
        try:
            from .adapters.anthropic_adapter import AnthropicAdapter
            return AnthropicAdapter()
        except (ImportError, Exception):
            pass

    if A0_MODEL == "claude-agent":
        try:
            from .adapters.claude_agent_adapter import ClaudeAgentAdapter, _SDK_AVAILABLE
            if _SDK_AVAILABLE and req.mode in ("analyze", "act", "route"):
                return ClaudeAgentAdapter(mode=req.mode)
        except ImportError:
            pass

    if A0_MODEL == "emergent":
        try:
            from .adapters.emergent_adapter import EmergentAdapter
            return EmergentAdapter()
        except (ImportError, NotImplementedError):
            pass  # placeholder not yet configured — fall through to local-echo

    if A0_MODEL == "local-ollama":
        try:
            from .adapters.local_model_adapter import OllamaAdapter
            return OllamaAdapter()
        except ImportError:
            pass

    if A0_MODEL == "local-llama":
        try:
            from .adapters.local_model_adapter import LlamaCppAdapter
            return LlamaCppAdapter()
        except ImportError:
            pass

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

    messages = list(req.history) + [{"role": "user", "content": text}]
    resp = adapter.complete(
        messages,
        mode=req.mode,
        hmmm=req.hmmm,
    )
    log_event(LOG_DIR, req.task_id, {
        "type": "model",
        "name": adapter.name,
        "subagents_used": resp.get("subagents_used", []),
        "hmmm": req.hmmm,
    })
    return A0Response(
        task_id=req.task_id,
        result={"text": resp.get("text", ""), "artifacts": []},
        hmmm=req.hmmm,
    )
