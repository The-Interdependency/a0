# 27:0 0:0 0:3
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
import sys

from .claude_agent_adapter import ClaudeAgentAdapter
from .subagents import ALL_SUBAGENTS, MODE_SUBAGENTS


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


openai_compatible_adapter = _load_versioned_module(
    "openai_compatible_adapter", "open_comp_adap_v0.0.0alpha.py"
)
OpenAICompatibleAdapter = openai_compatible_adapter.OpenAICompatibleAdapter

__all__ = [
    "ClaudeAgentAdapter",
    "OpenAICompatibleAdapter",
    "ALL_SUBAGENTS",
    "MODE_SUBAGENTS",
]
# 27:0 0:0 0:3
