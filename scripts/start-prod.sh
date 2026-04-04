#!/bin/bash
set -e

export NODE_ENV=production

uvicorn python.main:app --host 0.0.0.0 --port 8001 &
UVICORN_PID=$!

node dist/index.cjs &
EXPRESS_PID=$!

trap "kill $UVICORN_PID $EXPRESS_PID 2>/dev/null" EXIT INT TERM

wait $UVICORN_PID $EXPRESS_PID
