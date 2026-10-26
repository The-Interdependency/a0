#!/usr/bin/env bash
# a0 — terminal client for the a0p platform
# Usage:
#   a0                          interactive REPL (multi-turn)
#   a0 "your question"          one-shot
#   a0 --new "your question"    one-shot, force a fresh conversation
#   a0 -c <id> "your question"  resume an existing conversation by id
#
# Auth (required):
#   export A0_KEY="a0k_..."     CLI key from the Console → CLI Keys tab
#   export A0_HOST="https://your-app.replit.app"
set -euo pipefail

: "${A0_KEY:?A0_KEY is not set — generate one in the Console → CLI Keys tab}"

# Host resolution order:
# 1) explicit A0_HOST
# 2) Cloud Run URL variables (useful on Google Cloud shells)
# 3) fail with guidance
if [ -z "${A0_HOST:-}" ]; then
  if [ -n "${CLOUD_RUN_URL:-}" ]; then
    A0_HOST="$CLOUD_RUN_URL"
  elif [ -n "${SERVICE_URL:-}" ]; then
    A0_HOST="$SERVICE_URL"
  fi
fi
: "${A0_HOST:?A0_HOST is not set — e.g. https://your-app.example.com}"

# Termux-specific quality-of-life guidance.
if [ -n "${TERMUX_VERSION:-}" ]; then
  if ! command -v python3 >/dev/null 2>&1 && ! command -v node >/dev/null 2>&1; then
    echo "a0: Termux detected; install one of: pkg install python OR pkg install nodejs" >&2
    exit 1
  fi
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "a0: curl is required" >&2
  exit 1
fi
HAVE_JQ=0
if command -v jq >/dev/null 2>&1; then HAVE_JQ=1; fi

ENDPOINT="${A0_HOST%/}/api/v1/cli/chat"

# Minimal JSON string escaper (no jq dependency for the request body).
json_escape() {
  python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))' 2>/dev/null \
    || node -e 'process.stdout.write(JSON.stringify(require("fs").readFileSync(0,"utf8")))' 2>/dev/null \
    || awk 'BEGIN{ORS=""} {gsub(/\\/,"\\\\"); gsub(/"/,"\\\""); gsub(/\t/,"\\t"); gsub(/\r/,""); printf "%s\\n", $0} END{print ""}' \
       | sed -e 's/^/"/' -e 's/$/"/'
}

send() {
  local message="$1"
  local conv_id="${2:-}"
  local body
  if [ -n "$conv_id" ]; then
    body=$(printf '{"message":%s,"conversation_id":%s}' "$(printf '%s' "$message" | json_escape)" "$conv_id")
  else
    body=$(printf '{"message":%s}' "$(printf '%s' "$message" | json_escape)")
  fi
  curl -sS -X POST "$ENDPOINT" \
    -H "Authorization: Bearer $A0_KEY" \
    -H "Content-Type: application/json" \
    --data-binary "$body"
}

# Pretty-print {"reply": "...", "conversation_id": N, ...}
print_reply() {
  local raw="$1"
  if [ "$HAVE_JQ" = "1" ]; then
    local err reply cid
    err=$(printf '%s' "$raw" | jq -r '.detail // empty')
    if [ -n "$err" ]; then echo "a0: $err" >&2; return 1; fi
    reply=$(printf '%s' "$raw" | jq -r '.reply // empty')
    cid=$(printf '%s' "$raw" | jq -r '.conversation_id // empty')
    [ -n "$reply" ] && printf '%s\n' "$reply"
    [ -n "$cid" ]   && printf '%s' "$cid" >&3 2>/dev/null || true
  else
    # Fallback: dump raw JSON
    printf '%s\n' "$raw"
  fi
}

# ---- argv parsing ----
NEW_CONV=0
CONV_ID=""
ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --new) NEW_CONV=1; shift ;;
    -c|--conversation) CONV_ID="${2:-}"; shift 2 ;;
    -h|--help)
      sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) ARGS+=("$1"); shift ;;
  esac
done

# ---- one-shot ----
if [ ${#ARGS[@]} -gt 0 ]; then
  msg="${ARGS[*]}"
  cid="$CONV_ID"
  [ "$NEW_CONV" = "1" ] && cid=""
  raw=$(send "$msg" "$cid")
  exec 3>/dev/null
  print_reply "$raw"
  exit 0
fi

# ---- interactive REPL ----
echo "a0 — interactive (Ctrl+D or 'exit' to quit)"
CONV="$CONV_ID"
[ "$NEW_CONV" = "1" ] && CONV=""
while IFS= read -r -p "› " line; do
  [ -z "$line" ] && continue
  case "$line" in
    exit|quit|:q) break ;;
    /new) CONV=""; echo "(new conversation)"; continue ;;
    /id)  echo "conversation_id=${CONV:-<none>}"; continue ;;
  esac
  raw=$(send "$line" "$CONV")
  if [ "$HAVE_JQ" = "1" ]; then
    err=$(printf '%s' "$raw" | jq -r '.detail // empty')
    if [ -n "$err" ]; then echo "a0: $err" >&2; continue; fi
    reply=$(printf '%s' "$raw" | jq -r '.reply // empty')
    cid=$(printf '%s' "$raw" | jq -r '.conversation_id // empty')
    [ -n "$cid" ] && CONV="$cid"
    printf '%s\n' "$reply"
  else
    printf '%s\n' "$raw"
  fi
done
