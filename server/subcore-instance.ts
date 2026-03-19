/**
 * SubCore singleton — shared across the server process.
 * Ticked by the heartbeat scheduler every 30s.
 * State read by /api/subcore/state.
 *
 * Seeds are fed from live system state before each tick so the
 * S17 visualisation actually reflects what the engine is doing:
 *   Seeds 0–9  → Psi  dimension energies (10 dims)
 *   Seeds 10–16 → Omega dimension energies (first 7 of 8 dims)
 */
import { SubCore, CoreId } from "./subcore/index.js";
import { getPsiState, getOmegaState } from "./a0p-engine.js";

export const subCore = new SubCore();

const DEPTH = 7; // SEED_STATE_DEPTH

export interface SubCoreState {
  heartbeat: number;
  timestamp: number;
  auditory: {
    coherence: number;
    deltas: number[][];
    anomalies: Array<{
      seedIndex: number;
      deltaMagnitude: number;
      expectedRange: [number, number];
    }>;
  };
  visual: {
    coherence: number;
    pattern: number[];
    topology: number[];
  };
  memory: {
    states: number[][];
    staleness: number[];
  };
}

let latestState: SubCoreState | null = null;

/** Build a 7-element state vector from a single energy value using decaying harmonics. */
function energyToSeedValues(energy: number): number[] {
  return Array.from({ length: DEPTH }, (_, d) => energy * Math.pow(0.85, d));
}

export function tickSubCore(): SubCoreState {
  // ── Feed live system state into seeds before projecting ──
  try {
    const psi = getPsiState();
    const omega = getOmegaState();

    // Seeds 0–9: Psi dimension energies
    const psiEnergies = psi.dimensionEnergies ?? [];
    for (let i = 0; i < Math.min(10, psiEnergies.length); i++) {
      subCore.write(i, energyToSeedValues(psiEnergies[i]), CoreId.PSI, [0, 1, 0]);
    }

    // Seeds 10–16: Omega dimension energies (first 7)
    const omegaEnergies = omega.dimensionEnergies ?? [];
    for (let i = 0; i < Math.min(7, omegaEnergies.length); i++) {
      subCore.write(10 + i, energyToSeedValues(omegaEnergies[i]), CoreId.OMEGA, [0, 0, 1]);
    }
  } catch {
    // Engine not yet initialised — tick with whatever state exists
  }

  const result = subCore.tick();
  const state: SubCoreState = {
    heartbeat: result.heartbeat,
    timestamp: Date.now(),
    auditory: {
      coherence: result.auditory.coherence,
      deltas: result.auditory.deltas.map((d) => Array.from(d)),
      anomalies: result.auditory.anomalies.map((a) => ({
        seedIndex: a.seedIndex,
        deltaMagnitude: a.deltaMagnitude,
        expectedRange: a.expectedRange,
      })),
    },
    visual: {
      coherence: result.visual.coherence,
      pattern: Array.from(result.visual.pattern),
      topology: Array.from(result.visual.topology),
    },
    memory: {
      states: result.memory.states.map((s) => Array.from(s)),
      staleness: result.memory.staleness,
    },
  };
  latestState = state;
  return state;
}

export function getSubCoreState(): SubCoreState | null {
  return latestState;
}
