#!/usr/bin/env bash
# === CONTRACTS ===
# id: production_launcher_environment
#   given: The production launcher is called from outside the repository with an unactivated Python environment.
#   then: Express starts in the repository root with executable local .venv/bin/uvicorn ahead of global tools; an unavailable local runtime is rejected.
#   class: reproducibility
# id: production_launcher_single_owner
#   given: A production deployment starts through the launcher.
#   then: Replace the launcher with Express and preserve its exit status without starting a second Python process.
#   class: safety
# === END CONTRACTS ===
set -Eeuo pipefail

cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
# uv sync installs the production Python dependencies here. Express inherits
# this PATH when it starts its sole Uvicorn child.
if [[ ! -x "$PWD/.venv/bin/uvicorn" ]]; then
  printf '%s\n' '[start-prod] Missing executable .venv/bin/uvicorn. Run scripts/build-prod.sh to install the locked production dependencies.' >&2
  exit 1
fi
export PATH="$PWD/.venv/bin:$PATH"
export NODE_ENV=production

# Production process ownership is singular:
#
#   Replit -> Express -> Uvicorn child
#
# server/index.ts owns, monitors, and terminates the Python child. Starting a
# second Uvicorn process here races for port 8001 and produces a restart loop.
# `exec` keeps Express as the deployment process so Replit signals reach it
# directly.
exec node dist/index.cjs
