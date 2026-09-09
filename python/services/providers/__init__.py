# 20:18 0:0 0:1
"""providers — one module per upstream LLM API.

Each provider module exposes:

    async def call(
        messages: list[dict],
        *,
        role: str = "conduct",
        model_override: str | None = None,
        max_tokens: int = 4096,
        use_tools: bool = True,
        reasoning_effort: str | None = None,
        **kwargs,
    ) -> tuple[str, dict]

`role` selects the model via the registry-defined environment override, then
the provider spec primary (see _resolver.resolve_model_for_role). The
`model_override` escape hatch is for legacy callers in inference.py that
already know the model id and just want SDK delivery; new callers should
pass `role` instead and let the resolver pick.
"""
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
import sys

from ._resolver import resolve_model_for_role


def _load_versioned_module(public_name: str, filename: str):
    qualified_name = f"{__name__}.{public_name}"
    existing = sys.modules.get(qualified_name)
    if existing is not None:
        return existing
    spec = spec_from_file_location(qualified_name, Path(__file__).with_name(filename))
    if spec is None or spec.loader is None:
        raise ImportError(f"cannot load {qualified_name} from {filename}")
    module = module_from_spec(spec)
    sys.modules[qualified_name] = module
    spec.loader.exec_module(module)
    return module


openai_compatible_provider = _load_versioned_module(
    "openai_compatible_provider", "open_comp_prov_v0.0.0alpha.py"
)

__all__ = ["openai_compatible_provider", "resolve_model_for_role"]
# 20:18 0:0 0:1
