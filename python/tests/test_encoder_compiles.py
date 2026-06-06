"""Regression tests for python/engine/ucns_kit/encoder.py compilation."""
from __future__ import annotations

import py_compile
from pathlib import Path


ENCODER_PATH = (
    Path(__file__).resolve().parents[1] / "engine" / "ucns_kit" / "encoder.py"
)


def test_encoder_py_compile_succeeds(tmp_path: Path) -> None:
    """encoder.py compiles without requiring edcmbone imports to resolve."""
    py_compile.compile(
        str(ENCODER_PATH),
        cfile=str(tmp_path / "encoder.pyc"),
        doraise=True,
    )


def test_entry_to_ucns_has_single_return_call() -> None:
    """The duplicate UCNSObject return line stays removed."""
    text = ENCODER_PATH.read_text(encoding="utf-8")
    entry_to_ucns = text[text.index("def _entry_to_ucns") :]

    assert entry_to_ucns.count("return UCNSObject(") == 1
