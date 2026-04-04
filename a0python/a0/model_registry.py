"""model_registry — LLM model registry for a0.

Modelled on the DEFAULT_REGISTRY / generate_response(model_id, messages, registry, user)
/ make_call_fn() pattern from erinepshovel-code/aimmh.

Usage::

    from a0.model_registry import ModelRegistry, ModelConfig, make_complete_fn

    # In-memory registry pre-loaded with built-in defaults
    reg = ModelRegistry.defaults()

    # Edit any field for any registered model
    reg.update("claude-sonnet-4-6", max_tokens=4096, system_prompt="You are a PTCA router.")

    # Register a developer-specific config
    reg.register(ModelConfig(
        model_id="alice-opus",
        adapter="anthropic-api",
        model_name="claude-opus-4-6",
        developer="alice",
        system_prompt="You are a PTCA training oracle.",
    ))

    # Per-developer defaults
    alice_models = reg.get_defaults_for("alice")

    # aimmh-style callable — wraps registry + per-instance context
    complete = make_complete_fn(registry=reg, context={"model_id": "alice-opus"})
    response = complete("alice-opus", [{"role": "user", "content": "hello"}])

Context merging chain (lowest → highest priority)::

    DEFAULT_REGISTRY[model_id] → InstanceDescriptor.config → per-call context arg
"""
from __future__ import annotations

import json
import uuid
from copy import deepcopy
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional


#: Type alias for the callable returned by make_complete_fn.
CompleteFn = Callable[[str, List[Dict[str, Any]]], Any]


@dataclass
class ModelConfig:
    """Complete configuration for one LLM instantiation.

    All fields can be edited individually via ModelRegistry.update().
    Use merge() to apply per-instance overrides without mutating the registry.
    """

    # ----- Identity -----
    model_id: str
    """Registry key used to look up this config."""

    adapter: str
    """Adapter to use: anthropic-api | local-ollama | local-llama | zfae | local-echo"""

    # ----- LLM parameters -----
    model_name: Optional[str] = None
    """Model name passed to the provider API.  None → adapter built-in default."""

    max_tokens: int = 2048
    """Maximum tokens in the model's response."""

    temperature: float = 0.7
    """Sampling temperature (0 = deterministic, 1 = creative)."""

    system_prompt: Optional[str] = None
    """System prompt injected before the user messages.  None → adapter default."""

    include_memory: bool = True
    """When True (default), committed Memory entries are injected into the system
    prompt on every request, grounding the model in the instance's continuity
    substrate.  Set False to disable for adapters that don't use text prompts
    (e.g. zfae, local-echo)."""

    # ----- ZFAE field alphas (used when adapter="zfae") -----
    phi_alpha: float = 0.7
    """Spectral radius for the phi (structural) field reservoir.
    Lower → shorter structural memory.  Must be in (0, 1)."""

    psi_alpha: float = 0.9
    """Spectral radius for the psi (semantic) field reservoir.
    Higher → longer semantic memory."""

    omega_alpha: float = 0.95
    """Spectral radius for the omega (synthesis input) field reservoir."""

    synthesis_alpha: float = 0.9
    """Spectral radius for the synthesis reservoir (receives all field summaries)."""

    # ----- Developer / metadata -----
    developer: Optional[str] = None
    """Developer or team this config belongs to (for get_defaults_for())."""

    description: Optional[str] = None
    """Human-readable description of this config."""

    # ------------------------------------------------------------------

    def merge(self, overrides: Dict[str, Any]) -> "ModelConfig":
        """Return a new ModelConfig with overrides applied.

        Only keys that are valid ModelConfig field names are applied.
        Unknown keys are silently ignored, so InstanceDescriptor.config
        (which may carry non-model keys) can be passed directly.
        """
        valid = set(self.__dataclass_fields__)  # type: ignore[attr-defined]
        filtered = {k: v for k, v in overrides.items() if k in valid}
        result = deepcopy(self)
        for k, v in filtered.items():
            setattr(result, k, v)
        return result

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "ModelConfig":
        known = set(cls.__dataclass_fields__)  # type: ignore[attr-defined]
        return cls(**{k: v for k, v in d.items() if k in known})


# ---------------------------------------------------------------------------
# DEFAULT_REGISTRY — module-level constant, the source of truth
# ---------------------------------------------------------------------------

DEFAULT_REGISTRY: Dict[str, ModelConfig] = {
    "claude-opus-4-6": ModelConfig(
        model_id="claude-opus-4-6",
        adapter="anthropic-api",
        model_name="claude-opus-4-6",
        max_tokens=4096,
        temperature=0.7,
        phi_alpha=0.7, psi_alpha=0.9, omega_alpha=0.95, synthesis_alpha=0.9,
        description="Anthropic Opus 4.6 — highest capability",
    ),
    "claude-sonnet-4-6": ModelConfig(
        model_id="claude-sonnet-4-6",
        adapter="anthropic-api",
        model_name="claude-sonnet-4-6",
        max_tokens=2048,
        temperature=0.7,
        phi_alpha=0.7, psi_alpha=0.9, omega_alpha=0.95, synthesis_alpha=0.9,
        description="Anthropic Sonnet 4.6 — default",
    ),
    "claude-haiku-4-5": ModelConfig(
        model_id="claude-haiku-4-5",
        adapter="anthropic-api",
        model_name="claude-haiku-4-5-20251001",
        max_tokens=1024,
        temperature=0.7,
        phi_alpha=0.7, psi_alpha=0.9, omega_alpha=0.95, synthesis_alpha=0.9,
        description="Anthropic Haiku 4.5 — fast and lightweight",
    ),
    "llama3.2": ModelConfig(
        model_id="llama3.2",
        adapter="local-ollama",
        model_name="llama3.2",
        max_tokens=2048,
        temperature=0.7,
        phi_alpha=0.7, psi_alpha=0.9, omega_alpha=0.95, synthesis_alpha=0.9,
        description="Llama 3.2 via local Ollama daemon",
    ),
    "zfae-v2": ModelConfig(
        model_id="zfae-v2",
        adapter="zfae",
        model_name=None,
        max_tokens=0,
        temperature=0.0,
        phi_alpha=0.7, psi_alpha=0.9, omega_alpha=0.95, synthesis_alpha=0.9,
        include_memory=False,  # ZFAE uses numeric memory proxies, not text injection
        description="ZFAE v2 — four independent 53-node PTCA field reservoirs",
    ),
    "local-echo": ModelConfig(
        model_id="local-echo",
        adapter="local-echo",
        model_name=None,
        max_tokens=0,
        temperature=0.0,
        include_memory=False,  # local-echo echoes input verbatim; no system prompt
        description="Local echo adapter — always available, baseline",
    ),
}


# ---------------------------------------------------------------------------
# ModelRegistry
# ---------------------------------------------------------------------------

class ModelRegistry:
    """Registry of LLM configurations.

    Wraps a dict of ModelConfig objects with CRUD operations and optional
    JSON persistence.  Modelled on aimmh's DEFAULT_REGISTRY pattern.

    Args:
        path:  Path to a JSON file for persistence.  If provided and the file
               exists, it is loaded on construction (merging over defaults).
        base:  Initial dict of ModelConfig objects.  Defaults to a copy of
               DEFAULT_REGISTRY.
    """

    def __init__(
        self,
        path: Optional[Path] = None,
        base: Optional[Dict[str, ModelConfig]] = None,
    ) -> None:
        self._path = path
        self._models: Dict[str, ModelConfig] = (
            deepcopy(base) if base is not None else deepcopy(DEFAULT_REGISTRY)
        )
        if path and path.exists():
            self.load()

    # ------------------------------------------------------------------
    # CRUD
    # ------------------------------------------------------------------

    def register(self, config: ModelConfig) -> None:
        """Register (or replace) a model config."""
        self._models[config.model_id] = config

    def get(self, model_id: str) -> ModelConfig:
        """Return config for model_id.  Raises KeyError if not found."""
        if model_id not in self._models:
            raise KeyError(
                f"Model '{model_id}' not in registry. "
                f"Known: {list(self._models.keys())}"
            )
        return self._models[model_id]

    def __contains__(self, model_id: str) -> bool:
        return model_id in self._models

    def update(self, model_id: str, **fields: Any) -> None:
        """Patch any fields of an existing config by keyword argument.

        Example::

            reg.update("claude-sonnet-4-6",
                       max_tokens=4096,
                       system_prompt="You are a PTCA router.")
        """
        cfg = self.get(model_id)
        self._models[model_id] = cfg.merge(fields)

    def remove(self, model_id: str) -> None:
        """Remove a model config from the registry."""
        if model_id not in self._models:
            raise KeyError(f"Model '{model_id}' not in registry.")
        del self._models[model_id]

    def list_all(self) -> List[ModelConfig]:
        """Return all registered configs."""
        return list(self._models.values())

    def get_defaults_for(self, developer: str) -> List[ModelConfig]:
        """Return all configs registered for a specific developer."""
        return [c for c in self._models.values() if c.developer == developer]

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------

    def save(self) -> None:
        """Write registry to JSON at self._path.  Raises if path is None."""
        if self._path is None:
            raise ValueError("No path configured for registry persistence.")
        self._path.parent.mkdir(parents=True, exist_ok=True)
        data = {
            "version": "2",
            "models": {k: v.to_dict() for k, v in self._models.items()},
        }
        self._path.write_text(json.dumps(data, indent=2), encoding="utf-8")

    def load(self) -> None:
        """Load (merge) registry from JSON at self._path."""
        if self._path is None or not self._path.exists():
            return
        data = json.loads(self._path.read_text(encoding="utf-8"))
        for d in data.get("models", {}).values():
            cfg = ModelConfig.from_dict(d)
            self._models[cfg.model_id] = cfg

    # ------------------------------------------------------------------
    # Class methods
    # ------------------------------------------------------------------

    @classmethod
    def defaults(cls) -> "ModelRegistry":
        """Return an in-memory registry pre-loaded with DEFAULT_REGISTRY."""
        return cls(path=None, base=deepcopy(DEFAULT_REGISTRY))

    @classmethod
    def from_file(cls, path: Path) -> "ModelRegistry":
        """Load a registry from a JSON file, merging over defaults."""
        return cls(path=path)


# ---------------------------------------------------------------------------
# make_complete_fn — aimmh-style callable factory
# ---------------------------------------------------------------------------

def make_complete_fn(
    registry: Optional[ModelRegistry] = None,
    context: Optional[Dict[str, Any]] = None,
) -> CompleteFn:
    """Return a (model_id, messages) → A0Response callable.

    Analogous to aimmh's ``make_call_fn(user, registry)`` pattern.

    Args:
        registry:  Registry to look up model configs.  Defaults to
                   ``ModelRegistry.defaults()``.
        context:   Per-instance overrides applied on top of the registry
                   entry on every call (system_prompt, max_tokens, etc.).

    Returns:
        CompleteFn: ``(model_id: str, messages: list[dict]) → A0Response``

    Example::

        from a0.model_registry import ModelRegistry, make_complete_fn

        reg = ModelRegistry.defaults()
        reg.update("claude-opus-4-6",
                   system_prompt="You are a PTCA training oracle.",
                   developer="alice")

        complete = make_complete_fn(
            registry=reg,
            context={"model_id": "claude-opus-4-6"},
        )
        response = complete("claude-opus-4-6", [{"role": "user", "content": "hello"}])
        print(response.result["text"])
    """
    resolved_registry = registry if registry is not None else ModelRegistry.defaults()

    def _complete(model_id: str, messages: List[Dict[str, Any]]) -> Any:
        from a0.cores.psi.tensors.contract import A0Request
        from a0.cores.psi.tensors.router import handle

        text = ""
        history: List[Dict[str, Any]] = []
        if messages:
            *history, last = messages
            text = last.get("content", "") if isinstance(last, dict) else str(last)

        call_context = {**(context or {}), "model_id": model_id}
        req = A0Request(
            task_id=str(uuid.uuid4()),
            input={"text": text, "files": []},
            history=history,
        )
        return handle(req, registry=resolved_registry, context=call_context)

    return _complete
