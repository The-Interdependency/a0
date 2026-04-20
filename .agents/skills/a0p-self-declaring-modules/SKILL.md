---
name: a0p-self-declaring-modules
description: The core architectural pattern in a0p for building registries that grow without central edits. Each module declares its own metadata + handler in one file, a filesystem scanner discovers them at boot, and the registry is generated. Used by route modules, distill skills, a0-skills, and (now) tools. Pairs with a0p-module-doctrine which enforces the 400-line cap that this pattern naturally satisfies. Load this skill before building any new registry, refactoring a centralized dispatcher, or adding a "drop-a-file-and-it-shows-up" surface.
---

# Self-Declaring Modules

The pattern a0p uses everywhere a registry exists: **metadata + handler colocated in one file, scanner discovers them, registry is generated at boot.** Never edit a central list.

This skill is the *meta-pattern*. The 400-line cap and `# DOC` conventions in `a0p-module-doctrine` are how individual modules behave; this skill is how the *registries that hold them* are built.

---

## The Pattern

```
python/services/<registry_name>/
├── __init__.py          # Scanner + dispatcher. Discovery only — no business logic.
├── tool_a.py            # SCHEMA = {...} + async def handle(...)
├── tool_b.py            # SCHEMA = {...} + async def handle(...)
└── tool_c.py            # SCHEMA = {...} + async def handle(...)
```

Three rules. Violate any of them and the pattern degrades back into the central-dispatcher problem you were trying to escape.

### Rule 1 — Schema and handler are colocated

Every module exports both:

```python
# python/services/tools/image_generate.py
SCHEMA = {
    "type": "function",
    "function": {
        "name": "image_generate",
        "description": "Generate an image with Imagen-3.",
        "parameters": { ... },
    },
    "tier": "free",
    "approval_scope": None,
    "enabled": True,
}

async def handle(prompt: str, aspect_ratio: str = "1:1", **_) -> dict:
    ...
```

If a future "schema in DB" overlay applies (operational toggles like `enabled`, `tier`, `description_override`), it merges *on top of* the file-declared SCHEMA — the file remains source of truth for shape.

### Rule 2 — The scanner is deterministic and cache-stable

```python
def _discover() -> dict[str, ModuleType]:
    out = {}
    for path in sorted(glob.glob(_PATTERN)):    # sorted for stability
        spec = importlib.util.spec_from_file_location(...)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        out[mod.SCHEMA["function"]["name"]] = mod
    return out
```

- **`sorted(glob)`** — discovery order must be byte-identical across runs. Anything injected into prompt prefixes (manifest, tool list) must be cache-stable or you blow the prefix-cache savings.
- **mtime fingerprint** — cache the discovery output keyed by `tuple((path, mtime) for path in files)`. Re-scan only when the fingerprint changes. See `_discover_a0_skills` and `_discover_distillers` in `tool_executor.py` for the canonical implementations.
- **Lazy bodies, eager metadata** — load every SCHEMA at boot (cheap, prompt prefix needs them); load handler bodies on demand if they're heavy (image-gen SDK imports, etc.).

### Rule 3 — Registration is by file presence, not by central list

The registry is generated from the scanner output. There is **no `ALL_TOOLS = [...]` list to edit**. To add a tool, drop a file. To remove a tool, delete the file. To disable, set `SCHEMA["enabled"] = False`.

This is why the pattern needs the 400-line cap (see `a0p-module-doctrine` §Hard Rules) — once you have it, no module ever grows large enough to need to be split, because each one is one tool / one route / one skill / one distiller.

**The 400-line cap counts N only.** N is non-blank, non-comment code lines. Comments, docstrings, `# DOC` blocks, and the `# N:M` annotations themselves are M and do not count toward the cap. A 700-line file with `# 380:320` is compliant; a 410-line file with `# 410:0` is not. Document liberally; just keep the executable surface bounded.

---

## Existing examples in this codebase

Read at least one before adding a new registry:

| Registry | Location | Scanner | Notes |
|---|---|---|---|
| Route modules | `python/routes/*.py` | `collect_doc_meta()`, `collect_ui_meta()` | Has 4-place registration in `__init__.py` — legacy pattern, predates full discovery. New registries should not require manual registration. |
| Distill skills | `.agents/skills/distill-*/SKILL.md` | `_discover_distillers()` in `tool_executor.py` | Pure-content; no handler. |
| a0-skills | `.agents/skills/a0-*/SKILL.md` | `_discover_a0_skills()` in `tool_executor.py` | Manifest cached into doctrine prefix. |
| ZFAE tools (legacy) | `python/services/tool_executor.py` (single file) | None — central registry | **Anti-pattern. Currently being refactored to this skill.** |

---

## Operational metadata fields (recommended)

Every SCHEMA should declare these even when the value is the default — explicit > implicit, and the scanner can use them for filtering:

```python
SCHEMA = {
    "type": "function",
    "function": { ... },                # The OpenAI-shape function declaration

    "tier": "free",                     # free | seeker | operator | patron | admin
    "approval_scope": None,             # None or scope name from approval_scopes table
    "enabled": True,                    # File-level enable; runtime DB overlay can flip
    "category": "media",                # For UI grouping in tools tab
    "cost_hint": "high",                # "free" | "low" | "medium" | "high"
    "side_effects": ["filesystem"],     # see § Side-effect taxonomy below
    "version": 1,                       # Bump on breaking schema changes

    "recommended_skills": [             # Skill slugs the model should load before/while using this tool.
        "github-solution-finder",       # Names match a0-skill discovery (.agents/skills/a0-<name>/SKILL.md)
    ],                                  # Surfaced to the model via the tool description tail.
}
```

The scanner exposes a typed view (e.g. `class ToolSpec`) that other systems consume — never reach into raw SCHEMA dicts from outside the registry module.

### `recommended_skills` — wiring tools to skills

A tool that performs a complex action almost always has a skill that documents how to do it well. Declare the skill name(s) in `recommended_skills` and the registry layer appends a one-line hint to the tool's description shown to the model:

> *Best used with skill(s): github-solution-finder. Call `skill_load(name)` to fetch the body before executing.*

This closes the loop between the two registries — the model sees the connection without you having to re-document it inside every prompt. When the model picks the tool, it already knows which skill to consult; when it loads the skill, the body teaches it how to use the tool well.

Examples of expected pairings:
- `image_generate` → `infographic-builder` (when the goal is structured information design, not just a picture)
- `web_search` → `deep-research` (when the goal is multi-source synthesis, not a quick lookup)
- `github_api` → `github-solution-finder` (when looking for libraries, not a known repo)
- `port_scan` / `http_fuzz` / `web_recon` → a future `pentest-recon` skill that codifies safe scope, rate limits, evidence collection
- `exploit_run` → a future `pentest-exploitation` skill with the rules-of-engagement template and report format

### Side-effect taxonomy

`side_effects` is a list. Use these tags so downstream gating (approval scopes, tier limits, audit log severity) can reason about a tool without reading its code:

- `filesystem` — reads or writes local files
- `network` — outbound HTTP / sockets to non-attacker-controlled targets (search, public APIs, your own GCP)
- `billing` — costs money per call (image gen, paid LLM, paid API)
- `external_account` — touches an account whose credentials we hold (Stripe writes, GitHub push, Gmail send)
- `mutating_db` — writes to our own Postgres
- `irreversible` — cannot be safely retried or rolled back
- `security_passive` — pen-testing recon that does not generate traffic to the target (cert lookups, public DNS, leaked-credential search)
- `security_active` — pen-testing traffic *to* a target system (port scan, fuzzer, exploit run, brute force). **Always set `approval_scope` for these.** The scope name should encode the target class so the user knows what they're approving (e.g. `pentest_active_scoped_targets`).

A pen-testing tool with `side_effects: ["security_active", "network"]` and `approval_scope: "pentest_active_scoped_targets"` makes the gating obvious to every downstream system without anyone having to special-case offensive tooling.

---

## When NOT to use this pattern

- **Single-implementation utilities** — `python/services/sigma.py` is one Σ store, not a registry. Don't fragment it.
- **Cross-cutting concerns** — auth, logging, the doctrine prefix builder. These are not extensible by file-drop and shouldn't pretend to be.
- **Anything called inside a hot loop** — the discovery scan is mtime-cached but adds at least one `os.stat` per file. Don't put per-request work behind it.

---

## Refactor checklist (when converting a central dispatcher to this pattern)

1. Create `python/services/<name>/__init__.py` with scanner + dispatcher + cache.
2. Extract each tool/handler/etc. to its own file. Each file: `SCHEMA = {...}` + `async def handle(...)`. Keep under 400 lines (`a0p-module-doctrine` §Hard Rules).
3. Replace the central `TOOL_SCHEMAS_CHAT = [...]` and `if name == "x": ...` dispatch with calls into the registry.
4. Verify boot: `python -c "from python.services.<name> import registry; print(len(registry()))"`.
5. Run the existing tests — they should pass without modification if the dispatcher contract is preserved (`registry()`, `dispatch(name, **kwargs)`).
6. Add one new test: `test_every_tool_module_declares_schema_and_handle` — parametrize over discovered modules, assert both attributes exist and SCHEMA validates.
7. Re-stamp annotations: `python scripts/annotate.py`.
8. Confirm `tool_executor.py` (or whatever the old central file was) is now a thin re-export shim or deleted entirely.

---

## Anti-patterns to refuse

- **Registry edits required to add a module** — if a new file requires editing a central list, the pattern is broken.
- **Schema in code, handler somewhere else** — guarantees drift. Same file, always.
- **Non-deterministic discovery order** — `os.listdir()` without sorting will silently corrupt prompt-prefix caches across runs on different filesystems.
- **One file declaring two registry entries** — split it. The 400-line cap is your friend here, not your enemy.
- **Hot-reload that re-discovers on every request** — mtime cache or boot-time freeze. Pick one.
