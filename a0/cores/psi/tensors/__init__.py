"""Psi tensors — the build logic of a0.

The code to build a0 resides here.

a0 is the routing and adapter framework — it is semantic work:
routing, contract resolution, tool dispatch, model adaptation.
These are Psi's operations: pattern recognition, contextual routing,
meaning-to-action translation.

Re-exports the canonical a0 build modules so they are accessible
as Psi's tensors without breaking existing import paths.
"""
from a0.contract import A0Request, A0Response, Mode
from a0.router import handle
from a0.model_adapter import ModelAdapter, LocalEchoAdapter
from a0.adapters import ClaudeAgentAdapter, ALL_SUBAGENTS, MODE_SUBAGENTS
from a0.tools.edcm_tool import run_edcm
from a0.tools.pdf_tool import run_pdf_extract
from a0.tools.whisper_tool import run_whisper_segments

__all__ = [
    # Contract
    "A0Request",
    "A0Response",
    "Mode",
    # Router
    "handle",
    # Adapters
    "ModelAdapter",
    "LocalEchoAdapter",
    "ClaudeAgentAdapter",
    "ALL_SUBAGENTS",
    "MODE_SUBAGENTS",
    # Tools
    "run_edcm",
    "run_pdf_extract",
    "run_whisper_segments",
]
