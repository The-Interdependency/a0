#!/bin/bash
set -e

# Kill any stale processes on our ports
fuser -k 5000/tcp 2>/dev/null || true
fuser -k 5001/tcp 2>/dev/null || true
fuser -k 5002/tcp 2>/dev/null || true
fuser -k 8001/tcp 2>/dev/null || true

# Wait for ports to fully release
sleep 1

uvicorn python.main:app --host 0.0.0.0 --port 8001 --reload &
UVICORN_PID=$!

npx vite --host 0.0.0.0 --port 5001 --strictPort &
VITE_PID=$!

npx tsx server/index.ts &
EXPRESS_PID=$!

trap "kill $UVICORN_PID $VITE_PID $EXPRESS_PID 2>/dev/null" EXIT INT TERM

wait $UVICORN_PID $VITE_PID $EXPRESS_PID
