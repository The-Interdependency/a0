/**
 * PTCA Sub-Core Types
 * 17-seed shared substrate with three projection modes:
 *   - Auditory: temporal stream (diff across heartbeats)
 *   - Visual: structural pattern (snapshot at heartbeat)
 *   - Memory: raw tensor (persistence across heartbeats)
 *
 * This is the compression bridge between server (3-core) and phone (1-core).
 */

/** Single seed in the 17-node sub-core */
export interface SubCoreSeed {
  /** Seed index (0-16), prime-addressed */
  index: number;

  /** Current state vector - raw memory surface */
  state: Float64Array;

  /** Previous state vector - for auditory diff */
  previousState: Float64Array;

  /** Structural signature - for visual pattern matching */
  structuralSignature: Float64Array;

  /** Write timestamp - last heartbeat that modified this seed */
  lastWriteHeartbeat: number;

  /** Source core affinities from last write [LLM/Tools, Psi, Omega] */
  sourceAffinity: [number, number, number];
}

/** Depth of state vector per seed */
export const SEED_STATE_DEPTH = 7; // heptagram phases

/** The 17 prime indices for sub-core addressing */
export const SUBCORE_PRIMES: readonly number[] = [
  2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59
] as const;

/** Auditory projection result - temporal diff */
export interface AuditoryProjection {
  /** Per-seed temporal deltas */
  deltas: Float64Array[];
  /** Sequence-order anomalies (rhythm breaks) */
  anomalies: AuditoryAnomaly[];
  /** Overall temporal coherence score */
  coherence: number;
  /** Heartbeat at which this projection was taken */
  heartbeat: number;
}

export interface AuditoryAnomaly {
  seedIndex: number;
  deltaMagnitude: number;
  expectedRange: [number, number];
  heartbeat: number;
}

/** Visual projection result - structural snapshot */
export interface VisualProjection {
  /** Full 17-seed pattern as single shape */
  pattern: Float64Array;
  /** Inter-seed structural relationships (17x17 condensed) */
  topology: Float64Array;
  /** Shape coherence score */
  coherence: number;
  /** Heartbeat at which this snapshot was taken */
  heartbeat: number;
}

/** Memory projection result - raw state */
export interface MemoryProjection {
  /** All 17 seed states, current */
  states: Float64Array[];
  /** All 17 seed states, previous */
  previousStates: Float64Array[];
  /** Per-seed staleness (heartbeats since last write) */
  staleness: number[];
  /** Heartbeat at which this read occurred */
  heartbeat: number;
}

/** Sync payload - what travels between server and phone at heartbeat */
export interface SyncPayload {
  /** The 17 seed states */
  seeds: Array<{
    index: number;
    state: number[];
    sourceAffinity: [number, number, number];
  }>;
  /** Heartbeat number */
  heartbeat: number;
  /** Direction */
  direction: 'server-to-phone' | 'phone-to-server';
  /** Tension field (phone-to-server only): where superimposed functions conflict */
  tensionField?: number[];
  /** Hash for integrity */
  hash: string;
}

/** Core identity for affinity tracking */
export enum CoreId {
  LLM_TOOLS = 0,
  PSI = 1,
  OMEGA = 2,
}
