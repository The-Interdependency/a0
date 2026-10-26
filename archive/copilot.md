# copilot.md — GitHub Copilot workspace instructions

This file provides guidance to GitHub Copilot when working with code in this repository.

## What this codebase is

**a0p** is a research instrument — a public-facing autonomous AI agent platform. It is not a standard CRUD app. The codebase is deliberately unusual in places: the frontend has zero hardcoded tabs (all driven by Python metadata), the cognitive engine runs a 53-node ring topology, and LLMs are treated as "energy providers" rather than the agent itself.

## Process topology

```
Browser → Express (:5000) → [proxy /api/*] → Python/FastAPI (:8001, internal only)
                           ↘ Vite dev server (:5001)
```

- **Express** (`server/`) — Auth, sessions, guest-chat rate limiting, static serving. Injects `x-a0p-internal`, `x-user-id`, `x-user-email`, `x-user-role` on every proxied request.
- **Python/FastAPI** (`python/`) — All AI orchestration, agent lifecycle, billing, heartbeat. Validates `x-a0p-internal` on every request. Never expose port 8001 directly.
- **Vite** — Dev only; proxied through Express.

## Hard rules (enforce these)

- **No file over 400 lines.** Split before adding.
- **No stubs or TODOs in production code.**
- **All `/api/*` calls go through Express on :5000** — never call Python :8001 from the frontend.
- **SQL UPDATE column names must use an explicit allowlist** — no user-controlled column construction.
- **Every new Python route file requires 4 edits to `python/routes/__init__.py`**: router import, `ALL_ROUTERS`, `collect_doc_meta()` file list, `collect_ui_meta()` module list.

## File annotation

Every `.py`, `.ts`, `.tsx` file opens and closes with a ratio comment:
```python
# N:M   ← top of file (N = code lines, M = comment lines)
...
# N:M   ← bottom of file
```
Run `python scripts/annotate.py` after edits to re-stamp.

## Python route module pattern

```python
# DOC module: my_module
# DOC label: My Module
# DOC description: What this does
# DOC tier: admin
# DOC endpoint: /api/v1/my-module

UI_META = { "tab_id": "my_module", ... }
DATA_SCHEMA = { "sections": [...] }

router = APIRouter()

@router.get("/my-module")
async def get_data(request: Request):
    ...
```

## Frontend tab pattern

The console is metadata-driven. To add a custom tab renderer:
1. Add tab to a Python route's `UI_META`
2. Create `client/src/components/MyTab.tsx`
3. Add to `CUSTOM_TAB_RENDERERS` in `client/src/pages/console.tsx`
4. Run `node scripts/check-console-tabs.mjs` to verify

Tabs without a custom renderer and without `DATA_SCHEMA` sections will fail CI.

## Auth pattern

```typescript
// Frontend: Express injects these headers automatically
// Backend Python: read from request.headers
uid = request.headers.get("x-user-id")
role = request.headers.get("x-user-role", "")
```

Admin check: `role == "admin"` or `await storage.is_admin_email(email)`.

## Key files

| File | Purpose |
|------|---------|
| `replit.md` | Platform overview and user preferences |
| `docs/ARCHITECTURE.md` | Full architecture detail |
| `CLAUDE.md` | Claude Code guidance (commands, conventions) |
| `python/routes/__init__.py` | Route registration — edit when adding routes |
| `client/src/pages/console.tsx` | `CUSTOM_TAB_RENDERERS` map |
| `.agents/skills/a0p-module-doctrine/SKILL.md` | Authoritative module conventions |
| `python/tests/contracts/route_gating.py` | Write-endpoint gating contract |
| `.github/workflows/deploy.yml` | CI pipeline |

## What NOT to do

- Do not add hardcoded tabs to the frontend — add `UI_META` to the Python route instead
- Do not call the Python backend directly from the browser — always go through Express
- Do not add a write endpoint without an admin or ownership check
- Do not use `width`/`height`/`top`/`left` in animations — use `transform` and `opacity`
- Do not remove focus rings — replace them with a visible alternative

## Running locally

```bash
# All three processes
bash scripts/start-dev.sh

# Type check
npm run check

# Push DB schema
npm run db:push

# Re-stamp file annotations
python scripts/annotate.py

# Console-tab regression guard
node scripts/check-console-tabs.mjs

# Gating contract (no server required)
python -m pytest python/tests/contracts/ -v
```
