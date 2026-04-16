#!/bin/bash
set -e
npm install
pip install -e . --quiet
npm run build
