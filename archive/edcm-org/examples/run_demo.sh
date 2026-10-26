#!/usr/bin/env bash
# EDCM-Org Demo Runner
# Runs the CLI on the sample meeting transcript and ticket data.
#
# Usage: bash examples/run_demo.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
OUT_FILE="$REPO_ROOT/examples/demo_output.json"

echo "=== EDCM-Org Demo ==="
echo "Input: sample_meeting.txt + sample_tickets.csv"
echo ""

python -m edcm_org.cli \
  --org "SampleOrg-Engineering" \
  --meeting "$SCRIPT_DIR/sample_meeting.txt" \
  --tickets "$SCRIPT_DIR/sample_tickets.csv" \
  --out "$OUT_FILE" \
  --aggregation department \
  --window-id "q3-planning-001"

echo ""
echo "=== Output ==="
cat "$OUT_FILE"
