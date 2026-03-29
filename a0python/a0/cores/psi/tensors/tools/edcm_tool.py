from __future__ import annotations

from typing import Any, Dict


def run_edcm(text: str) -> Dict[str, Any]:
    """Run EDCM (Energy-Dissonance Circuit Model) analysis on text.

    Falls back to stub if edcm-org is not installed.
    Install with: pip install -e edcm-org/   (from repo root)
    """
    try:
        from edcm_org import run_pipeline  # type: ignore[import]
        result = run_pipeline(text)
        return {"tool": "edcm", "status": "ok", "result": result}
    except ImportError:
        return {"tool": "edcm", "status": "stub", "input_chars": len(text),
                "note": "install edcm-org to enable: pip install -e edcm-org/"}
    except Exception as exc:
        return {"tool": "edcm", "status": "error", "error": str(exc), "input_chars": len(text)}
