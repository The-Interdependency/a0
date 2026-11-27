---
name: risk-boundary-build
description: Native-first runtime risk and permission boundaries built on msdmd. Consume existing permission, schema, configuration and effect declarations; supplemental BOUNDARIES blocks express otherwise missing auth, storage, network, user-data and operational effects. Declarations do not prove enforcement. Load this when touching permissions, persistence, network calls, user data, admin behavior, migrations, or other risk-bearing effects.
---

# risk-boundary-build — Runtime boundaries on msdmd

This complements `meta-module-build`: build metadata describes intended
boundaries before new work starts; runtime metadata declares effects of an
existing module. Neither declaration alone proves runtime enforcement.

Implementation status: this skill defines the `BOUNDARIES` block and runner
contract. This repo does not currently ship a BOUNDARIES runner or native effect
readers; consuming repos implement and test applicable mappings and heuristics.

## Native-first coverage

Read `msdmd/SKILL.md` first. Consume existing permission/configuration metadata,
API security declarations, schema annotations and explicit effect declarations
at their owning scopes. Keep declared policy, intended effects and observed
runtime evidence distinct. Supported native fields need no BOUNDARIES copy.

A deployment permission does not by itself establish that every code path
honors it. Ambiguous, unsupported or incomplete mappings remain `hmmm`; unknown
never becomes `none`. Supplement missing effect information where needed.
Native readers are implementation work, not capabilities supplied by this text.

## The block

Supplement otherwise unexpressed runtime-effect declarations:

```python
# === BOUNDARIES ===
# id: chat_route_user_data_boundary
#   summary: reads user-owned chat rows for the authenticated requester
#   auth_boundary: read
#   storage_boundary: read
#   network_boundary: none
#   user_data_boundary: read
#   admin_only: false
#   pii: possible
#   owner: platform-runtime
# === END BOUNDARIES ===
```

## Field schema

These fields govern supplemental BOUNDARIES entries, not native syntax.
Required:

| Field | Meaning |
|---|---|
| `id` | Stable boundary declaration id. |
| `summary` | One-sentence description of the sensitive behavior. |
| `auth_boundary` | `none`, `read`, `write`, `admin`, or `hmmm`. |
| `storage_boundary` | `none`, `read`, `write`, `delete`, `migration`, or `hmmm`. |
| `network_boundary` | `none`, `internal`, `external`, or `hmmm`. |
| `user_data_boundary` | `none`, `read`, `write`, `delete`, or `hmmm`. |
| `admin_only` | `true`, `false`, or `hmmm`. |

Optional:

| Field | Meaning |
|---|---|
| `pii` | `none`, `possible`, `direct`, `sensitive`, or `hmmm`. |
| `secrets` | `none`, `read`, `write`, or `hmmm`. |
| `side_effects` | Comma-separated side effects (`email`, `webhook`, `billing`, `job`, `cache`, etc.). |
| `review_required` | Person, role, team, or condition required before edits. |
| `owner` | Person, role, or team responsible for the boundary declaration. |
| `requires` | Comma-separated BOUNDARIES or MODULE_BUILD ids this declaration depends on. |
| `since` | Version or date the declaration was added. |

## Runner contract

A BOUNDARIES runner MUST:

1. Extract supported native effect declarations and parse supplemental
   `BOUNDARIES` blocks with the universal msdmd parser; report reader coverage.
2. Report required fields containing `hmmm` and unresolved required mappings
   as unresolved boundary objects.
3. Report missing required effect information only after capable inspection
   of eligible sources. Sensitive-file hints with incomplete extraction remain
   review candidates, not proof of missing declarations.
4. Support strict mode where information gaps, conflicts or any required
   `hmmm` boundary/reader fail. Missing blocks alone are adoption observations.
5. Exit non-zero for malformed supplemental fields, invalid enum values or
   strict-mode unresolved boundaries.

Sensitive-file heuristics MAY include auth/session imports, database clients,
network clients, migration filenames, admin routes, payment/billing modules,
secret managers, and user-data models. Heuristics are advisory: they create
review visibility, not proof of risk.

## Agent behavior

- Read applicable native effect declarations and supplemental BOUNDARIES before editing.
- Preserve and call out required boundaries or reader coverage that remain `hmmm`.
- Do not relax a declared boundary (`admin` → `read`, `external` → `internal`, etc.)
  without evidence that the implementation change removes the corresponding effect.
- When an edit changes a sensitive effect, update its owning declaration in the
  same diff; do not require a second MSDMD copy of an existing native field.

## Validation

A supported native security declaration must be consumed without a BOUNDARIES
copy and without becoming proof of enforcement. Include unknown/none distinction,
conflicting declarations, unsupported syntax and strict required-reader failures.

## Anti-patterns

- Treating `none` as a default. Unknown is `hmmm`, not `none`.
- Recording intended boundaries as verified runtime effects before code exists.
- Requiring a duplicate block instead of consuming supported native effect metadata.
- Letting heuristic gap detection replace explicit owner review.

hmmm
- exact sensitive-import heuristic lists per framework
- native effect mappings and enforcement verification remain separate implementation work
- how to represent read-only analytics on anonymized aggregate data
