#!/bin/bash
set -e
npm install
pip install -e . --quiet
npm run db:push
python scripts/annotate.py
