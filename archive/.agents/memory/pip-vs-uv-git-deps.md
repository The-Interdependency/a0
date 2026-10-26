---
name: pip ignores uv sources in prod build
description: Why git-sourced Python deps must be PEP 508 direct references, not tool.uv.sources, when the prod build uses pip
---

The production build (`scripts/build-prod.sh`) installs Python deps with `pip install -e .`.

**Rule:** Any dependency that must come from a git repo (especially to override a PyPI name collision) must be declared as a PEP 508 direct reference inside `[project.dependencies]`:

    "pkg @ git+https://github.com/Owner/Repo.git@main"

Do **not** rely on `[tool.uv.sources]` for these. `pip` ignores `[tool.uv.sources]` entirely; only `uv` honors it. The dev/local env may look fine (uv resolves correctly) while the pip-based deploy silently resolves a different package from PyPI.

**Why:** `interdependent-lib` and `pcea` both have unrelated namesakes on PyPI (a different fork / a "compound event analysis" package). The real ones live under github.com/The-Interdependency. A `[tool.uv.sources]`-only fix passed locally but the deploy's `pip install -e .` pulled the wrong PyPI packages, so the runtime readiness gate failed and the backend crash-looped.

**How to apply:** When adding a git-sourced Python dep, put the `@ git+https://...@<ref>` form directly in `[project.dependencies]` and remove any redundant `[tool.uv.sources]` entry to avoid uv conflicts. The repos must be public (or the build needs credentials) — verify with `git ls-remote <url> HEAD`. Note `@main` pulls latest HEAD at build time, not the uv.lock pin, so the lock and pip can diverge.
