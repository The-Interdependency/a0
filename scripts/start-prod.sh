#!/usr/bin/env bash
set -Eeuo pipefail

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
