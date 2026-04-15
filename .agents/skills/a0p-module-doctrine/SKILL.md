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

## 5. Registration Checklist for New Route Modules

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

## 6. Hot-Swap Modules (WsModulesTab)

Handler code for a user-deployed hot-swap module must:
- Define `router: APIRouter` at module level — the registry mounts this
- Include a `# DOC` block with all required fields (`module`, `label`, `description`, `tier`)
- Optionally define `UI_META` to add a console tab
- Respect the **400-line code budget** (N ≤ 400)
- **Do not hand-write** `# N:M` annotation in handler code — the engine stamps it on deploy

---

## 7. 400-Line Code Budget

**Hard rule project-wide:** no file may exceed 400 code lines (N in the annotation).

- Comment lines (M) are **unlimited and free** — use them liberally for `# DOC` blocks, docstrings, `# DOC notes`, and inline explanation
- `scripts/annotate.py` warns on violation but does not block; the human or agent must fix it
- Factor logic into `python/services/` when a route file approaches the limit

---

## 8. Annotation Script Reference

```bash
# Re-stamp all Python + TypeScript/TSX files in the project
python scripts/annotate.py

# Output: prints a line per file showing old → new annotation
# Files over 400 code lines get a WARNING: line
# Idempotent: safe to run multiple times
```

Run this after every editing session that touches more than one file. CI does not block on it, but DocsTab shows stale ratios if you skip it.

---

## 9. `DATA_SCHEMA` (optional, documents endpoint shapes)

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

## 10. Energy Provider Seeds

Every AI provider gets a `status=system` WS module in the `ws_modules` table, seeded once on boot via `_ensure_provider_seeds()` in `python/main.py`.

**Slug format:** `provider::{id}` — e.g. `provider::openai`, `provider::grok`, `provider::gemini`, `provider::claude`

**`route_config` shape** (all keys required on first seed):
```python
{
    "model_assignments": {  # role → model ID; never hardcoded
        "conduct": "gpt-4o",
        "perform": "gpt-4o",
        "practice": "gpt-4o-mini",
        "record": "gpt-4o-mini",
        "derive": "gpt-4o",
    },
    "available_models": [
        {"id": "gpt-4o", "context_window": 128000,
         "pricing": {"input_per_1m": 2.50, "output_per_1m": 10.00},
         "capabilities": ["reasoning", "vision", "function_calling"]},
    ],
    "capabilities": {"native_search": True, "function_calling": True, ...},
    "presets": {
        "speed": {...role→model map...},
        "depth": {...},
        "price": {...},
        "balance": {...},
        "creativity": {...},
    },
    "pricing_url": "https://openai.com/pricing",
    "context_addendum": "",
    "enabled_tools": [],
}
```

**Rules:**
- Seeds are created once (idempotent — skips if slug already exists)
- Admin edits to `route_config` (model_assignments, context_addendum, etc.) survive restarts
- Never delete a provider seed — set `status=inactive` if you want to hide it
- Use the energy API to mutate seeds: `PATCH /api/energy/providers/{id}/route_config`, `POST /api/energy/optimize/{id}`

**Energy API routes** (registered in `python/routes/energy.py`):
```
GET  /api/energy/providers                       → list all seeds with PCNA stats
GET  /api/energy/providers/{id}                  → single seed
PATCH /api/energy/providers/{id}/route_config    → partial update (model_assignments merged, not replaced)
POST /api/energy/optimize/{id}                   → apply named preset to model_assignments
POST /api/energy/discover/{id}                   → return available_models + last_checked timestamp
POST /api/energy/converge/{id}                   → blend provider PCNA core into main (80% main / 20% provider)
```

---

## 11. Configurable Model IDs + Task Roles

**Never hardcode model ID strings.** Use the three-level resolution chain:
1. Environment variable (highest priority): `XAI_MODEL_CONDUCT`, `GEMINI_MODEL_PRACTICE`, etc.
2. DB seed `route_config.model_assignments[role]` (per-provider, admin-editable)
3. Fallback default in `_PROVIDER_MODEL_DEFAULTS` (lowest priority, code-only)

Call `_resolve_provider_model(provider_id, role)` from `python/services/inference.py` to get the resolved model ID.

**The five task roles** (do not use the old names):
| New name | Old name | Purpose |
|----------|----------|---------|
| `conduct` | root_orchestrator | Primary orchestration, top-level routing |
| `perform` | high_risk_gate | High-risk or approval-gated tasks |
| `practice` | worker | Standard work tasks |
| `record` | classifier | Classification, tagging, extraction |
| `derive` | deep_pass | Deep reasoning, multi-step analysis |

**Env var naming pattern** for model IDs:
- `{PROVIDER_PREFIX}_MODEL_{ROLE}` — e.g. `XAI_MODEL_CONDUCT`, `GEMINI_MODEL_DERIVE`, `ANTHROPIC_MODEL_RECORD`
- OpenAI uses `OPENAI_MODEL_CONDUCT` (also used for `perform`), `OPENAI_MODEL_PRACTICE`, `OPENAI_MODEL_RECORD`, `OPENAI_MODEL_DERIVE`
- Fallbacks to old names (`OPENAI_MODEL_ROOT`, `OPENAI_MODEL_WORKER`, etc.) are preserved for backward compat

**Per-provider PCNA cores:**
- Each provider gets its own `PCNAEngine` instance: `get_provider_pcna("grok")` in `python/main.py`
- Checkpoint key: `pcna_tensor_checkpoint_provider_{id}`
- Converge endpoint blends provider core into main (80% main / 20% provider tensor per ring)
