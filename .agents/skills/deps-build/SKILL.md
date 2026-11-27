---
name: deps-build
description: Native-first dependency topology built on msdmd. Consume imports, package manifests, lockfiles and build declarations at their owning scopes; supplemental DEPENDENCIES blocks express remaining architectural intent. Preserve edge kinds, conditions and resolution uncertainty. Load this when declaring dependencies, auditing architecture drift, checking graph cycles, or wiring dependency topology checks into CI.
---

# deps-build — Dependency topology on msdmd

Implementation status: this skill defines the `DEPENDENCIES` block and runner
contract. The MSDMD schema-2 collector ships Python import, `package.json`, and
`pyproject.toml` dependency extraction, but no complete resolution/cycle runner;
consuming repos implement and test local resolvers and policies.

Read `msdmd/SKILL.md` first. Its provenance, information-coverage, parser and
explicit reader-support contracts apply.

## Native-first coverage

Consume imports, package manifests, lockfiles, workspace/build declarations and
other supported dependency conventions at their owning scopes. Package metadata
stays package-owned; it is not copied into every source module. Preserve runtime,
build, development, optional and resolved-dependency distinctions and conditions.

An import is not a call edge or a complete architecture explanation. A lockfile
records a resolution, not every source-level usage. Collect the native edge as
expressed; supplement missing intent only where policy actually requires it.
Unsupported discovery/resolution remains `PENDING` / `hmmm`, not absent metadata.
Reader support beyond the shipped subsets remains implementation work.

## The block

Supplement otherwise unexpressed dependency intent:

```python
# === DEPENDENCIES ===
# id: chat_route_dependency_edges
#   summary: chat API route depends on auth context and chat repository
#   imports: auth.user_context, repositories.chat
#   calls: ChatRepository.get_by_owner
#   requires: auth_user_context, chat_repository
#   class: runtime
# === END DEPENDENCIES ===
```

## Field schema

These fields govern supplemental DEPENDENCIES entries, not native syntax.
Required:

| Field | Meaning |
|---|---|
| `id` | Stable dependency declaration id. |
| `summary` | One-sentence description of why these edges exist. |

At least one edge field is required unless the entry records `hmmm`:

| Edge field | Meaning |
|---|---|
| `imports` | Comma-separated modules/packages imported by this module. |
| `calls` | Comma-separated functions, methods, routes, commands, or capabilities called by this module. |
| `requires` | Comma-separated msdmd ids this module depends on. |
| `provides` | Comma-separated ids or surfaces this module provides to others. |
| `external` | Comma-separated external services, APIs, or packages this module depends on. |

Optional:

| Field | Meaning |
|---|---|
| `class` | Dependency class (`runtime`, `build`, `test`, `docs`, `ops`, `agent`). |
| `direction` | `inbound`, `outbound`, `bidirectional`, or `hmmm`. |
| `owner` | Person, role, or team responsible for this dependency shape. |
| `since` | Version or date the declaration was added. |
| `deprecated` | If present, marks an edge scheduled for removal. |

## Runner contract

A DEPENDENCIES runner MUST:

1. Extract supported native dependencies and parse supplemental `DEPENDENCIES`
   blocks with the universal msdmd parser; report reader coverage.
2. Build source-qualified, typed edges from native declarations and `imports`,
   `calls`, `requires`, `provides` and `external` fields where resolvers exist.
3. Report failed capable resolution as drift; report unavailable resolvers,
   conditions or mappings as unresolved coverage, not proven broken dependencies.
4. Report cycles only in edge classes/configurations where local policy forbids them.
5. Report information GAPs only after capable inspection finds required edge or
   intent information absent. Block presence is a separate adoption measure.
6. Exit non-zero for malformed fields, failed resolvable edges or forbidden
   cycles; strict mode also fails on missing or unresolved required information.

## Reporting shape

- `EDGE`: declared/observed edge, kind, conditions and source scope.
- `UNRESOLVED`: an edge cannot be resolved, with a reason distinguishing drift from missing support.
- `CYCLE`: graph cycle detected under a stated configuration and policy.
- `PENDING`: edge, direction, mapping or reader recorded as `hmmm`.
- `GAP`: required dependency information is absent after capable inspection.

The generic block collector is not this graph runner and does not supply its
qualified-edge identity guarantees; see MSDMD's helper limitations.

## Validation

A native-import plus manifest fixture with zero DEPENDENCIES blocks must retain
source-level and package-level edges separately. Include optional dependencies,
unknown build conditions, genuinely missing intent and permitted/forbidden cycles.

## Anti-patterns

- Treating an import list as a complete architecture explanation or call graph.
- Requiring module-local duplicates of package-owned dependencies.
- Hiding unresolved dependencies by omitting them; use `hmmm`.
- Failing all cycles blindly; some test or plugin graphs may intentionally cycle.

hmmm
- exact resolver syntax for cross-language call and route edges
- which dependency classes disallow cycles by default
- cross-language resolution and application cycle policy remain consuming-runner work
