// ratios: loc_comments=67:0 imports_exports=0:0 calls_definitions=1:0
/**
 * Shared TypeScript shapes for repo-level msdmd collection points.
 *
 * A consuming repo's `<reponame>_msdmd.ts` file may import or copy these
 * types, then export a `MsdmdCollection` generated from module-local msdmd
 * blocks. This file is type-only: it does not parse source files or validate
 * declarations.
 */
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

export interface MsdmdDeclaration {
  /** Repository-relative source file that owns the declaration. */
  file: string;
  /** msdmd application block name, such as CONTRACTS, CHECKS, or DOCS. */
  block: MsdmdBlockName;
  /** Stable entry id declared inside the block. */
  id: string;
  /** Flat parsed fields, excluding id unless a generator intentionally repeats it. */
  fields: MsdmdFieldMap;
}

export interface MsdmdGap {
  /** Repository-relative source file with missing expected block coverage. */
  file: string;
  /** Block types expected by local policy but absent from this file. */
  missing: MsdmdBlockName[];
  /** Optional explanation from the collector or policy layer. */
  reason?: string;
}

export interface MsdmdEdge {
  /** Source declaration id or file path. */
  from: string;
  /** Target declaration id, capability id, owner, route, file, or external system. */
  to: string;
  /** Relationship kind: requires, exposes, owns, covers, calls, claims_proves, risk, etc. */
  kind: string;
  /** Block that produced this edge. */
  source_block: MsdmdBlockName;
  /** Entry id that produced this edge. */
  source_id: string;
}

export interface MsdmdCollection {
  /** Repository slug, for example a0 or skill-lib. */
  repo: string;
  /** Parsed module-local msdmd entries. */
  declarations: MsdmdDeclaration[];
  /** Visible coverage gaps emitted by collectors or local policy. */
  gaps: MsdmdGap[];
  /** Optional normalized relationship graph for visualizers. */
  edges?: MsdmdEdge[];
  /** Optional collector metadata. */
  generated_at?: string;
  source_commit?: string;
}

export function defineMsdmdCollection(collection: MsdmdCollection): MsdmdCollection {
  return collection;
}
// ratios: loc_comments=67:0 imports_exports=0:0 calls_definitions=1:0
