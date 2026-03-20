"""Test runner that pre-caches stdlib logging before pytest imports it.

Required because a0/logging.py would otherwise shadow stdlib logging
when the project root is on sys.path.
"""
import sys
import importlib.util

# Pre-cache stdlib logging so pytest can find LogRecord correctly
_spec = importlib.util.spec_from_file_location(
    "logging", "/usr/lib/python3.11/logging/__init__.py"
)
_mod = importlib.util.module_from_spec(_spec)
sys.modules["logging"] = _mod
_spec.loader.exec_module(_mod)

# Also pre-cache submodules pytest uses
import importlib
for _sub in ("logging.handlers", "logging.config"):
    importlib.import_module(_sub)

import pytest
sys.exit(pytest.main(sys.argv[1:]))
