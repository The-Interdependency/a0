#!/bin/bash
set -e

echo "==> Removing stale git lock if present..."
rm -f .git/index.lock

echo "==> Staging CI/CD files..."
git add Dockerfile .github/ cloudbuild.yaml DEPLOYMENT.md

echo "==> Committing..."
git commit -m "Add Dockerfile, GitHub Actions, Cloud Build, and deployment guide"

echo "==> Setting up GitHub remote..."
git remote remove origin 2>/dev/null || true
git remote add origin "https://${GITHUB_PAT}@github.com/The-Interdependency/a0.git"

echo "==> Force-pushing to GitHub..."
git push --force origin main

echo ""
echo "Done! Check: https://github.com/The-Interdependency/a0"
