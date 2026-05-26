# 8:11 0:0 0:3
"""Psi tensors — canonical home of a0 build logic.

The a0 routing and processing framework lives here.
These are real modules, not re-exports.

Paths:
    a0.cores.psi.tensors.contract      — A0Request / A0Response
    a0.cores.psi.tensors.router        — handle()
    a0.cores.psi.tensors.logging       — log_event()
    a0.cores.psi.tensors.model_adapter — ModelAdapter / LocalEchoAdapter
    a0.cores.psi.tensors.tools.*       — EDCM / PDF / Whisper tools
    a0.cores.psi.tensors.adapters.*    — ClaudeAgentAdapter / subagents
"""
from .contract import A0Request, A0Response, Mode
from .router import handle
from .model_adapter import ModelAdapter, LocalEchoAdapter

__all__ = [
    "A0Request", "A0Response", "Mode",
    "handle",
    "ModelAdapter", "LocalEchoAdapter",
]
# 8:11 0:0 0:3
