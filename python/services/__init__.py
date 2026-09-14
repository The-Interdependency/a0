# 22:0 0:0 0:0
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


approval_gate_service = _load_versioned_module(
    "approval_gate_service", "appr_gate_serv_v0.0.0alpha.py"
)
public_access_policy = _load_versioned_module(
    "public_access_policy", "publ_acce_poli_v0.0.0alpha.py"
)

__all__ = ["approval_gate_service", "public_access_policy"]
# 22:0 0:0 0:0
