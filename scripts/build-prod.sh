#!/bin/bash
# === MODULE_BUILD ===
# id: production_build_reproducibility
#   module_name: production_build
#   module_kind: hmmm
#   summary: Install committed dependency locks and compile the existing production application.
#   owner: a0 maintainers
#   public_surface: scripts/build-prod.sh
#   internal_surface: npm ci, uv sync, npm run build
#   auth_boundary: none
#   storage_boundary: write
#   network_boundary: external
#   user_data_boundary: none
#   admin_only: false
#   tests: tests/test_buil_prod_v0.0.0alpha.py
#   rollout: existing production build entrypoint
#   rollback: revert scripts/build-prod.sh and Dockerfile together
# === END MODULE_BUILD ===
# === CONTRACTS ===
# id: production_build_locked_dependencies
#   given: A production build is invoked from any working directory.
#   then: Install the repository's committed Node and Python locks without updating them, including Node build tools and excluding Python dev dependencies.
#   class: reproducibility
# id: production_build_fail_closed
#   given: A dependency installation or compilation command fails.
#   then: Return its nonzero status and do not run later build stages.
#   class: safety
# id: production_build_environment
#   given: A caller has development or Replit environment variables set.
#   then: Compile in production mode so development-only plugins remain disabled.
#   class: reproducibility
# === END CONTRACTS ===
set -euo pipefail

cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."

# ci refuses stale/missing package-lock.json; --include keeps build tools available
# even when NODE_ENV=production or npm's omit setting otherwise excludes them.
npm ci --include=dev
# --locked checks manifest freshness as well as refusing lockfile changes.
uv sync --locked --no-dev
NODE_ENV=production npm run build
