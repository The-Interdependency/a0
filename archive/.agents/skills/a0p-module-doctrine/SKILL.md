---
name: a0p-module-doctrine
description: Authoritative conventions for building Python route modules, TypeScript components, and hot-swap modules in the a0p codebase. Covers file annotation (N:M C:D I:O three-metric format), module role metadata, route naming (_api vs plain), # DOC block format, UI_META, DATA_SCHEMA, the four-place registration checklist, hot-swap module rules, and the 400-line code budget. Load this skill before creating or editing any Python route file, service, or TS component in the a0p project.
---

# a0p Module Doctrine

Every file in the a0p codebase follows these conventions. This is the single authoritative reference. Read all sections before creating or editing any route module, service, or component.

---

## 1. File Annotation — `# N:M C:D I:O` / `// N:M C:D I:O`

**First AND last line** of every `.py`, `.ts`, `.tsx` file must be an annotation comment carrying three metric pairs:

```python
# 619:179 8:12 1:18      ← Python files
```
```typescript
// 461:62 3:5 2:8        ← TypeScript / TSX files
```

### The three metrics

| Pair | Name | Measures |
|------|------|----------|
| `N:M` | code : comment | Internal density — how well the file explains itself |
| `C:D` | consumed : declared | Surface utility — how much of what it declares is actually used |
| `I:O` | fan-in : fan-out | Graph position — how many files depend on it vs how many it depends on |

**N** = non-blank, non-comment code lines (budget: ≤ 400)
**M** = comment lines, docstring lines, `/* */` blocks, and `# DOC` lines
**D** = declared `# DOC endpoint:` lines (`.py`); exported symbols (`.ts/.tsx`)
**C** = declared items consumed in `client/src/` or `server/`
**I** = other project files that import this file (fan-in)
**O** = project-internal modules this file imports (fan-out)

### Triage, not verdict

These ratios are attention-routing signals, not automatic diagnoses. Interpret them by module role.

| Signal | What to inspect |
|--------|-----------------|
| Dense N:M imbalance | Opaque growth; missing explanatory surface |
| Low C:D | Dead or unintegrated declared surface |
| Low I:O under high fan-out | Fragile glue/orchestrator pressure |

A file scoring poorly on all three is the true refactor target — not merely the longest file.

### Running the annotator

```bash
# Re-stamp all files and recompute all three metrics (full cross-reference scan)
python scripts/annotate.py

# Re-stamp specific files — recomputes N:M, preserves existing C:D and I:O
python scripts/annotate.py python/routes/chat.py client/src/pages/chat.tsx
```

Full-scan output shows all three pairs: `[619:179 8:12 1:18]`
Single-file output shows N:M only: `[619:179]` (C:D and I:O preserved from existing annotation)

This is idempotent. The ratio is parsed by `collect_doc_meta()` and displayed in the DocsTab. Hot-swap modules have their annotation stamped on deploy.

---

## 2. Module Role Metadata

Every Python route file must declare a role in its `# DOC` block:

```python
# DOC role: route
```

TypeScript / TSX files should declare role in a top-of-file comment immediately after the first annotation when practical:

```typescript
// DOC role: component
```

Role metadata is not another ratio. It tells humans and agents how to interpret `N:M C:D I:O`.

### Allowed roles

| Role | Use for | Metric interpretation |
|------|---------|----------------------|
| `route` | FastAPI route file whose main job is endpoint exposure | C:D should be high; O should stay moderate unless thinly delegating |
| `api` | Thin API delegate to a service/engine | High endpoint declaration is fine; business logic should remain low |
| `service` | Business logic or reusable backend capability | Higher I is expected; comments/contracts should guard stable behavior |
| `engine` | Core cognitive/runtime engine | High I is load-bearing; high O requires explicit contracts |
| `orchestrator` | Coordinates multiple services/routes/providers | High O is expected but must be heavily documented |
| `schema` | Pydantic/type/schema definitions | High I and low runtime logic are normal |
| `component` | React/TSX UI component | C:D maps to exported/consumed surface; comment density may be lower if JSX is clear |
| `page` | Route-level UI page | Higher O is normal; should remain readable and bounded |
| `test` | Unit, contract, or e2e test | Low I is normal; D may be low; clarity matters more than reuse |
| `contract` | Executable invariant / gating contract | Comment-rich files are healthy; N:M may invert without pathology |
| `doctrine` | Human/agent operational rule file | Comment-rich by design; not judged by code density |
| `config` | Configuration / constants / registry tables | High C:D expected; hidden coupling should be documented |
| `script` | CLI/dev/maintenance script | Low I can be normal; require clear usage comments |
| `adapter` | Boundary layer to external provider/API/storage | O may be high; must document external dependency and failure mode |
| `hot_swap` | User-deployed runtime module | Must remain small, documented, gated, and annotation-stamped on deploy |

If none fits, use `role: module` temporarily and add a `# DOC notes:` line explaining why. Do not invent new roles casually; update this doctrine first.

---

## 3. Route File Naming Convention

Two patterns exist; choose based on whether a separate service/engine handles the logic:

### `python/routes/{name}.py` — self-contained handler
The route file IS the implementation. All business logic, Pydantic models, and storage calls live here. No separate service file.

**Examples:** `chat.py`, `agents.py`, `memory.py`, `tools.py`, `billing.py`, `contexts.py`, `docs.py`

### `python/routes/{name}_api.py` — thin API-layer delegate
The file exists solely to expose HTTP endpoints for a core engine or service that lives in `python/{name}.py` or `python/services/{name}.py`. The `_api` file contains **no business logic** beyond request parsing and response shaping.

**Examples:**
| File | Delegates to |
|------|-------------|
| `pcna_api.py` | `python/pcna.py` (PCNAEngine) |
| `zfae_api.py` | `python/agents/zfae.py` (ZetaEngine) |
| `heartbeat_api.py` | `python/services/heartbeat.py` |
| `openai_api.py` | `python/logger.py` + `python/services/openai_router.py` |
| `sigma_api.py` | `python/services/sigma.py` |

**Decision rule:** Does a separate service/engine class already own the logic? → `_api.py`. Is this file the implementation? → no suffix.

---

## 4. `# DOC` Block (Required in every Python route file)

Place immediately after imports, before `UI_META`. All `# DOC` lines are comment lines (they count toward M, never N).

```python
# DOC module: my_module          ← slug; matches tab_id in UI_META
# DOC label: My Module           ← human label shown in DocsTab sidebar
# DOC description: One or two sentences. What this module does and why.
# DOC tier: free                 ← free | ws | pro | admin
# DOC role: route                ← route | api | service | engine | orchestrator | schema | component | page | test | contract | doctrine | config | script | adapter | hot_swap | module
# DOC endpoint: GET /api/v1/my/path | What this endpoint does
# DOC endpoint: POST /api/v1/my/path | What this endpoint does
# DOC notes: Optional constraint, rate limit, or caveat (repeatable)
```

Rules:
- `module`, `label`, `description`, `tier`, `role` appear **exactly once**
- `endpoint` lines repeat — one per endpoint — format is `METHOD path | description` (pipe is required)
- `notes` is optional and may repeat
- `module` slug must be unique across all route files
- `role` must come from the allowed role list unless this doctrine is updated first

---

## 5. `UI_META` (route files that contribute a console tab)

```python
UI_META = {
    "tab_id": "my_module",          # must match DOC module slug
    "label": "My Module",
    "icon": "LucideIconName",       # any icon name from lucide-react
    "order": 10,                    # tab position; gaps of 1 are fine
    "tier_gate": "ws",              # optional — hides tab for lower tiers
    "sections": [
        {
            "id": "section_id",
            "label": "Section Label",
            "endpoint": "/api/v1/my/data",
            "fields": [
                {
                    "key": "field_key",
                    "type": "text",   # text | gauge | badge | list | timeline | sparkline | json
                    "label": "Field Label"
                }
            ]
        }
    ]
}
```

- `UI_META` is **optional** for route files that have no console tab (pure CRUD)
- `collect_ui_meta()` in `python/routes/__init__.py` reads `UI_META` from each registered module; tabs auto-appear in the console
- `tier_gate` hides the tab client-side; server-side tier enforcement is separate

---

## 6. `DATA_SCHEMA` (optional, documents endpoint shapes)

```python
DATA_SCHEMA = {
    "endpoints": [
        {"method": "GET", "path": "/api/v1/my/path"},
        {"method": "POST", "path": "/api/v1/my/path"},
    ]
}
```

Not required, but include it when the module has non-tab endpoints that should be machine-readable.

---

## 7. Registration Checklist for New Route Modules

Every new `python/routes/{name}.py` must be added to **four places** in `python/routes/__init__.py`:

```python
# 1. Import
from .my_module import router as my_module_router

# 2. ALL_ROUTERS list
ALL_ROUTERS = [
    ...
    my_module_router,
]

# 3. collect_doc_meta() file list
route_files = [
    ...
    "my_module.py",
]

# 4. collect_ui_meta() module list
modules = [
    ...
    "python.routes.my_module",
]
```

If any of these four is missing: routes will not mount, the Docs tab will not list the module, or the tab will not appear in the console.

Also register editable fields if the module has mutable fields WSEM should expose:
```python
from ..services.editable_registry import editable_registry, EditableField
editable_registry.register(EditableField(
    key="unique_key",
    label="Human Label",
    description="What this field controls.",
    control_type="text",  # text | select | textarea | toggle
    module="my_module",
    get_endpoint="/api/v1/my/path",
    patch_endpoint="/api/v1/my/patch-path",
    query_key="/api/v1/my/path",
))
```

---

## 8. Hot-Swap Modules (WsModulesTab)

Handler code for a user-deployed hot-swap module must:
- Define `router: APIRouter` at module level — the registry mounts this
- Include a `# DOC` block with all required fields (`module`, `label`, `description`, `tier`, `role`)
- Use `# DOC role: hot_swap` unless a stricter role is justified in notes
- Optionally define `UI_META` to add a console tab
- Respect the **400-line code budget** (N ≤ 400)
- **Do not hand-write** `# N:M` annotation in handler code — the engine stamps it on deploy

---

## 9. 400-Line Code Budget

**Hard rule project-wide:** no file may exceed 400 code lines (N in the annotation).

- Comment lines (M) are **unlimited and free** — use them liberally for `# DOC` blocks, docstrings, `# DOC notes`, and inline explanation
- `scripts/annotate.py` warns on violation but does not block; the human or agent must fix it
- Factor logic into `python/services/` when a route file approaches the limit

---

## 10. File Naming — PCEA Doctrine (new files only)

All **new** files created in the a0p codebase must follow the PCEA four-letter-set naming convention. See `.agents/skills/a0p-pcea-naming/SKILL.md` for the full specification.

Quick summary:
- Filename = `{4chr}_{4chr}_{4chr}_v{major}.{minor}.{patch}{word}.{ext}`
- Every chunk is exactly 4 lowercase letters, abbreviating the file's conceptual role
- New files always start at `v0.0.0alpha` until the word-encoding scheme is published
- Existing files are **never renamed** as a side effect of an unrelated edit

---

## 11. Consumer-Dependency Declaration (optional, best-practice)

Import statements already declare symbol dependencies — don't duplicate them. Use `# CONSUMES` only for runtime dependencies that don't appear in imports:

- **HTTP endpoints** called via `fetch`, `httpx`, or similar
- **Environment variables** read via `os.getenv` / `import.meta.env`
- **Config or data files** opened at runtime

```python
def my_function():
    # CONSUMES /api/v1/conversations
    # CONSUMES XAI_API_KEY
    ...
```

Rules:
- Place `# CONSUMES` lines inside the function or class body, at the top or immediately before the consuming call
- One `# CONSUMES` line per dependency
- URL path form for HTTP: `# CONSUMES /api/v1/models`
- Env var name for secrets/config: `# CONSUMES STRIPE_SECRET_KEY`
- Repo-relative path for files: `# CONSUMES python/config/providers.json`
- These are comment lines (count toward M, never N) — no runtime effect

---

## 12. Annotation Script Reference

```bash
# Re-stamp all Python + TypeScript/TSX files in the project
python scripts/annotate.py

# Output: prints a line per file showing old → new annotation
# Files over 400 code lines get a WARNING: line
# Idempotent: safe to run multiple times
```

Run this after every editing session that touches more than one file. CI does not block on it, but DocsTab shows stale ratios if you skip it.
