---
name: meta-module-build
description: Native-first module planning built on msdmd. Consume existing manifests, schemas and design declarations; supplemental MODULE_BUILD blocks record remaining purpose, surface, boundary, test, rollout and rollback obligations. Load this when turning a capability idea into a bounded module manifest and file plan before implementation.
---

# meta-module-build — Metadata-first module scaffolding

GPT generated; context, prompt Erin Spencer

`meta-module-build` is an application of [msdmd](../msdmd/SKILL.md). It
keeps proposed purpose, surfaces, dependencies, boundaries, tests and rollout
notes attributable to the sources that own them.

Read `msdmd/SKILL.md` first. This skill inherits its source/provenance, native
reader support, supplemental block and information-coverage contracts.
Implementation status: this is a consuming-repo planning/runner contract. The
MSDMD schema-2 collector preserves JSON and TOML manifest trees, but this repo
does not ship a complete MODULE_BUILD obligation/policy runner.

## Doctrine

A module build is not an unbounded patch. It is a staged transformation:

```text
intent -> manifest -> file plan -> tests -> scaffold -> reviewable change
```

If a field is not known, write `hmmm`. Do not guess certainty into the manifest.

## Native-first coverage

Consume existing package/module manifests, schemas, source-owned design
records and explicit rollout/test declarations before requesting supplemental
metadata. Preserve owning scope and source references. A package manifest is
not automatically a module plan: map only information it actually expresses.

The build's semantic obligations remain required, but their native owners need
no MODULE_BUILD copies. Supplement genuinely unexpressed intent. Unsupported
mapping is unresolved coverage, not absence. Semantic planning mappings beyond
the shipped structured-source preservation remain implementation work.

## The block

A module may supplement its build declaration with a `MODULE_BUILD` block:

```python
# === MODULE_BUILD ===
# id: ucns_object_record
#   module_name: object_record
#   module_kind: service
#   summary: describes a UCNS object without running factorization
#   owner: Erin Spencer
#   public_surface: object_record, UCNSObjectRecord
#   internal_surface: status_for_object, depth_of, stable_hash
#   auth_boundary: none
#   storage_boundary: none
#   network_boundary: none
#   user_data_boundary: none
#   admin_only: false
#   tests: ucns_recursive.tests.test_object_record
#   rollout: default_enabled
#   rollback: remove export and call sites
# === END MODULE_BUILD ===
```

## Field schema

This syntax governs supplemental MODULE_BUILD entries. Native sources retain
their own schemas and must satisfy the applicable planning obligations without
invented IDs or copied fields. Required for a supplemental entry:

| Field | Meaning |
|---|---|
| `id` | Unique snake_case identifier, stable across refactors. |
| `module_name` | Human/module name being built. |
| `module_kind` | One of `skill`, `service`, `route`, `adapter`, `engine`, `instrument`, `ui_panel`, `schema`, `migration`, `worker`, `experiment`, or `hmmm`. |
| `summary` | One-sentence purpose. |
| `owner` | Responsible person, role, or agent. |
| `public_surface` | Public exports, routes, commands, or user-visible functions. Use `none` if absent. |
| `internal_surface` | Internal functions/classes/routes touched. Use `none` if absent. |
| `tests` | Test module/path or `hmmm` if not written yet. |
| `rollout` | How the module becomes active. |
| `rollback` | How to disable or remove it cleanly. |

Boundary information is required because module generation often crosses hidden lines:

| Field | Meaning |
|---|---|
| `auth_boundary` | Auth or permission effect: `none`, `read`, `write`, `admin`, or `hmmm`. |
| `storage_boundary` | Persistent storage effect: `none`, `read`, `write`, `migration`, or `hmmm`. |
| `network_boundary` | Network/API effect: `none`, `internal`, `external`, or `hmmm`. |
| `user_data_boundary` | User-data effect: `none`, `read`, `write`, `delete`, or `hmmm`. |
| `admin_only` | `true`, `false`, or `hmmm`. |

Optional:

| Field | Meaning |
|---|---|
| `ui_surface` | UI tab/panel/component affected. |
| `api_surface` | API route or RPC surface affected. |
| `data_schema` | Schema name or shape affected. |
| `feature_flag` | Flag or config gate. |
| `requires` | Comma-separated MODULE_BUILD ids this one depends on. |
| `since` | Date/version added. |
| `unresolved` | Comma-separated unresolved items. |

## File plan rule

Every implementation PR produced by this skill should include a file plan in the PR body:

```text
path
created_or_modified
purpose
risk
required_tests
```

Do not hide unrelated file edits inside a module build.

## A0 console metadata rule

If a module touches the console, route surface, or dynamic UI, the manifest must name the metadata contract it preserves or adds.

Expected concepts:

```text
UI_META
DATA_SCHEMA
route namespace
renderer expectation
permission tier
empty state
error state
```

If the codebase uses different names, use the codebase names and map them to these concepts in the PR body.

## UCNS-aware rule

When a module touches UCNS objects, identity, factorization, or recursive interpretation, prefer the public safe boundary:

```python
from ucns import a0_safe
```

Preferred calls:

```python
a0_safe.describe(obj)
a0_safe.identity(obj)
a0_safe.canonical(obj)
a0_safe.factor(obj)
```

Do not use raw factorization sentinels for A0-facing claims when a scoped envelope exists.

## Runner behavior

A `MODULE_BUILD` runner should:

1. extract supported native planning metadata and parse supplemental
   `MODULE_BUILD` blocks using the msdmd universal parser;
2. validate native mappings and supplemental fields under their own schemas;
3. report boundary information and its owning sources visibly;
4. report genuinely absent required planning information only after capable
   inspection; keep missing blocks separate as adoption observations;
5. fail strict mode on missing information, required unsupported extraction or
   unresolved conflicts, rather than accepting incomplete coverage;
6. emit a review summary grouped by `module_kind` and boundary risk.

## Validation

A supported native planning fixture must satisfy the information it actually
expresses without a MODULE_BUILD copy. Include missing rollback, unresolved
boundary, unsupported mapping and same-name/different-scope cases.

## Anti-patterns

- Building code first and writing the manifest after.
- Omitting boundary information because the module feels small.
- Marking unknowns as solved instead of `hmmm`.
- Using implementation-shaped ids that do not explain the protected capability.
- Adding UI or route behavior without declaring metadata expectations.
- Treating frontier-domain UCNS results as absolute claims.
- Demanding a second MODULE_BUILD copy of already-owned native information.

## Completion criteria

A meta-module-build run is complete when it produces either:

```text
manifest-only PR
```

or

```text
scaffold PR with tests and docs
```

The manifest may be composed from source-linked native declarations and
supplemental entries. An idea alone, a patch with no manifest, or a module with
no boundary/test plan remains incomplete.

## hmmm

Native planning-obligation mappings remain consuming-repo implementation work.
Default unresolved items for new modules:

```text
exact registry location
feature flag or default activation
admin gate
persistence behavior
UI metadata naming
rollback owner
```
