from __future__ import annotations

from pathlib import Path
from .contract import A0Request, A0Response
from .logging import log_event
from .model_adapter import LocalEchoAdapter
from .tools.edcm_tool import run_edcm
from .tools.pdf_tool import run_pdf_extract
from .tools.whisper_tool import run_whisper_segments

from typing import Any, Dict, Optional

from a0.state import load_state, save_state

_DEFAULT_LOG_DIR = Path(__file__).resolve().parent.parent.parent.parent / "logs"


def _resolve_model_config(
    home: Optional[Path],
    registry: Optional[Any],
    context: Optional[Dict[str, Any]],
) -> Optional[Any]:
    """Resolve a ModelConfig using the three-layer merge chain.

    Merge priority (lowest → highest):
        1. DEFAULT_REGISTRY[model_id]   — built-in defaults
        2. InstanceDescriptor.config    — per-instance settings from home
        3. per-call context arg         — caller-supplied overrides

    Returns None if no model_id is found or registry lookup fails.
    """
    try:
        from a0.model_registry import ModelRegistry

        reg = registry if registry is not None else ModelRegistry.defaults()

        # Layer 2: instance config from home
        inst_ctx: Dict[str, Any] = {}
        if home:
            try:
                from a0.lifecycle import InstanceDescriptor
                desc = InstanceDescriptor.load(home)
                inst_ctx = dict(desc.config)
            except Exception:
                pass

        # Layer 3: per-call context
        call_ctx = context or {}

        # Resolve model_id (per-call wins over instance)
        model_id = call_ctx.get("model_id") or inst_ctx.get("model_id")
        if not model_id or model_id not in reg:
            return None

        # Layer 1 → merge layer 2 → merge layer 3
        base_cfg = reg.get(model_id)
        return base_cfg.merge({**inst_ctx, **call_ctx})
    except Exception:
        return None


def _select_adapter(req: A0Request, config: Optional[Any] = None) -> Any:
    """Select adapter based on A0_MODEL env tensor or ModelConfig.

    When config is provided and its adapter field is set, that takes
    priority over the env tensor.

    Priority:
        config.adapter (if set)  → adapter from registry
        anthropic-api            → AnthropicAdapter
        claude-agent             → ClaudeAgentAdapter
        zfae                     → ZFAEBackend (via inference.get_backend)
        local-echo               → LocalEchoAdapter
        (fallback)               → LocalEchoAdapter
    """
    from .env import A0_MODEL

    effective_adapter = (
        getattr(config, "adapter", None) or A0_MODEL
    )

    if effective_adapter == "anthropic-api":
        try:
            from .adapters.anthropic_adapter import AnthropicAdapter
            return AnthropicAdapter(config=config)
        except (ImportError, Exception):
            pass

    if effective_adapter == "claude-agent":
        try:
            from .adapters.claude_agent_adapter import ClaudeAgentAdapter, _SDK_AVAILABLE
            if _SDK_AVAILABLE and req.mode in ("analyze", "act", "route"):
                return ClaudeAgentAdapter(mode=req.mode)
        except ImportError:
            pass

    if effective_adapter == "zfae":
        try:
            from a0.cores.pcna.inference import get_backend
            return get_backend(config=config)
        except Exception:
            pass

    if effective_adapter == "emergent":
        try:
            from .adapters.emergent_adapter import EmergentAdapter
            return EmergentAdapter()
        except (ImportError, NotImplementedError):
            pass

    if effective_adapter == "local-ollama":
        try:
            from .adapters.local_model_adapter import OllamaAdapter
            return OllamaAdapter()
        except ImportError:
            pass

    if effective_adapter == "local-llama":
        try:
            from .adapters.local_model_adapter import LlamaCppAdapter
            return LlamaCppAdapter()
        except ImportError:
            pass

    return LocalEchoAdapter()


def handle(
    req: A0Request,
    home: Optional[Path] = None,
    registry: Optional[Any] = None,
    context: Optional[Dict[str, Any]] = None,
) -> A0Response:
    """Route a request through the adapter pipeline.

    Args:
        req:      The A0Request to handle.
        home:     Optional instance home directory for state/logging.
        registry: Optional ModelRegistry.  Defaults to DEFAULT_REGISTRY.
                  Used to look up ModelConfig by model_id.
        context:  Optional per-call overrides dict.  May include model_id,
                  system_prompt, max_tokens, etc.  Merged on top of registry
                  defaults and instance config (InstanceDescriptor.config).
    """
    log_dir = (home / "logs") if home else _DEFAULT_LOG_DIR
    state = load_state(home)
    model_config = _resolve_model_config(home, registry, context)
    adapter = _select_adapter(req, config=model_config)
    state["last_model"] = adapter.name
    save_state(state, home)

    # Load instance memory (gracefully — no-op if file absent or decryption fails)
    memory = None
    try:
        from a0.memory import Memory
        mem_path = (home / "state" / "memory.json") if home else None
        memory = Memory(path=mem_path) if mem_path else Memory()
    except Exception:
        pass

    # Assemble effective system prompt: committed memory block + ModelConfig.system_prompt
    effective_system_prompt: Optional[str] = None
    if memory is not None:
        from .context_builder import build_memory_context
        effective_system_prompt = build_memory_context(
            memory=memory,
            base_system_prompt=getattr(model_config, "system_prompt", None),
            include=getattr(model_config, "include_memory", True),
        )

    log_event(log_dir, req.task_id, {
        "type": "request",
        "mode": req.mode,
        "tools_allowed": req.tools_allowed,
        "hmmm": req.hmmm,
    })

    text = (req.input or {}).get("text", "")
    files = (req.input or {}).get("files", []) or []

    if "pdf_extract" in req.tools_allowed and files:
        out = run_pdf_extract(files)
        log_event(log_dir, req.task_id, {"type": "tool", "name": "pdf_extract", "hmmm": []})
        return A0Response(task_id=req.task_id, result={"text": "", "artifacts": [out]}, hmmm=req.hmmm)

    if "whisper" in req.tools_allowed and files:
        out = run_whisper_segments(files)
        log_event(log_dir, req.task_id, {"type": "tool", "name": "whisper", "hmmm": []})
        return A0Response(task_id=req.task_id, result={"text": "", "artifacts": [out]}, hmmm=req.hmmm)

    if "edcm" in req.tools_allowed:
        out = run_edcm(text)
        log_event(log_dir, req.task_id, {"type": "tool", "name": "edcm", "hmmm": []})
        return A0Response(task_id=req.task_id, result={"text": "", "artifacts": [out]}, hmmm=req.hmmm)

    messages = list(req.history) + [{"role": "user", "content": text}]
    resp = adapter.complete(
        messages,
        mode=req.mode,
        hmmm=req.hmmm,
        system_prompt=effective_system_prompt,
    )
    log_event(log_dir, req.task_id, {
        "type": "model",
        "name": adapter.name,
        "subagents_used": resp.get("subagents_used", []),
        "hmmm": req.hmmm,
    })

    # Path B training capture: when A0_RUNTIME=training, store the external
    # model's response as a (reservoir_state, omega_target) training example
    # so ZFAE's readout W_out can be trained offline via train_readout().
    from .env import A0_RUNTIME
    if A0_RUNTIME == "training":
        try:
            from a0.cores.pcna.inference import get_backend
            backend = get_backend()
            if hasattr(backend, "capture_training_example"):
                backend.capture_training_example(text, resp.get("text", ""))
        except Exception:
            pass  # training capture is best-effort; never block a response

    return A0Response(
        task_id=req.task_id,
        result={"text": resp.get("text", ""), "artifacts": []},
        hmmm=req.hmmm,
    )
