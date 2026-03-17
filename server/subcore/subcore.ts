/**
 * SubCore — 17-seed shared substrate
 *
 * One tensor. Three read modes.
 *   Auditory: reads left to right — melody (temporal diff)
 *   Visual: reads top to bottom — harmony (structural snapshot)
 *   Memory: the page itself (raw state with persistence)
 *
 * All three main cores (LLM/Tools, Psi, Omega) read and write through this.
 * On the server, it's a shared organ.
 * On the phone, it's the compression bridge.
 */

import {
  SubCoreSeed,
  AuditoryProjection,
  AuditoryAnomaly,
  VisualProjection,
  MemoryProjection,
  SyncPayload,
  CoreId,
  SEED_STATE_DEPTH,
  SUBCORE_PRIMES,
} from './types.js';

import { createHash } from 'crypto';

export class SubCore {
  readonly seedCount = 17;
  readonly stateDepth = SEED_STATE_DEPTH;

  private seeds: SubCoreSeed[];
  private heartbeat: number = 0;

  /** Anomaly threshold: delta magnitude beyond this triggers auditory flag */
  private anomalyThreshold: number = 2.0;

  constructor() {
    this.seeds = this.initializeSeeds();
  }

  // ─────────────────────────────────────────────
  // Initialization
  // ─────────────────────────────────────────────

  private initializeSeeds(): SubCoreSeed[] {
    const seeds: SubCoreSeed[] = [];
    for (let i = 0; i < this.seedCount; i++) {
      seeds.push({
        index: i,
        state: new Float64Array(this.stateDepth),
        previousState: new Float64Array(this.stateDepth),
        structuralSignature: new Float64Array(this.stateDepth),
        lastWriteHeartbeat: 0,
        sourceAffinity: [0, 0, 0],
      });
    }
    return seeds;
  }

  // ─────────────────────────────────────────────
  // AUDITORY PROJECTION
  // Reads through time. Diff across heartbeats.
  // Asks: what changed?
  // Psi leans heaviest.
  // ─────────────────────────────────────────────

  projectAuditory(): AuditoryProjection {
    const deltas: Float64Array[] = [];
    const anomalies: AuditoryAnomaly[] = [];
    let totalCoherence = 0;

    for (let i = 0; i < this.seedCount; i++) {
      const seed = this.seeds[i];
      const delta = new Float64Array(this.stateDepth);
      let magnitude = 0;

      for (let d = 0; d < this.stateDepth; d++) {
        delta[d] = seed.state[d] - seed.previousState[d];
        magnitude += delta[d] * delta[d];
      }
      magnitude = Math.sqrt(magnitude);

      deltas.push(delta);

      // Detect rhythm breaks — anomalous change magnitude
      if (magnitude > this.anomalyThreshold) {
        anomalies.push({
          seedIndex: i,
          deltaMagnitude: magnitude,
          expectedRange: [0, this.anomalyThreshold],
          heartbeat: this.heartbeat,
        });
      }

      // Coherence: low delta = high temporal coherence
      // Normalized per seed, inverted so stable = 1.0
      const seedCoherence = 1.0 / (1.0 + magnitude);
      totalCoherence += seedCoherence;
    }

    return {
      deltas,
      anomalies,
      coherence: totalCoherence / this.seedCount,
      heartbeat: this.heartbeat,
    };
  }

  // ─────────────────────────────────────────────
  // VISUAL PROJECTION
  // Reads through structure. All 17 at once.
  // Asks: what shape is this?
  // Omega leans heaviest.
  // ─────────────────────────────────────────────

  projectVisual(): VisualProjection {
    // Pattern: flatten all 17 seeds into one structural snapshot
    const patternSize = this.seedCount * this.stateDepth;
    const pattern = new Float64Array(patternSize);

    for (let i = 0; i < this.seedCount; i++) {
      for (let d = 0; d < this.stateDepth; d++) {
        pattern[i * this.stateDepth + d] = this.seeds[i].state[d];
      }
    }

    // Topology: pairwise structural similarity between seeds
    // Condensed to upper triangle of 17x17
    const topologySize = (this.seedCount * (this.seedCount - 1)) / 2;
    const topology = new Float64Array(topologySize);
    let topIdx = 0;
    let totalSimilarity = 0;

    for (let i = 0; i < this.seedCount; i++) {
      for (let j = i + 1; j < this.seedCount; j++) {
        const sim = this.cosineSimilarity(
          this.seeds[i].state,
          this.seeds[j].state
        );
        topology[topIdx++] = sim;
        totalSimilarity += sim;
      }
    }

    const pairCount = topologySize;
    const coherence = pairCount > 0 ? totalSimilarity / pairCount : 0;

    return {
      pattern,
      topology,
      coherence,
      heartbeat: this.heartbeat,
    };
  }

  // ─────────────────────────────────────────────
  // MEMORY PROJECTION
  // Doesn't slice. It holds.
  // The raw tensor. Both axes at once.
  // ─────────────────────────────────────────────

  projectMemory(): MemoryProjection {
    const states: Float64Array[] = [];
    const previousStates: Float64Array[] = [];
    const staleness: number[] = [];

    for (let i = 0; i < this.seedCount; i++) {
      const seed = this.seeds[i];
      // Return copies to prevent external mutation
      states.push(Float64Array.from(seed.state));
      previousStates.push(Float64Array.from(seed.previousState));
      staleness.push(this.heartbeat - seed.lastWriteHeartbeat);
    }

    return {
      states,
      previousStates,
      staleness,
      heartbeat: this.heartbeat,
    };
  }

  // ─────────────────────────────────────────────
  // WRITE — main cores write into the sub-core
  // ─────────────────────────────────────────────

  /**
   * Write from a main core into a specific seed.
   * Previous state is preserved for auditory diff.
   */
  write(
    seedIndex: number,
    values: number[],
    source: CoreId,
    affinity: [number, number, number]
  ): void {
    if (seedIndex < 0 || seedIndex >= this.seedCount) {
      throw new Error(`Seed index ${seedIndex} out of range [0, ${this.seedCount})`);
    }
    if (values.length !== this.stateDepth) {
      throw new Error(`Expected ${this.stateDepth} values, got ${values.length}`);
    }

    const seed = this.seeds[seedIndex];

    // Preserve previous state for auditory projection
    seed.previousState.set(seed.state);

    // Write new state
    for (let d = 0; d < this.stateDepth; d++) {
      seed.state[d] = values[d];
    }

    // Update structural signature (exponential moving average)
    const alpha = 0.3;
    for (let d = 0; d < this.stateDepth; d++) {
      seed.structuralSignature[d] =
        alpha * seed.state[d] + (1 - alpha) * seed.structuralSignature[d];
    }

    seed.lastWriteHeartbeat = this.heartbeat;
    seed.sourceAffinity = affinity;
  }

  /**
   * Write from the main 53-seed field through memory affinity weights.
   * μ_k is the affinity vector from seed k of the main field.
   * φ is the projection function extracting the relevant signal.
   *
   * M_j = Σ μ_{kj} · φ(S_k) for all k in [0, 53)
   */
  writeFromField(
    affinityMatrix: number[][],  // 53 x 17 — μ_{kj} for each main seed k, sub-core node j
    projectedValues: number[][],  // 53 x SEED_STATE_DEPTH — φ(S_k) for each main seed k
    source: CoreId
  ): void {
    for (let j = 0; j < this.seedCount; j++) {
      const seed = this.seeds[j];
      seed.previousState.set(seed.state);

      // M_j = Σ_{k=0}^{52} μ_{kj} · φ_j(S_k)
      const accumulated = new Float64Array(this.stateDepth);
      let totalAffinity = 0;

      for (let k = 0; k < affinityMatrix.length; k++) {
        const mu_kj = affinityMatrix[k][j];
        if (mu_kj === 0) continue;
        totalAffinity += mu_kj;

        for (let d = 0; d < this.stateDepth; d++) {
          accumulated[d] += mu_kj * projectedValues[k][d];
        }
      }

      // Normalize by total affinity to prevent magnitude scaling
      if (totalAffinity > 0) {
        for (let d = 0; d < this.stateDepth; d++) {
          accumulated[d] /= totalAffinity;
        }
      }

      seed.state.set(accumulated);
      seed.lastWriteHeartbeat = this.heartbeat;

      // Source affinity: attribute proportionally
      const affinity: [number, number, number] = [0, 0, 0];
      affinity[source] = 1.0;
      seed.sourceAffinity = affinity;
    }
  }

  // ─────────────────────────────────────────────
  // HEARTBEAT
  // ─────────────────────────────────────────────

  /** Advance the heartbeat clock. Call every 30 seconds. */
  tick(): {
    auditory: AuditoryProjection;
    visual: VisualProjection;
    memory: MemoryProjection;
  } {
    this.heartbeat++;

    return {
      auditory: this.projectAuditory(),
      visual: this.projectVisual(),
      memory: this.projectMemory(),
    };
  }

  getHeartbeat(): number {
    return this.heartbeat;
  }

  // ─────────────────────────────────────────────
  // SYNC — compression bridge between server and phone
  // ─────────────────────────────────────────────

  /** Export sync payload for transmission */
  exportSync(direction: 'server-to-phone' | 'phone-to-server'): SyncPayload {
    const seedData = this.seeds.map((s) => ({
      index: s.index,
      state: Array.from(s.state),
      sourceAffinity: s.sourceAffinity,
    }));

    const payload: SyncPayload = {
      seeds: seedData,
      heartbeat: this.heartbeat,
      direction,
      hash: '',
    };

    // Compute tension field for phone-to-server sync
    if (direction === 'phone-to-server') {
      payload.tensionField = this.computeTensionField();
    }

    payload.hash = this.hashPayload(payload);
    return payload;
  }

  /** Import sync payload from the other side */
  importSync(payload: SyncPayload): void {
    // Verify integrity
    const expectedHash = payload.hash;
    const checkPayload = { ...payload, hash: '' };
    const actualHash = this.hashPayload(checkPayload);

    if (actualHash !== expectedHash) {
      // Integrity failure — brake, don't crash
      // S9 should log this
      console.error(
        `Sync integrity failure at heartbeat ${this.heartbeat}. ` +
        `Expected ${expectedHash}, got ${actualHash}. Skipping import.`
      );
      return;
    }

    for (const seedData of payload.seeds) {
      if (seedData.index >= 0 && seedData.index < this.seedCount) {
        const seed = this.seeds[seedData.index];
        seed.previousState.set(seed.state);
        seed.state.set(seedData.state);
        seed.sourceAffinity = seedData.sourceAffinity;
        seed.lastWriteHeartbeat = this.heartbeat;
      }
    }
  }

  /**
   * Tension field: where the superimposed core functions conflict.
   * On the phone, this is the signal that the single core's
   * LLM/Tools, Psi, and Omega affinities are pulling in different directions.
   */
  private computeTensionField(): number[] {
    return this.seeds.map((seed) => {
      const [l, p, o] = seed.sourceAffinity;
      // Tension = variance of affinities
      // High tension = cores disagree about this seed
      const mean = (l + p + o) / 3;
      return (
        ((l - mean) ** 2 + (p - mean) ** 2 + (o - mean) ** 2) / 3
      );
    });
  }

  // ─────────────────────────────────────────────
  // Utilities
  // ─────────────────────────────────────────────

  private cosineSimilarity(a: Float64Array, b: Float64Array): number {
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }
    const denom = Math.sqrt(magA) * Math.sqrt(magB);
    return denom === 0 ? 0 : dot / denom;
  }

  private hashPayload(payload: SyncPayload): string {
    const content = JSON.stringify({
      seeds: payload.seeds,
      heartbeat: payload.heartbeat,
      direction: payload.direction,
      tensionField: payload.tensionField,
    });
    return createHash('sha256').update(content).digest('hex').slice(0, 16);
  }
}
