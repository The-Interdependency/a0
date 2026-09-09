# 21:1 0:0 0:0
"""a0 package and stable exports for versioned PCEA service modules."""

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
import sys


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


provider_registry = _load_versioned_module(
    "provider_registry", "prov_regi_v0.0.0alpha.py"
)
load_provider_registry = provider_registry.load_provider_registry
resolve_openai_compatible_provider = provider_registry.resolve_openai_compatible_provider

__all__ = ["load_provider_registry", "resolve_openai_compatible_provider"]
# 21:1 0:0 0:0
