#!/usr/bin/env bash
# Launch the a0 web UI (primary) or CLI (emergency fallback).
#
# Usage:
#   ./run.sh           — start Gradio web app at A0_HOST:A0_PORT
#   ./run.sh --cli     — emergency CLI mode (Textual TUI)
#
set -euo pipefail
cd "$(dirname "$0")"

if [[ "${1:-}" == "--cli" ]]; then
    echo "[a0] CLI mode (emergency fallback)"
    python -m a0.guardian.ui.app
else
    echo "[a0] web UI → http://$(python -c 'from a0.cores.psi.tensors.env import A0_HOST, A0_PORT; h=A0_HOST if A0_HOST!="0.0.0.0" else "localhost"; print(f"{h}:{A0_PORT}")')"
    python -m a0.guardian.ui.web.app "$@"
fi
