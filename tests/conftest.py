# 7:4
# DOC module: tests
# DOC label: Test fixtures
# DOC description: Shared pytest fixtures and path setup so test modules can
# import from `python.*` without packaging the project.
import os
import sys
import pathlib

_ROOT = pathlib.Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

os.environ.setdefault("INTERNAL_API_SECRET", "test-secret")
# 7:4
