// ratios: loc_comments=hmmm imports_exports=hmmm calls_definitions=hmmm
/**
 * Versioned TypeScript contracts for MSDMD collection points.
 *
 * Usage guidance:
 * - New native-capable generators call `defineMsdmdCollectionV2`.
 * - Existing block-only files may keep `defineMsdmdCollection` while they
 *   explicitly remain schema 1.
 * - Consumers must negotiate `schema_version`; schema 1 cannot represent
 *   native facts and must never receive a silent lossy projection.
 */

/**
 * Schema-2 shape revision of this helper. The collector refuses to write a
 * schema-2 artifact against a helper whose revision is older than it renders
 * (exit 4), so a stale vendored helper cannot fail tsc after regeneration.
 * Revision 1 adds `runtime-unavailable` reader runs and submodule ledger entries.
 */
export const MSDMD_COLLECTION_HELPER_VERSION = 1;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type MsdmdBlockName =
  | "DOCS"
  | "CAPABILITIES"
  | "DEPENDENCIES"
  | "OWNERS"
  | "CONTRACTS"
  | "CHECKS"
  | "MODULE_BUILD"
  | "BOUNDARIES"
  | "RATIOS"
  | "LLMS"
  | "FRONTEND_META";

export type MsdmdFieldMap = Record<string, string>;

/** Schema-1 block declaration retained only for explicit legacy consumers. */
export interface MsdmdDeclarationV1 {
  file: string;
  block: MsdmdBlockName;
  id: string;
  fields: MsdmdFieldMap;
}

export interface MsdmdGapV1 {
  file: string;
  missing: string[];
  reason?: string;
}

export interface MsdmdEdgeV1 {
  from: string;
  to: string;
  kind: string;
  source_block: MsdmdBlockName;
  source_id: string;
}

/** Block-only schema. It cannot represent native facts. */
export interface MsdmdCollectionV1 {
  schema_version?: "1.0.0";
  repo: string;
  declarations: MsdmdDeclarationV1[];
  gaps: MsdmdGapV1[];
  edges?: MsdmdEdgeV1[];
  generated_at?: string;
  source_commit?: string;
}

/** Explicit names retained for schema-1 source compatibility; never used for native facts. */
export type MsdmdDeclaration = MsdmdDeclarationV1;
export type MsdmdGap = MsdmdGapV1;
export type MsdmdEdge = MsdmdEdgeV1;
export type MsdmdCollection = MsdmdCollectionV1;

export type MsdmdSourceLocation =
  | { pointer: string }
  | { start_line: number; end_line: number; span?: JsonValue; start_byte?: number; end_byte?: number };

export interface MsdmdSourceReference {
  repository: string;
  revision: string;
  file: string;
  content_sha256: string;
  location: MsdmdSourceLocation;
}

export interface MsdmdDeclarationV2 {
  address: string;
  origin: "msdmd-block";
  standing: "declared";
  source: MsdmdSourceReference;
  file: string;
  block: MsdmdBlockName;
  id: string;
  fields: MsdmdFieldMap;
}

export interface MsdmdNativeFact {
  address: string;
  origin: "native";
  kind: string;
  source: MsdmdSourceReference;
  subject: {
    address: string;
    scope: string;
    identity: string;
  };
  convention: {
    namespace: string;
    version: string;
    dialect: string;
  };
  native: {
    id: string | null;
    value: JsonValue;
  };
  standing: "declared" | "syntactically-observed" | "derived" | "reported-evidence";
  extraction: {
    reader_id: string;
    reader_version: string;
    support: "implemented-and-tested" | "partial" | "specified-only" | "unsupported";
    configuration_sha256: string;
    implementation_sha256?: string;
  };
  projection?: {
    mapping_version: string;
    canonical_field?: string;
    relation?: string;
    loss: string;
  };
}

export interface MsdmdReaderManifest {
  reader_id: string;
  version: string;
  entry_point: string;
  dependencies: string[];
  convention: string;
  specification: string;
  supported_versions: string[];
  feature_subset: string[];
  detection: string[];
  scope_attachment: string;
  unknown_field_policy: string;
  execution_policy: string;
  support: "implemented-and-tested" | "partial" | "specified-only" | "unsupported";
  known_limitations?: string[];
}

export interface MsdmdReaderRun {
  reader_id: string;
  reader_version: string;
  support: MsdmdReaderManifest["support"];
  status: "applied" | "not-applicable" | "runtime-unavailable";
  files_matched: number;
  facts_emitted: number;
}

export interface MsdmdDiscoveryEntry {
  file: string;
  status: "supported" | "partial" | "unsupported" | "invalid" | "excluded" | "unreadable";
  reader_ids: string[];
  content_sha256: string;
  entry_kind?: "file" | "subtree" | "output" | "submodule";
  size?: number;
  reason?: string;
  /** Pinned gitlink commit for an excluded git submodule. */
  commit?: string;
}

export interface MsdmdEdgeV2 {
  from: string;
  to: string;
  kind: string;
  standing: "declared" | "syntactically-observed" | "derived" | "reported-evidence";
  target_resolution: "resolved-unique-entry-id" | "external-or-unresolved" | "ambiguous";
  source_block?: MsdmdBlockName;
  source_id?: string;
  source_entry_id?: string;
}

export interface MsdmdDiagnostic {
  code: string;
  severity: "error" | "warning" | "info";
  status: string;
  message: string;
  source: JsonValue;
  reader_id: string | null;
  candidates?: string[];
}

export interface MsdmdConflict {
  kind: string;
  status: "unresolved" | "resolved";
  identity: string;
  witnesses: MsdmdSourceReference[];
  reason: string;
}

export interface MsdmdGapV2 {
  file: string;
  missing: MsdmdBlockName[];
  kind: "block-adoption";
}

export interface MsdmdCollectionV2 {
  schema: "the-interdependency.msdmd-collection";
  schema_version: "2.0.0";
  capabilities: string[];
  repo: string;
  source: {
    repository: string;
    revision: string;
    git_head: string;
    dirty_worktree: boolean | "hmmm";
    snapshot_sha256: string;
    snapshot_complete: boolean;
    revision_kind?: "content-snapshot" | "git-or-declared";
    exclusion_accounting?: "configured-patterns" | "observed-paths";
    scope?: string;
  };
  requirements?: JsonValue[];
  reader_manifests: MsdmdReaderManifest[];
  reader_runs: MsdmdReaderRun[];
  discovery: MsdmdDiscoveryEntry[];
  declarations: MsdmdDeclarationV2[];
  facts: MsdmdNativeFact[];
  gaps: MsdmdGapV2[];
  edges: MsdmdEdgeV2[];
  conflicts: MsdmdConflict[];
  diagnostics: MsdmdDiagnostic[];
  coverage: {
    denominator: { kind: "discovered-files"; count: number };
    excluded_subtrees?: number;
    required_sources?: string[];
    supported_files: number;
    partial_files: number;
    unsupported_files: number;
    invalid_files: number;
    excluded_files: number;
    unreadable_files: number;
    native_facts: number;
    supplemental_declarations: number;
    block_adoption: Record<string, number>;
    information_availability: "not-evaluated-without-obligation-policy" | "policy-evaluated";
    verified_behavior: "not-evaluated";
  };
}

/** Explicit compatibility helper for block-only schema-1 collection points. */
export function defineMsdmdCollection(collection: MsdmdCollectionV1): MsdmdCollectionV1 {
  return collection;
}

/** Native-capable schema-2 helper. Consumers must opt into this exact version. */
export function defineMsdmdCollectionV2(collection: MsdmdCollectionV2): MsdmdCollectionV2 {
  return collection;
}
/** Keep large generated literals type-checkable without any/unknown casts. */
export function mergeMsdmdFactChunks(...chunks: MsdmdNativeFact[][]): MsdmdNativeFact[] {
  return chunks.flat();
}
// ratios: loc_comments=hmmm imports_exports=hmmm calls_definitions=hmmm
