#!/bin/bash
set -e

# Generate a per-run internal API secret if one isn't already set in the env.
# Both Express and Python read INTERNAL_API_SECRET; sharing it via the parent
# shell keeps the two sibling processes in sync without any hardcoded default.
if [ -z "${INTERNAL_API_SECRET:-}" ]; then
  export INTERNAL_API_SECRET="dev-$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 32)"
  echo "[start-dev] generated ephemeral INTERNAL_API_SECRET for dev session"
fi

# Aggressively clear ports before starting — deployment leaves stale processes
for _p in 5000 5001 5002 8001; do
  fuser -k ${_p}/tcp 2>/dev/null || true
done

# Wait for OS to fully release sockets
sleep 2

# Verify key ports are free before starting (retry up to 5s each)
for _p in 5001 8001; do
  for _i in 1 2 3 4 5; do
    if ! fuser ${_p}/tcp 2>/dev/null; then
      break
    fi
    echo "Port ${_p} still in use, waiting..."
    fuser -k ${_p}/tcp 2>/dev/null || true
    sleep 1
  done
done

uvicorn python.main:app --host 0.0.0.0 --port 8001 --reload &
UVICORN_PID=$!

npx vite --host 0.0.0.0 --port 5001 --strictPort &
VITE_PID=$!

npx tsx server/index.ts &
EXPRESS_PID=$!

trap "kill $UVICORN_PID $VITE_PID $EXPRESS_PID 2>/dev/null" EXIT INT TERM

wait $UVICORN_PID $VITE_PID $EXPRESS_PID
