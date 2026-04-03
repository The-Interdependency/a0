#!/bin/bash
set -e

uvicorn python.main:app --host 0.0.0.0 --port 8001 --reload &
UVICORN_PID=$!

npx vite --host 0.0.0.0 --port 5001 &
VITE_PID=$!

npx tsx server/index.ts &
EXPRESS_PID=$!

trap "kill $UVICORN_PID $VITE_PID $EXPRESS_PID 2>/dev/null" EXIT INT TERM

wait $UVICORN_PID $VITE_PID $EXPRESS_PID
