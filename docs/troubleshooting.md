# Troubleshooting

Common stumbling blocks when running a0 locally, with the recovery for each. Each entry is in symptom → likely cause → fix form. Add new entries to this file when a fresh stumble has a clean recovery.

## Wrong Node version

**Symptom.** `npm run check` or `npm run build` errors with `Unsupported engine`, `Unexpected token`, or TypeScript errors that disappear on a colleague's machine.

**Likely cause.** The repo's compiled output and dev tooling expect Node 20+. `package.json` pins `"@types/node": "20.19.27"` and `scripts/start-dev.sh` is a bash script that assumes a Node 20-compatible runtime.

**Fix.**

```bash
node --version          # expect v20.x
nvm install 20 && nvm use 20   # if you use nvm
```

Then re-run `npm install` so any optional binaries rebuild against the active runtime.

## Wrong Python version

**Symptom.** `uv sync` or `python scripts/annotate.py` fails with `requires-python` errors, or imports from `python/` modules raise `SyntaxError` against features that only exist in 3.12+.

**Likely cause.** `pyproject.toml` declares `requires-python = ">=3.12"`. Older Pythons cannot install the project.

**Fix.**

```bash
python3 --version       # expect 3.12 or newer
uv python install 3.12  # if you have uv
uv sync                 # re-run after the right interpreter is active
```

## Missing environment variables

**Symptom.** Express prints `[express] Auth + proxy server on port 5000` but every request to `/api/*` returns `503` from the proxy, or the Python sibling exits at startup with "INTERNAL_API_SECRET required".

**Likely cause.** The Express and Python siblings share a per-run `INTERNAL_API_SECRET`. `scripts/start-dev.sh` generates one automatically if it is unset, but starting the two processes by hand without exporting it leaves them with mismatched secrets and Express's proxy header gets rejected by FastAPI's validator.

**Fix.** Use the helper:

```bash
scripts/start-dev.sh
```

The script generates an ephemeral `INTERNAL_API_SECRET` and exports it to both children. If you really need to launch them separately, source the secret into the same shell before starting both processes:

```bash
export INTERNAL_API_SECRET="dev-$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 32)"
node dist/index.cjs & uvicorn ...
```

In production the platform additionally needs the variables enumerated in `CLAUDE.md` "Environment Variables" (`SESSION_SECRET`, `DATABASE_URL`, `XAI_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `ADMIN_USER_ID`). For real provider keys, follow the environment-secrets model documented in `DEPLOYMENT.md` -- store them in GCP Secret Manager and pull them into Cloud Run at deploy time. Do not paste secret values into source files or commit them to a `.env`. This file deliberately does not list any secret values.

## `npm install` fails

**Symptom.** `npm install` errors during a postinstall step, or hangs while resolving a peer-dep tree.

**Likely cause.** Either the wrong Node major (see above) or a previous install left a stale `node_modules/` and `package-lock.json` in inconsistent states.

**Fix.**

```bash
node --version          # confirm 20.x first
rm -rf node_modules package-lock.json
npm install
```

If a single package keeps failing its postinstall, run that step alone with the verbose flag:

```bash
npm install <package-name> --verbose
```

and share the failing block in a new issue.

## `uv sync` fails

**Symptom.** `uv sync` exits non-zero, often citing the `pcea` git source from `pyproject.toml`.

**Likely cause.** `pyproject.toml` resolves `pcea` from a sibling private repo via `[tool.uv.sources]`. If your `git` cannot reach `github.com/The-Interdependency/PCEA` (no SSH key, no PAT, or the repo is private to your account), `uv sync` cannot install the project.

**Fix.**

1. Confirm `git ls-remote https://github.com/The-Interdependency/PCEA.git` returns refs with your current credentials.
2. If you only need the JS/TS surface, you can run the Express side via `npm run build && npm start` without `uv sync`; the Python sibling will simply not start until access is granted.
3. If access is expected but not working, open an access issue with the output of `git ls-remote` and the `uv sync` error.

## Port already in use

**Symptom.** `scripts/start-dev.sh` complains that port 5000, 5001, 5002, or 8001 is in use, or starts but a sibling dies on bind.

**Likely cause.** A previous dev run left a child process behind, or another tool on your machine claims one of those ports.

**Fix.**

```bash
# scripts/start-dev.sh already does this for you, but you can run it by hand
for p in 5000 5001 5002 8001; do
  fuser -k ${p}/tcp 2>/dev/null || true
done
sleep 2
scripts/start-dev.sh
```

`fuser` is part of `psmisc` on Linux. On macOS, use `lsof -ti:5000 | xargs kill -9` (replace 5000 with the offending port). If a non-a0 tool always owns the port, override the front-end port via `PORT=5500 scripts/start-dev.sh`.

## Playwright fails to install browsers

**Symptom.** `npx playwright test` errors with `browserType.launch: Executable doesn't exist`.

**Likely cause.** Playwright is a dev dependency, but its browser binaries are downloaded separately on first use.

**Fix.**

```bash
npx playwright install chromium
```

Re-run the test after the binary lands. If you need other browsers (firefox, webkit), install them individually rather than `--with-deps` unless you know your distro is supported.

## Still stuck

Open an issue with: your OS and version, `node --version`, `python3 --version`, the exact command run, and the full error output. The maintainers can usually point you at a fix from there or fold a new entry into this doc.
