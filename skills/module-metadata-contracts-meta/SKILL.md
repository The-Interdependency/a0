---
name: module-metadata-contracts-meta
description: Define a canonical module metadata declaration pattern and strict input/output structure contracts with hmmm boundary continuity.
---

# Module Metadata + Contract Meta Skill

Use this skill when a user asks to standardize **module metadata declarations** and/or define **input/output contracts** for module structures.

## Trigger Signals

- "module metadata declaration"
- "contract for module input/output"
- "schema for module structures"
- "self-describing module format"
- "typed interface for module payloads"

## Boundary Rule (Mandatory)

`hmmm` is the mandatory boundary object that records unresolved constraints, preserves honest incompletion, and marks the transition between delivered output and living continuation.

Every output contract in this skill **must** include `hmmm`.

---

## Canonical Module Metadata Declaration

Define module metadata as a top-level structure named `module_meta` with the following required fields:

- `module_id` (string): globally unique stable identifier.
- `module_name` (string): human-readable display name.
- `module_version` (string): semantic version (`MAJOR.MINOR.PATCH`).
- `module_owner` (string): owning team/person.
- `purpose` (string): one-sentence intent of the module.
- `capabilities` (array[string]): concrete actions the module can perform.
- `inputs_supported` (array[string]): accepted input contract IDs.
- `outputs_emitted` (array[string]): possible output contract IDs.
- `invariants` (array[string]): non-negotiable guarantees.
- `failure_modes` (array[object]): known fail states and mitigation.
- `observability` (object): logs, metrics, trace attributes emitted.
- `dependencies` (array[object]): runtime and optional dependency declarations.
- `security` (object): data class, auth scope, and sensitive-field policy.

### Optional but Recommended

- `deprecation` (object|null): timeline and replacement contract.
- `examples` (array[object]): valid request/response exemplars.
- `compatibility` (object): version matrix against peer modules.

---

## Input Contract Structure

Use a strict envelope named `module_input`:

```json
{
  "contract_id": "string",
  "contract_version": "string",
  "module_id": "string",
  "request_id": "string",
  "timestamp_utc": "ISO-8601 string",
  "actor": {
    "actor_id": "string",
    "actor_type": "user|agent|system"
  },
  "payload": {},
  "constraints": {
    "hard": ["string"],
    "soft": ["string"]
  },
  "context": {
    "upstream_module": "string",
    "trace_id": "string",
    "tags": ["string"]
  }
}
```

### Input Contract Rules

1. Reject missing required envelope fields.
2. Reject unknown `contract_version` unless compatibility policy explicitly allows it.
3. Validate `payload` against a module-specific schema before execution.
4. Convert validation failures to structured output errors (never raw tracebacks).

---

## Output Contract Structure

Use a strict envelope named `module_output`:

```json
{
  "contract_id": "string",
  "contract_version": "string",
  "module_id": "string",
  "request_id": "string",
  "timestamp_utc": "ISO-8601 string",
  "status": "ok|partial|error",
  "result": {},
  "errors": [
    {
      "code": "string",
      "message": "string",
      "retryable": true
    }
  ],
  "metrics": {
    "latency_ms": 0,
    "cost_hint": "string"
  },
  "hmmm": {
    "unresolved_constraints": ["string"],
    "honest_incompletion": "string",
    "continuation_handoff": "string"
  }
}
```

### Output Contract Rules

1. Always return a `module_output`, even for failures.
2. `status=partial` requires non-empty `hmmm.unresolved_constraints`.
3. `status=error` requires at least one structured `errors[]` item.
4. `hmmm` must be present for `ok`, `partial`, and `error` states.

---

## Failure Contract Conventions

For deterministic downstream handling:

- Use stable `errors[].code` namespaces (e.g., `INPUT_SCHEMA_MISMATCH`).
- Keep `errors[].message` concise and user-safe (no secrets/stack traces).
- Put unresolved work in `hmmm.unresolved_constraints`, not in free-text logs.

---

## Authoring Workflow

1. Draft `module_meta` first (identity + invariants).
2. Define `module_input` and payload schema.
3. Define `module_output` + `hmmm` behavior for all statuses.
4. Add 2-3 contract examples (`ok`, `partial`, `error`).
5. Add validation checks and a contract compliance test.

## Validation Checklist

- Metadata fields complete and versioned.
- Input/output envelopes contain all required keys.
- Failure paths return structured `module_output`.
- `hmmm` present and non-empty where unresolved constraints exist.
- Examples parse against declared schemas.
