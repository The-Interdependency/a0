---
name: cap-build
description: Native-first capability inventory built on msdmd. Consume signatures, exports, annotations and API schemas; supplemental CAPABILITIES blocks express otherwise unrecorded behavior and boundaries. Keep declared surfaces separate from verified behavior. Load this when declaring module capabilities, building capability registries for agents, or auditing exposed surfaces against declared capabilities.
---

# cap-build — Capability declarations on msdmd

Implementation status: this skill defines the `CAPABILITIES` block and runner
contract. The MSDMD schema-2 collector ships a Python callable/class/export
reader, but no complete behavioral capability or framework/API-schema runner;
consuming repos implement and test their remaining mappings.

Read `msdmd/SKILL.md` first. Its provenance, information-coverage, parser and
explicit reader-support contracts apply.

## Native-first coverage

Consume signatures, exports, annotations, interface declarations and API schemas
at their owning scopes. A supported native declaration needs no duplicate
CAPABILITIES block. Preserve overloads, conditions and qualified symbol identity.
A signature establishes a declared surface, not a full behavioral capability;
missing behavioral intent may still require a supplemental declaration.

Keep syntactically observed surfaces, documented behavior, derived mappings and
verified outcomes distinct. Unsupported surface discovery is `PENDING`, not
proof of either complete coverage or an absent capability. Reader support beyond
the shipped source/standard subsets remains implementation work.

## The block

Supplement otherwise unexpressed capability intent:

```python
# === CAPABILITIES ===
# id: agent_supervisor_dynamic_spawn
#   summary: spawns child agents under a bounded supervisor
#   exposes: AgentSupervisor.start_child/1
#   inputs: child_spec
#   outputs: supervisor_child_ref
#   boundaries: auth:none, storage:none, network:none, user_data:none
#   owner: runtime-platform
# === END CAPABILITIES ===
```

## Field schema

These fields govern supplemental CAPABILITIES entries, not native syntax.
Required:

| Field | Meaning |
|---|---|
| `id` | Stable capability id. |
| `summary` | One-sentence capability description. |
| `exposes` | Function, class, route, command, UI component, or other public surface that exposes the capability; use `hmmm` if unresolved. |

Optional:

| Field | Meaning |
|---|---|
| `inputs` | Comma-separated input names or shapes. |
| `outputs` | Comma-separated output names or shapes. |
| `boundaries` | Comma-separated `name:value` boundary summary (`auth:none`, `storage:read`, etc.). Use `hmmm` for unresolved values. |
| `requires` | Comma-separated capability or module ids this capability depends on. |
| `class` | Free-text capability class (`runtime`, `ui`, `data`, `agent`, `ops`). |
| `owner` | Person, role, or team responsible for the capability. |
| `since` | Version or date the capability was added. |
| `deprecated` | If present, marks the capability as scheduled for removal. |

## Runner contract

A CAPABILITIES runner MUST:

1. Extract supported native surface metadata and parse supplemental
   `CAPABILITIES` blocks with the universal msdmd parser.
2. Build a source-qualified capability map; retain native and declared IDs.
3. Diagnose duplicate identities within their declared scope; identical names
   in different scopes do not establish the same capability.
4. Verify each non-`hmmm` `exposes` target with a capable language/framework
   resolver; report unsupported resolution rather than guessing success.
5. Report unresolved exposure, boundary information and required readers as pending.
6. Report an information GAP only when capable discovery and inspection find
   a required declaration absent. Do not equate missing blocks with missing capabilities.
7. Exit non-zero for malformed declarations, identity conflicts or broken
   resolvable targets; strict mode also fails on missing or unresolved required scope.

## Reporting shape

- `CAPABILITY`: qualified identity, summary, exposing module, owner and boundaries.
- `BROKEN_EXPOSES`: a declared surface fails a capable resolver.
- `DUPLICATE`: identity collides within its declared scope.
- `PENDING`: unresolved fields, mappings or extraction coverage.
- `GAP`: required capability information is absent after capable inspection.

The shipped generic block collector does not implement this capability runner's
qualified-identity or duplicate-validation contract; see MSDMD's helper limitations.

## Validation

A native-export/API-schema fixture must yield its declared surface without a
CAPABILITIES copy. It must not acquire invented behavior or verification.
Include same-name/different-scope, genuinely missing intent and unsupported-reader cases.

## Anti-patterns

- Requiring a module-local copy of capability metadata already in its native owner.
- Using implementation-shaped ids (`function_runs`) instead of capability-shaped ids (`agent_supervisor_dynamic_spawn`).
- Hiding boundary uncertainty; write `hmmm` where the effect is unresolved.
- Treating a module import as a capability without identifying the exposed behavior.

hmmm
- exact resolver syntax for framework-specific route and UI surfaces
- application capability identity and semantic conflict policy remain consuming-runner work
- whether private capabilities need a distinct class in the consuming policy
