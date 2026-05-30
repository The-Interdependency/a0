---
name: interdependent-core boot readiness gate
description: What the a0 startup readiness check requires and how its failure manifests in deploy
---

`python/main.py`'s FastAPI lifespan calls `require_interdependent_core_ready()` (in `python/services/interdependent_bootstrap.py`).

**The gate passes ("ready") only if** one of the modules `interdependent_core` or `interdependent_lib` is importable. Installed-but-unimportable yields `module_unimportable`; metadata-only yields `metadata_only`; neither passes — `require_*` raises `RuntimeError`.

**Failure signature in deploy:** the RuntimeError propagates out of the lifespan, uvicorn keeps restarting the worker ("Started server process … Waiting for application startup … Traceback …" repeating), Python never finishes startup, Express never opens port 5000, and the deploy fails with "a port configuration was specified but the required port was never opened, expected port 5000".

**Why it matters:** the symptom ("port 5000 never opened") points at Express/ports, but the real cause is a Python dependency that didn't install/import. Always trace the lifespan traceback to the actual missing module before touching port/Express config.

**How to apply:** to satisfy the gate you only need `interdependent_lib` importable (only one candidate must import). Ensure it installs from the correct git repo in the prod build — see pip-vs-uv-git-deps.md.
