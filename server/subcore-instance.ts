/**
 * SubCore singleton — shared across the server process.
 * Ticked by the heartbeat scheduler every 30s.
 * State read by /api/subcore/state.
 */
import { SubCore } from "./subcore/index.js";

export const subCore = new SubCore();

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

export function tickSubCore(): SubCoreState {
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
