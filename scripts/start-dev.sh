#!/bin/bash
set -e

uvicorn python.main:app --host 0.0.0.0 --port 8000 --reload &
UVICORN_PID=$!

npx vite --host 0.0.0.0 --port 5000 &
VITE_PID=$!

trap "kill $UVICORN_PID $VITE_PID 2>/dev/null" EXIT INT TERM

wait $UVICORN_PID $VITE_PID
