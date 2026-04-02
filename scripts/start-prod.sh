#!/bin/bash
set -e

export NODE_ENV=production
uvicorn python.main:app --host 0.0.0.0 --port 5000
