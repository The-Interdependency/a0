---
name: typed-meta-frontend
description: TypeScript frontend generation from backend-owned module metadata and living specs. Load this when building, reviewing, or refactoring a self-building UI that reads backend metadata, exposes every editable field per module, renders each module's living spec, generates TypeScript types/forms/routes from metadata, or keeps admin/editor frontends synchronized with msdmd-style source declarations.
---



## Core contract

- Treat backend metadata as authoritative. Do not invent frontend-only fields unless the backend metadata declares them or marks them `hmmm`.
- Generate or derive TypeScript types from the metadata schema before building UI components.
- Display two surfaces for each module:
  1. **Living spec view** — human-readable module identity, purpose, boundaries, dependencies, tests, docs, risk notes, unresolved `hmmm`, and provenance.
  2. **Editable field view** — every backend-declared editable field, including nested fields, arrays, enums, validation rules, permissions, current value, dirty state, and save/error status.
- Preserve non-editable spec facts visibly. A user should be able to see why a field exists and why another field is read-only.
- Surface coverage gaps. A module missing metadata, missing editable declarations, or missing spec provenance must appear as a visible gap, not disappear from the UI.

## Module-local block convention

When a repo needs source-local declarations, use a `FRONTEND_META` msdmd block in the backend module that owns the data. Keep large schemas in backend code or generated JSON; the block should identify the module, living spec source, metadata endpoint, and editable field paths.

```ts
// === FRONTEND_META ===
// id: billing_policy_editor
//   module_id: billing.policy
//   living_spec: docs/billing-policy.md#living-spec
//   metadata_endpoint: GET /api/meta/modules/billing.policy
//   patch_endpoint: PATCH /api/meta/modules/billing.policy/fields
//   editable_fields: settings.retryLimit, settings.gracePeriodDays, notices[].templateMarkdown
//   readonly_fields: moduleId, audit.createdAt, audit.updatedBy
//   permissions: billing.policy.edit
//   hmmm: Whether gracePeriodDays should be tenant-scoped or org-scoped is unresolved.
// === END FRONTEND_META ===
```

Required fields: `module_id`, `living_spec`, `metadata_endpoint`, `editable_fields`. Optional fields: `patch_endpoint`, `readonly_fields`, `permissions`, `hmmm`. Unknown fields are allowed only when preserved as visible metadata and marked `hmmm` if their meaning is unresolved.

## Recommended backend metadata shape

Use existing backend metadata if present. If defining a contract, keep it small and serializable:

```ts
type ModuleMeta = {
  moduleId: string;
  title: string;
  spec: {
    summary: string;
    livingSpecMarkdown?: string;
    sourcePath?: string;
    anchors?: string[];
    status: "declared" | "implemented" | "inferred" | "hmmm";
    hmmm?: string[];
  };
  editableFields: EditableField[];
};

type EditableField = {
  path: string;              // e.g. "settings.retryLimit" or "owners[0].email"
  label: string;
  kind: "string" | "number" | "boolean" | "enum" | "markdown" | "json" | "date";
  required: boolean;
  readOnly?: boolean;
  help?: string;
  value?: unknown;
  defaultValue?: unknown;
  enumOptions?: Array<{ value: string; label: string }>;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    message?: string;
  };
  permission?: string;
  provenance?: string;
  hmmm?: string;
};
```

If the repo already uses msdmd, prefer adding a dedicated module-local metadata block that points to the backend schema or API rather than duplicating all data in the frontend.

## Build workflow

1. **Discover metadata source**
   - Find the backend endpoint, generated JSON, OpenAPI route, GraphQL schema, or msdmd-derived collection that lists modules.
   - Confirm it contains both living spec data and editable field declarations.
   - If metadata is incomplete, preserve the gap as `hmmm` and build a visible incomplete state.

2. **Generate TypeScript contracts**
   - Derive `ModuleMeta`, `EditableField`, API request/response types, and discriminated unions for field `kind`.
   - Keep generated files clearly marked if they are regenerated; keep hand-written adapters separate.
   - Prefer runtime validation (`zod`, `valibot`, JSON Schema, or repo-standard equivalent) at the API boundary.

3. **Create a metadata adapter layer**
   - Normalize backend metadata into one frontend shape.
   - Keep path traversal, defaulting, permission checks, validation message mapping, and save payload construction out of UI components.
   - Record unresolved schema mismatches as `hmmm` instead of silently coercing them.

4. **Render the module index**
   - List every module returned by metadata.
   - Include metadata health: complete, partial, missing editable fields, missing living spec, save disabled, or `hmmm`.
   - Provide search/filter by module id, title, status, owner, capability, risk boundary, and unresolved fields when available.

5. **Render the living spec**
   - Show the backend-provided markdown/spec facts with source path and status.
   - Keep generated summaries subordinate to the source spec.
   - Highlight `hmmm` as an honest continuation boundary, not as an error to hide.

6. **Render editable fields**
   - Select controls by `EditableField.kind`.
   - Show required state, validation, help text, provenance, permission/read-only reason, dirty state, and server errors for every field.
   - Support nested paths and arrays without dropping fields.
   - Disable save when permission or validation forbids it, but still show the field and reason.

7. **Save by metadata path**
   - Send minimal patches keyed by declared field paths unless the backend requires full objects.
   - Re-fetch metadata after save so the living spec and editable values remain backend-synchronized.
   - Display optimistic updates only if rollback and server reconciliation are implemented.

8. **Verify coverage**
   - Add tests that fail when a module with editable metadata does not render all editable paths.
   - Add tests for living spec presence, read-only reasons, validation errors, nested field paths, array fields, and `hmmm` display.
   - Add a drift check when generated TypeScript contracts are committed.

## Runner / generator contract

A compliant generator or frontend build step reads backend-owned metadata,
derives TypeScript contracts before UI rendering, keeps generated files marked
as generated, and fails visibly when a declared module, living spec, editable
field, permission, or validation rule cannot be represented. If a consuming repo
does not ship a generator, the same contract applies to its adapter layer and
tests.

## UI implementation guidance

- Use schema-driven components: `ModuleList`, `ModuleSpecPanel`, `EditableFieldRenderer`, `FieldControl`, `MetadataHealthBadge`, and `SaveBar`.
- Keep field renderers exhaustive. A new backend `kind` should cause a TypeScript compile error or visible unsupported-field state.
- Use stable field keys from `moduleId + path`; do not key editable fields by label.
- Treat markdown specs as untrusted input unless the backend guarantees sanitization.
- Keep accessibility first: label every control, associate errors with controls, preserve keyboard navigation, and avoid color-only metadata health states.

## Acceptance checklist

- Every backend-listed module appears in the frontend.
- Every module displays its living spec or a visible `hmmm` for missing spec.
- Every declared editable field appears exactly once, including nested and array fields.
- Read-only fields still appear with a reason.
- Unknown field kinds produce visible unsupported-field UI and `hmmm`, not blank space.
- Save payloads use backend-declared paths and permissions.
- Tests cover full metadata-to-UI field exposure.
- Usage guidance documents where metadata comes from, how to regenerate types, how to run the frontend, and how to add a new editable field.

## Anti-patterns

- Hand-authoring field forms that silently diverge from backend metadata.
- Dropping read-only fields, permission-denied fields, unknown field kinds, or
  missing specs from the UI.
- Trusting backend-provided markdown without a sanitization boundary.
- Saving optimistic edits without rollback and server reconciliation.
- Treating frontend convenience fields as canonical when the backend has not
  declared them.

hmmm
- Preferred concrete backend metadata transport is repo-specific: REST, GraphQL, generated JSON, OpenAPI, or msdmd collection can all satisfy the contract.
- The exact persistence strategy for field patches depends on backend authorization and audit requirements.
- A frontend that builds itself from metadata is a mirror with a wrench taped to it; useful, but only if the mirror admits where the wrench cannot reach.
