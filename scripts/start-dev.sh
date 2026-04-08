#!/bin/bash
set -e

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
