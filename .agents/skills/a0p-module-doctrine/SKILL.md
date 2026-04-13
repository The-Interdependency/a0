---
name: a0p-module-doctrine
description: Authoritative conventions for building Python route modules, TypeScript components, and hot-swap modules in the a0p codebase. Covers file annotation (N:M ratio), route naming (_api vs plain), # DOC block format, UI_META, DATA_SCHEMA, the four-place registration checklist, hot-swap module rules, and the 400-line code budget. Load this skill before creating or editing any Python route file, service, or TS component in the a0p project.
---

# a0p Module Doctrine

Every file in the a0p codebase follows these conventions. This is the single authoritative reference. Read all sections before creating or editing any route module, service, or component.

---

## 1. File Annotation — `# N:M` / `// N:M`

**First AND last line** of every `.py`, `.ts`, `.tsx` file must be an annotation comment:

```python
# 47:12      ← Python files
```
```typescript
// 47:12     ← TypeScript / TSX files
```

- **N** = non-blank, non-comment code lines
- **M** = comment lines, docstring lines, `/* */` block-comment lines, and `# DOC` lines

Run from the project root after any edit to re-stamp all files:
```bash
python scripts/annotate.py
```

This is idempotent — stale annotations are stripped and replaced. The ratio is parsed by `collect_doc_meta()` and displayed live in the DocsTab as a code:comment badge per module. Hot-swap modules deployed via WsModulesTab also have their annotation parsed immediately on swap.

---

## 2. Route File Naming Convention

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

## 3. `# DOC` Block (Required in every Python route file)

Place immediately after imports, before `UI_META`. All `# DOC` lines are comment lines (they count toward M, never N).

```python
# DOC module: my_module          ← slug; matches tab_id in UI_META
# DOC label: My Module           ← human label shown in DocsTab sidebar
# DOC description: One or two sentences. What this module does and why.
# DOC tier: free                 ← free | ws | pro | admin
# DOC endpoint: GET /api/v1/my/path | What this endpoint does
# DOC endpoint: POST /api/v1/my/path | What this endpoint does
# DOC notes: Optional constraint, rate limit, or caveat (repeatable)
```

Rules:
- `module`, `label`, `description`, `tier` appear **exactly once**
- `endpoint` lines repeat — one per endpoint — format is `METHOD path | description` (pipe is required)
- `notes` is optional and may repeat
- `module` slug must be unique across all route files

---

## 4. `UI_META` (route files that contribute a console tab)

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

## 5. `DATA_SCHEMA` (optional, documents endpoint shapes)

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

## 6. Registration Checklist for New Route Modules

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

## 7. Hot-Swap Modules (WsModulesTab)

Handler code for a user-deployed hot-swap module must:
- Define `router: APIRouter` at module level — the registry mounts this
- Include a `# DOC` block with all required fields (`module`, `label`, `description`, `tier`)
- Optionally define `UI_META` to add a console tab
- Respect the **400-line code budget** (N ≤ 400)
- **Do not hand-write** `# N:M` annotation in handler code — the engine stamps it on deploy

---

## 8. 400-Line Code Budget

**Hard rule project-wide:** no file may exceed 400 code lines (N in the annotation).

- Comment lines (M) are **unlimited and free** — use them liberally for `# DOC` blocks, docstrings, `# DOC notes`, and inline explanation
- `scripts/annotate.py` warns on violation but does not block; the human or agent must fix it
- Factor logic into `python/services/` when a route file approaches the limit

---

## 9. Annotation Script Reference

```bash
# Re-stamp all Python + TypeScript/TSX files in the project
python scripts/annotate.py

# Output: prints a line per file showing old → new annotation
# Files over 400 code lines get a WARNING: line
# Idempotent: safe to run multiple times
```

Run this after every editing session that touches more than one file. CI does not block on it, but DocsTab shows stale ratios if you skip it.
