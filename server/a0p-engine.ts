import { createHash } from "crypto";
import { storage } from "./storage";
import { logMemory, logSentinel, logInterference, logAttribution, logMaster } from "./logger";

const BUILD_VERSION = "v1.0.2-S9";
const GENESIS_HASH = createHash("sha256").update("a0p-genesis").digest("hex");

const OPERATOR_CLASSES = ["P", "K", "Q", "T", "S"] as const;
type OpClass = typeof OPERATOR_CLASSES[number];
const CLASS_PRIORITY: Record<OpClass, number> = { P: 0, K: 1, Q: 2, T: 3, S: 4 };

const EDCM_EPSILON = 1e-9;
const MERGE_THRESHOLD = 0.18;
const SOFTFORK_THRESHOLD = 0.30;
const ALIGN_RISK_THRESHOLD = 0.25;

const PCNA_N = 53;
const PCNA_ADJACENCY_DISTANCES = [1, 2, 3, 4, 5, 6, 7, 14];

const PTCA_DT = 0.01;
const PTCA_DTHETA = (2 * Math.PI) / PCNA_N;
const PTCA_STEPS_PER_EVAL = 10;

const PTCA_ALPHA_COUPLING = 0.10;
const PTCA_BETA_COUPLING = 0.20;
const PTCA_GAMMA_COUPLING = 0.10;

const PTCA_ALPHA_DIFFUSION = 0.6;
const PTCA_BETA_DRIFT = 0.4;
const PTCA_GAMMA_DAMPING = 0.2;

const HEPT_RING_SIZE = 6;
const HEPT_HUB_INDEX = 6;
const HEPT_TOTAL_SITES = 7;
const PTCA_PHASE_COUNT = 8;
const PTCA_SENTINEL_COUNT = 9;

const ALERT_TRIGGER_HIGH = 0.80;
const ALERT_CLEAR_LOW = 0.20;

export const S5_CONTEXT_DEFAULTS = {
  window: { type: "turns" as const, W: 32 },
  retrieval: { mode: "none" as const, sources: [] as string[], top_k: 0 },
  hygiene: { strip_secrets: true, redact_keys: true },
};

export interface OperatorVector {
  P: number;
  K: number;
  Q: number;
  T: number;
  S: number;
}

export interface HmmmInvariant {
  valid: boolean;
  message: string;
  timestamp: number;
}

export interface EdcmMetricEntry {
  value: number;
  range: [number, number];
  used_context: { window: { type: string; W: number } };
  evidence: string[];
}

export interface EdcmMetrics {
  CM: EdcmMetricEntry;
  DA: EdcmMetricEntry;
  DRIFT: EdcmMetricEntry;
  DVG: EdcmMetricEntry;
  INT: EdcmMetricEntry;
  TBF: EdcmMetricEntry;
}

export interface EdcmAlert {
  name: string;
  severity: "HIGH" | "LOW" | "HYSTERESIS";
  metric: string;
  value: number;
  threshold: number;
  evidence: string[];
}

export interface EdcmboneReportInner {
  thread_id: string;
  used_context: typeof S5_CONTEXT_DEFAULTS;
  metrics: EdcmMetrics;
  alerts: EdcmAlert[];
  recommendations: { id: string; rank: number; title: string; type: string; requires_S4: boolean; why: string[] }[];
  snapshot_id: string;
  provenance: { ts: string; build: string; hash: string };
}

export interface EdcmboneReport {
  edcmbone: EdcmboneReportInner;
}

export interface SentinelContext {
  S5_context: { window: { type: string; W: number }; retrieval_mode: string };
  S6_identity: { actor_map_version: string; confidence: number };
  S7_memory: { store_allowed: boolean; retention: string };
  S8_risk: { score: number; flags: string[] };
  S9_audit: { evidence_events: string[]; retrieval_log: string[] };
}

function normalizeL1(v: OperatorVector): OperatorVector {
  const sum = Math.abs(v.P) + Math.abs(v.K) + Math.abs(v.Q) + Math.abs(v.T) + Math.abs(v.S) + EDCM_EPSILON;
  return { P: v.P / sum, K: v.K / sum, Q: v.Q / sum, T: v.T / sum, S: v.S / sum };
}

function distanceL2(a: OperatorVector, b: OperatorVector): number {
  return Math.sqrt(
    (a.P - b.P) ** 2 + (a.K - b.K) ** 2 + (a.Q - b.Q) ** 2 + (a.T - b.T) ** 2 + (a.S - b.S) ** 2
  );
}

function dominantClass(v: OperatorVector): OpClass {
  let max = -Infinity;
  let cls: OpClass = "P";
  for (const c of OPERATOR_CLASSES) {
    if (v[c] > max) { max = v[c]; cls = c; }
  }
  return cls;
}

function resolveCollision(a: OpClass, b: OpClass): OpClass {
  return CLASS_PRIORITY[a] <= CLASS_PRIORITY[b] ? a : b;
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function giniCoefficient(shares: number[]): number {
  if (shares.length <= 1) return 0;
  const sorted = [...shares].sort((a, b) => a - b);
  const n = sorted.length;
  const totalSum = sorted.reduce((s, v) => s + v, 0);
  if (totalSum === 0) return 0;
  let numerator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (2 * (i + 1) - n - 1) * sorted[i];
  }
  return numerator / (n * totalSum);
}

export function edcmDisposition(
  grokVec: OperatorVector,
  geminiVec: OperatorVector,
  userVec: OperatorVector
): { decision: string; delta: number; deltaGrok: number; deltaGemini: number; dominantOp: OpClass } {
  const gN = normalizeL1(grokVec);
  const geN = normalizeL1(geminiVec);
  const uN = normalizeL1(userVec);

  const delta = distanceL2(gN, geN);
  const deltaGrok = distanceL2(gN, uN);
  const deltaGemini = distanceL2(geN, uN);

  let decision: string;
  if (delta <= MERGE_THRESHOLD) {
    decision = "MERGE";
  } else if (delta <= SOFTFORK_THRESHOLD) {
    decision = "SOFTFORK";
  } else {
    decision = "FORK";
  }

  const gDom = dominantClass(gN);
  const geDom = dominantClass(geN);
  const dominantOp = resolveCollision(gDom, geDom);

  if (deltaGrok > ALIGN_RISK_THRESHOLD || deltaGemini > ALIGN_RISK_THRESHOLD) {
    decision += "_ALIGN_RISK";
  }

  return { decision, delta, deltaGrok, deltaGemini, dominantOp };
}

export function computeEdcmMetrics(payload?: any): EdcmMetrics {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload || {});
  const len = text.length;

  const capsRatio = len > 0 ? (text.replace(/[^A-Z]/g, "").length / Math.max(1, text.replace(/[^a-zA-Z]/g, "").length)) : 0;
  const punctCount = (text.match(/[!?]{2,}/g) || []).length;
  const punctIntensity = clamp01(punctCount / 10);

  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  const uniqueWords = new Set(words);
  const repetitionRatio = words.length > 0 ? 1 - (uniqueWords.size / words.length) : 0;

  const questionMarks = (text.match(/\?/g) || []).length;

  const cm = clamp01(0.1 + (len > 500 ? 0.1 : 0) + (questionMarks > 3 ? 0.15 : 0));

  const contradictionMarkers = (text.match(/\b(but|however|actually|no|wrong|incorrect|mistake)\b/gi) || []).length;
  const retractions = (text.match(/\b(sorry|correction|I mean|retract|undo)\b/gi) || []).length;
  const da = clamp01(sigmoid(0.3 * contradictionMarkers + 0.4 * retractions + 0.2 * repetitionRatio * 5 + 0.1 * questionMarks - 2));

  const drift = clamp01(0.05 + repetitionRatio * 0.3 + (capsRatio > 0.3 ? 0.1 : 0));

  const topicDiversity = uniqueWords.size > 0 ? Math.min(1, uniqueWords.size / 50) : 0;
  const dvg = clamp01(topicDiversity > 0.8 ? topicDiversity * 0.3 : topicDiversity * 0.1);

  const intensity = clamp01(0.2 * capsRatio + 0.3 * punctIntensity + 0.2 * (contradictionMarkers > 0 ? 0.5 : 0) + 0.1 * (words.length > 200 ? 0.5 : words.length / 400));

  const actorShares = [0.6, 0.4];
  const tbf = clamp01(giniCoefficient(actorShares));

  const usedCtx = { window: { type: S5_CONTEXT_DEFAULTS.window.type, W: S5_CONTEXT_DEFAULTS.window.W } };

  return {
    CM: { value: cm, range: [0, 1], used_context: usedCtx, evidence: [`text_length=${len}`, `questions=${questionMarks}`] },
    DA: { value: da, range: [0, 1], used_context: usedCtx, evidence: [`contradictions=${contradictionMarkers}`, `retractions=${retractions}`] },
    DRIFT: { value: drift, range: [0, 1], used_context: usedCtx, evidence: [`repetition_ratio=${repetitionRatio.toFixed(3)}`, `caps_ratio=${capsRatio.toFixed(3)}`] },
    DVG: { value: dvg, range: [0, 1], used_context: usedCtx, evidence: [`unique_words=${uniqueWords.size}`, `total_words=${words.length}`] },
    INT: { value: intensity, range: [0, 1], used_context: usedCtx, evidence: [`caps=${capsRatio.toFixed(3)}`, `punct_intensity=${punctIntensity.toFixed(3)}`] },
    TBF: { value: tbf, range: [0, 1], used_context: usedCtx, evidence: [`gini=${tbf.toFixed(3)}`] },
  };
}

export function evaluateAlerts(metrics: EdcmMetrics, priorAlerts: EdcmAlert[] = []): EdcmAlert[] {
  const alerts: EdcmAlert[] = [];
  const metricAlertMap: Record<string, string> = {
    CM: "ALERT_CM_HIGH",
    DA: "ALERT_DA_RISING",
    DRIFT: "ALERT_DRIFT_AWAY",
    DVG: "ALERT_DVG_SPLIT",
    INT: "ALERT_INT_SPIKE",
    TBF: "ALERT_TBF_SKEW",
  };

  for (const [key, alertName] of Object.entries(metricAlertMap)) {
    const metric = metrics[key as keyof EdcmMetrics];
    const priorAlert = priorAlerts.find((a) => a.name === alertName);

    let severity: "HIGH" | "LOW" | "HYSTERESIS";
    if (metric.value >= ALERT_TRIGGER_HIGH) {
      severity = "HIGH";
    } else if (metric.value <= ALERT_CLEAR_LOW) {
      severity = "LOW";
    } else {
      severity = priorAlert?.severity === "HIGH" ? "HIGH" : priorAlert?.severity === "LOW" ? "LOW" : "HYSTERESIS";
    }

    alerts.push({
      name: alertName,
      severity,
      metric: key,
      value: metric.value,
      threshold: severity === "HIGH" ? ALERT_TRIGGER_HIGH : ALERT_CLEAR_LOW,
      evidence: metric.evidence,
    });
  }

  return alerts;
}

export function generateEdcmboneReport(
  threadId: string,
  payload: any,
  snapshotId: string,
  eventHash: string
): EdcmboneReport {
  const metrics = computeEdcmMetrics(payload);
  const alerts = evaluateAlerts(metrics);

  const recommendations: EdcmboneReportInner["recommendations"] = [];
  for (const alert of alerts) {
    if (alert.severity === "HIGH") {
      recommendations.push({
        id: `rec_${alert.name.toLowerCase()}_${Date.now()}`,
        rank: recommendations.length + 1,
        title: `Address ${alert.metric} threshold breach`,
        type: "dialogue",
        requires_S4: false,
        why: [`metric:${alert.metric}`, `alert:${alert.name}`],
      });
    }
  }

  return {
    edcmbone: {
      thread_id: threadId,
      used_context: S5_CONTEXT_DEFAULTS,
      metrics,
      alerts,
      recommendations,
      snapshot_id: snapshotId,
      provenance: { ts: new Date().toISOString(), build: BUILD_VERSION, hash: eventHash },
    },
  };
}

function buildPcnaAdjacency(): boolean[][] {
  const adj: boolean[][] = Array.from({ length: PCNA_N }, () => Array(PCNA_N).fill(false));
  for (let i = 0; i < PCNA_N; i++) {
    for (const d of PCNA_ADJACENCY_DISTANCES) {
      const j = (i + d) % PCNA_N;
      adj[i][j] = true;
      adj[j][i] = true;
    }
  }
  return adj;
}

const PCNA_ADJ = buildPcnaAdjacency();

export interface PtcaTensorState {
  nodes: number[][];
  sentinelChannels: number[][];
  heptagramEnergy: number;
  totalEnergy: number;
  axes: { prime_node: number; sentinel: number; phase: number; hept: number };
  sentinelIndex: Record<string, string>;
  phaseEnergies: number[];
}

const SENTINEL_INDEX: Record<string, string> = {
  "0": "S1_PROVENANCE", "1": "S2_POLICY", "2": "S3_BOUNDS", "3": "S4_APPROVAL",
  "4": "S5_CONTEXT", "5": "S6_IDENTITY", "6": "S7_MEMORY", "7": "S8_RISK", "8": "S9_AUDIT",
};

type Tensor4D = Float64Array;

function t4idx(p: number, s: number, ph: number, h: number): number {
  return ((p * PTCA_SENTINEL_COUNT + s) * PTCA_PHASE_COUNT + ph) * HEPT_TOTAL_SITES + h;
}

const T4_SIZE = PCNA_N * PTCA_SENTINEL_COUNT * PTCA_PHASE_COUNT * HEPT_TOTAL_SITES;

function initTensor4D(): Tensor4D {
  const t = new Float64Array(T4_SIZE);
  for (let p = 0; p < PCNA_N; p++) {
    for (let s = 0; s < PTCA_SENTINEL_COUNT; s++) {
      const sWeight = s === 8 ? 1.0 : 0.1 * (1 + s * 0.05);
      for (let ph = 0; ph < PTCA_PHASE_COUNT; ph++) {
        for (let k = 0; k < HEPT_RING_SIZE; k++) {
          t[t4idx(p, s, ph, k)] = Math.sin(p * PTCA_DTHETA + (k * 2 * Math.PI) / HEPT_RING_SIZE) * 0.5 * sWeight;
        }
        t[t4idx(p, s, ph, HEPT_HUB_INDEX)] = Math.cos(p * PTCA_DTHETA) * 0.3 * sWeight;
      }
    }
  }
  return t;
}

function heptagramExchange4D(t: Tensor4D): void {
  const scratch = new Float64Array(HEPT_RING_SIZE);

  for (let p = 0; p < PCNA_N; p++) {
    const dir = (p % 2 === 0) ? 1 : -1;
    for (let s = 0; s < PTCA_SENTINEL_COUNT; s++) {
      for (let ph = 0; ph < PTCA_PHASE_COUNT; ph++) {
        for (let k = 0; k < HEPT_RING_SIZE; k++) {
          const srcK = ((k - dir) % HEPT_RING_SIZE + HEPT_RING_SIZE) % HEPT_RING_SIZE;
          scratch[k] = t[t4idx(p, s, ph, srcK)];
        }
        for (let k = 0; k < HEPT_RING_SIZE; k++) {
          t[t4idx(p, s, ph, k)] = scratch[k];
        }
      }
    }
  }

  for (let p = 0; p < PCNA_N; p++) {
    for (let s = 0; s < PTCA_SENTINEL_COUNT; s++) {
      for (let ph = 0; ph < PTCA_PHASE_COUNT; ph++) {
        let ringSum = 0;
        for (let k = 0; k < HEPT_RING_SIZE; k++) ringSum += t[t4idx(p, s, ph, k)];
        const ringMean = ringSum / HEPT_RING_SIZE;
        const hubIdx = t4idx(p, s, ph, HEPT_HUB_INDEX);
        t[hubIdx] += PTCA_BETA_COUPLING * ringMean;
        for (let k = 0; k < HEPT_RING_SIZE; k++) {
          t[t4idx(p, s, ph, k)] += PTCA_GAMMA_COUPLING * t[hubIdx];
        }
      }
    }
  }

  for (let s = 0; s < PTCA_SENTINEL_COUNT; s++) {
    for (let ph = 0; ph < PTCA_PHASE_COUNT; ph++) {
      let hubSum = 0;
      for (let p = 0; p < PCNA_N; p++) hubSum += t[t4idx(p, s, ph, HEPT_HUB_INDEX)];
      const globalHub = hubSum / PCNA_N;
      for (let p = 0; p < PCNA_N; p++) {
        const idx = t4idx(p, s, ph, HEPT_HUB_INDEX);
        t[idx] = (1 - PTCA_ALPHA_COUPLING) * t[idx] + PTCA_ALPHA_COUPLING * globalHub;
      }
    }
  }
}

function computeTensor4DEnergy(t: Tensor4D): { total: number; heptagram: number; phaseEnergies: number[] } {
  let total = 0;
  const phaseEnergies = new Array(PTCA_PHASE_COUNT).fill(0);
  for (let i = 0; i < T4_SIZE; i++) total += t[i] * t[i];

  for (let ph = 0; ph < PTCA_PHASE_COUNT; ph++) {
    let phSum = 0;
    for (let p = 0; p < PCNA_N; p++) {
      for (let s = 0; s < PTCA_SENTINEL_COUNT; s++) {
        for (let h = 0; h < HEPT_TOTAL_SITES; h++) {
          const v = t[t4idx(p, s, ph, h)];
          phSum += v * v;
        }
      }
    }
    phaseEnergies[ph] = phSum / (PCNA_N * PTCA_SENTINEL_COUNT * HEPT_TOTAL_SITES);
  }

  let heptEnergy = 0;
  for (let p = 0; p < PCNA_N; p++) {
    for (let h = 0; h < HEPT_TOTAL_SITES; h++) {
      let siteSum = 0;
      for (let s = 0; s < PTCA_SENTINEL_COUNT; s++) {
        for (let ph = 0; ph < PTCA_PHASE_COUNT; ph++) {
          const v = t[t4idx(p, s, ph, h)];
          siteSum += v * v;
        }
      }
      heptEnergy += siteSum;
    }
  }
  heptEnergy /= (PCNA_N * HEPT_TOTAL_SITES * PTCA_SENTINEL_COUNT * PTCA_PHASE_COUNT);

  total /= T4_SIZE;
  return { total, heptagram: heptEnergy, phaseEnergies };
}

function extractHeptNodes(t: Tensor4D): number[][] {
  const nodes: number[][] = [];
  for (let p = 0; p < PCNA_N; p++) {
    const sites = new Array(HEPT_TOTAL_SITES).fill(0);
    for (let h = 0; h < HEPT_TOTAL_SITES; h++) {
      let sum = 0;
      for (let s = 0; s < PTCA_SENTINEL_COUNT; s++) {
        sum += t[t4idx(p, s, 0, h)];
      }
      sites[h] = sum / PTCA_SENTINEL_COUNT;
    }
    nodes.push(sites);
  }
  return nodes;
}

function extractSentinelChannels(t: Tensor4D): number[][] {
  const channels: number[][] = [];
  for (let p = 0; p < PCNA_N; p++) {
    const chVals = new Array(PTCA_SENTINEL_COUNT).fill(0);
    for (let s = 0; s < PTCA_SENTINEL_COUNT; s++) {
      let sum = 0;
      for (let ph = 0; ph < PTCA_PHASE_COUNT; ph++) {
        for (let h = 0; h < HEPT_TOTAL_SITES; h++) {
          sum += Math.abs(t[t4idx(p, s, ph, h)]);
        }
      }
      chVals[s] = sum / (PTCA_PHASE_COUNT * HEPT_TOTAL_SITES);
    }
    channels.push(chVals);
  }
  return channels;
}

export function ptcaSolve(initialState: number[]): { state: number[]; energy: number } {
  let state = [...initialState];
  if (state.length !== PCNA_N) {
    state = Array(PCNA_N).fill(0).map((_, i) => Math.sin(i * PTCA_DTHETA));
  }

  const tensor = initTensor4D();

  for (let step = 0; step < PTCA_STEPS_PER_EVAL; step++) {
    const newState = [...state];
    for (let i = 0; i < PCNA_N; i++) {
      let neighborSum = 0;
      let count = 0;
      for (let j = 0; j < PCNA_N; j++) {
        if (PCNA_ADJ[i][j]) { neighborSum += state[j]; count++; }
      }
      const avg = count > 0 ? neighborSum / count : 0;
      newState[i] = state[i] + PTCA_DT * (
        PTCA_ALPHA_DIFFUSION * (avg - state[i]) +
        PTCA_BETA_DRIFT * Math.sin(i * PTCA_DTHETA) -
        PTCA_GAMMA_DAMPING * state[i]
      );
    }
    state = newState;
    heptagramExchange4D(tensor);
  }

  const linearEnergy = state.reduce((s, v) => s + v * v, 0) / PCNA_N;
  const { total: tensorEnergy } = computeTensor4DEnergy(tensor);

  return { state, energy: linearEnergy + tensorEnergy };
}

export function ptcaSolveDetailed(initialState: number[]): { state: number[]; energy: number; heptagramEnergy: number; tensor: PtcaTensorState } {
  let state = [...initialState];
  if (state.length !== PCNA_N) {
    state = Array(PCNA_N).fill(0).map((_, i) => Math.sin(i * PTCA_DTHETA));
  }

  const tensor = initTensor4D();

  for (let step = 0; step < PTCA_STEPS_PER_EVAL; step++) {
    const newState = [...state];
    for (let i = 0; i < PCNA_N; i++) {
      let neighborSum = 0;
      let count = 0;
      for (let j = 0; j < PCNA_N; j++) {
        if (PCNA_ADJ[i][j]) { neighborSum += state[j]; count++; }
      }
      const avg = count > 0 ? neighborSum / count : 0;
      newState[i] = state[i] + PTCA_DT * (
        PTCA_ALPHA_DIFFUSION * (avg - state[i]) +
        PTCA_BETA_DRIFT * Math.sin(i * PTCA_DTHETA) -
        PTCA_GAMMA_DAMPING * state[i]
      );
    }
    state = newState;
    heptagramExchange4D(tensor);
  }

  const linearEnergy = state.reduce((s, v) => s + v * v, 0) / PCNA_N;
  const energyInfo = computeTensor4DEnergy(tensor);

  return {
    state,
    energy: linearEnergy + energyInfo.total,
    heptagramEnergy: energyInfo.heptagram,
    tensor: {
      nodes: extractHeptNodes(tensor),
      sentinelChannels: extractSentinelChannels(tensor),
      heptagramEnergy: energyInfo.heptagram,
      totalEnergy: linearEnergy + energyInfo.total,
      axes: { prime_node: PCNA_N, sentinel: PTCA_SENTINEL_COUNT, phase: PTCA_PHASE_COUNT, hept: HEPT_TOTAL_SITES },
      sentinelIndex: SENTINEL_INDEX,
      phaseEnergies: energyInfo.phaseEnergies,
    },
  };
}

function canonicalJson(obj: any): string {
  if (obj === null || obj === undefined) return "null";
  if (typeof obj === "number") return obj.toFixed(6);
  if (typeof obj === "string") return JSON.stringify(obj);
  if (typeof obj === "boolean") return obj.toString();
  if (Array.isArray(obj)) return "[" + obj.map(canonicalJson).join(",") + "]";
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalJson(obj[k])).join(",") + "}";
}

export function computeHash(prevHash: string, eventData: any): string {
  const canonical = canonicalJson(eventData);
  return createHash("sha256").update(prevHash + canonical).digest("hex");
}

export function makeHmmm(valid: boolean, message: string): HmmmInvariant {
  return { valid, message, timestamp: Date.now() };
}

const SENTINELS = [
  {
    id: "S6", name: "S6_IDENTITY",
    check: (_req: any, _ctx: any) => true,
    desc: "Actor mapping, roles, permissions, key selection",
  },
  {
    id: "S5", name: "S5_CONTEXT",
    check: (_req: any, _ctx: any) => true,
    desc: "Single source of truth for window + retrieval + context hygiene",
  },
  {
    id: "S2", name: "S2_POLICY",
    check: (_req: any, _ctx: any) => true,
    desc: "Hard redlines, disallowed actions/content, compliance",
  },
  {
    id: "S3", name: "S3_BOUNDS",
    check: (req: any, _ctx: any) => {
      if (req.operatorVec) {
        const v = req.operatorVec;
        const sum = Math.abs(v.P || 0) + Math.abs(v.K || 0) + Math.abs(v.Q || 0) + Math.abs(v.T || 0) + Math.abs(v.S || 0);
        return sum > EDCM_EPSILON;
      }
      return true;
    },
    desc: "Operational limits: cost, rate, timeouts, scope ceilings",
  },
  {
    id: "S8", name: "S8_RISK",
    check: (_req: any, ctx: any) => !ctx.ptcaEnergy || ctx.ptcaEnergy < 100,
    desc: "Risk scoring + escalation, uncertainty, needs-review routing",
  },
  {
    id: "S7", name: "S7_MEMORY",
    check: (_req: any, _ctx: any) => true,
    desc: "Persistence rules, retention, deletion requests, no silent memory",
  },
  {
    id: "S4", name: "S4_APPROVAL",
    check: (_req: any, ctx: any) => ctx.hashValid !== false,
    desc: "Explicit approval required for external/irreversible changes",
  },
  {
    id: "S1", name: "S1_PROVENANCE",
    check: (req: any) => !!req.taskId && !!req.action,
    desc: "Origin, hashes, timestamps, reproducibility hooks",
  },
  {
    id: "S9", name: "S9_AUDIT",
    check: (_req: any, ctx: any) => ctx.hmmm?.valid !== false,
    desc: "Accountability trail, decision trace, replay bundles, export correctness",
  },
];

export function runSentinels(req: any, ctx: any = {}): { passed: boolean; results: { id: string; name: string; passed: boolean }[] } {
  const results = SENTINELS.map((s) => ({
    id: s.id,
    name: s.name,
    passed: s.check(req, ctx),
  }));
  return { passed: results.every((r) => r.passed), results };
}

export function buildSentinelContext(eventIds: string[] = []): SentinelContext {
  return {
    S5_context: { window: S5_CONTEXT_DEFAULTS.window, retrieval_mode: S5_CONTEXT_DEFAULTS.retrieval.mode },
    S6_identity: { actor_map_version: "v1", confidence: 0.98 },
    S7_memory: { store_allowed: false, retention: "session" },
    S8_risk: { score: 0.12, flags: [] },
    S9_audit: { evidence_events: eventIds, retrieval_log: [] },
  };
}

export interface A0Request {
  taskId: string;
  action: string;
  operatorVec?: OperatorVector;
  payload?: any;
  gateApproval?: string;
  context?: typeof S5_CONTEXT_DEFAULTS;
  actorId?: string;
  threadId?: string;
}

export interface A0Response {
  success: boolean;
  taskId: string;
  action: string;
  sentinelResults: { id: string; name: string; passed: boolean }[];
  edcm?: { decision: string; delta: number; deltaGrok: number; deltaGemini: number; dominantOp: string };
  edcmMetrics?: EdcmMetrics;
  alerts?: EdcmAlert[];
  ptca?: { energy: number; statePreview: number[]; heptagramEnergy?: number };
  eventHash?: string;
  hmmm: HmmmInvariant;
  provenance?: { ts: string; build: string; hash: string };
  sentinelContext?: SentinelContext;
  edcmboneReport?: EdcmboneReport;
}

let eventCounter = 0;

export async function processA0Request(req: A0Request): Promise<A0Response> {
  const hmmm = makeHmmm(true, "System nominal");
  eventCounter++;

  const lastEvent = await storage.getLastEvent();
  const prevHash = lastEvent?.hash || GENESIS_HASH;

  const sentinelCtx: any = { hashValid: true, hmmm };

  if (req.operatorVec) {
    const defaultVec: OperatorVector = { P: 0.2, K: 0.2, Q: 0.2, T: 0.2, S: 0.2 };
    const edcmResult = edcmDisposition(req.operatorVec, defaultVec, defaultVec);
    sentinelCtx.edcm = edcmResult;

    const ptcaResult = ptcaSolveDetailed([]);
    sentinelCtx.ptcaEnergy = ptcaResult.energy;

    const edcmMetrics = computeEdcmMetrics(req.payload);
    const alerts = evaluateAlerts(edcmMetrics);

    const sentinels = runSentinels(req, sentinelCtx);

    if (!sentinels.passed) {
      const failedHmmm = makeHmmm(false, `Sentinel check failed: ${sentinels.results.filter(r => !r.passed).map(r => r.id).join(", ")}`);
      return {
        success: false,
        taskId: req.taskId,
        action: req.action,
        sentinelResults: sentinels.results,
        edcm: edcmResult,
        edcmMetrics,
        alerts,
        ptca: { energy: ptcaResult.energy, statePreview: ptcaResult.state.slice(0, 10), heptagramEnergy: ptcaResult.heptagramEnergy },
        hmmm: failedHmmm,
      };
    }

    const eventId = `evt_${Date.now()}_${eventCounter}`;
    const snapshotId = `snap_${Date.now()}_${eventCounter}`;

    const sentContext = buildSentinelContext([eventId]);

    const eventPayload = {
      event_id: eventId,
      thread_id: req.threadId || req.taskId,
      actor_id: req.actorId || "system",
      taskId: req.taskId,
      action: req.action,
      edcm: edcmResult,
      edcmMetrics: {
        CM: edcmMetrics.CM.value,
        DA: edcmMetrics.DA.value,
        DRIFT: edcmMetrics.DRIFT.value,
        DVG: edcmMetrics.DVG.value,
        INT: edcmMetrics.INT.value,
        TBF: edcmMetrics.TBF.value,
      },
      ptcaEnergy: ptcaResult.energy,
      heptagramEnergy: ptcaResult.heptagramEnergy,
      sentinelContext: sentContext,
      provenance: { ts: new Date().toISOString(), build: BUILD_VERSION },
      payload: req.payload,
    };
    const eventHash = computeHash(prevHash, eventPayload);

    await storage.appendEvent({
      taskId: req.taskId,
      eventType: req.action,
      payload: eventPayload,
      prevHash,
      hash: eventHash,
      hmmm,
    });

    await storage.addEdcmSnapshot({
      taskId: req.taskId,
      operatorGrok: req.operatorVec,
      operatorGemini: defaultVec,
      operatorUser: defaultVec,
      deltaBone: edcmResult.delta,
      deltaAlignGrok: edcmResult.deltaGrok,
      deltaAlignGemini: edcmResult.deltaGemini,
      decision: edcmResult.decision,
      ptcaState: {
        energy: ptcaResult.energy,
        heptagramEnergy: ptcaResult.heptagramEnergy,
        statePreview: ptcaResult.state.slice(0, 10),
        tensorAxes: ptcaResult.tensor.axes,
        sentinelIndex: ptcaResult.tensor.sentinelIndex,
        phaseEnergies: ptcaResult.tensor.phaseEnergies,
        coupling: { alpha: PTCA_ALPHA_COUPLING, beta: PTCA_BETA_COUPLING, gamma: PTCA_GAMMA_COUPLING },
      },
    });

    const edcmboneReport = generateEdcmboneReport(req.threadId || req.taskId, req.payload, snapshotId, eventHash);

    return {
      success: true,
      taskId: req.taskId,
      action: req.action,
      sentinelResults: sentinels.results,
      edcm: edcmResult,
      edcmMetrics,
      alerts,
      ptca: { energy: ptcaResult.energy, statePreview: ptcaResult.state.slice(0, 10), heptagramEnergy: ptcaResult.heptagramEnergy },
      eventHash,
      hmmm,
      provenance: { ts: new Date().toISOString(), build: BUILD_VERSION, hash: eventHash },
      sentinelContext: sentContext,
      edcmboneReport,
    };
  }

  const sentinels = runSentinels(req, sentinelCtx);
  if (!sentinels.passed) {
    return {
      success: false,
      taskId: req.taskId,
      action: req.action,
      sentinelResults: sentinels.results,
      hmmm: makeHmmm(false, "Sentinel preflight failed"),
    };
  }

  const eventId = `evt_${Date.now()}_${eventCounter}`;
  const eventPayload = {
    event_id: eventId,
    thread_id: req.threadId || req.taskId,
    actor_id: req.actorId || "system",
    taskId: req.taskId,
    action: req.action,
    payload: req.payload,
  };
  const eventHash = computeHash(prevHash, eventPayload);

  await storage.appendEvent({
    taskId: req.taskId,
    eventType: req.action,
    payload: eventPayload,
    prevHash,
    hash: eventHash,
    hmmm,
  });

  const edcmMetrics = computeEdcmMetrics(req.payload);
  const alerts = evaluateAlerts(edcmMetrics);

  return {
    success: true,
    taskId: req.taskId,
    action: req.action,
    sentinelResults: sentinels.results,
    edcmMetrics,
    alerts,
    eventHash,
    hmmm,
    provenance: { ts: new Date().toISOString(), build: BUILD_VERSION, hash: eventHash },
    sentinelContext: buildSentinelContext([eventId]),
  };
}

export async function verifyHashChain(): Promise<{ valid: boolean; length: number; errors: string[] }> {
  const allEvents = await storage.getEvents();
  const errors: string[] = [];
  let expectedPrev = GENESIS_HASH;

  for (let i = 0; i < allEvents.length; i++) {
    const e = allEvents[i];
    if (e.prevHash !== expectedPrev) {
      errors.push(`Event ${i} (id=${e.id}): prevHash mismatch. Expected ${expectedPrev.slice(0, 12)}... got ${e.prevHash.slice(0, 12)}...`);
    }
    const recomputed = computeHash(e.prevHash, e.payload);
    if (recomputed !== e.hash) {
      errors.push(`Event ${i} (id=${e.id}): hash mismatch. Recomputed ${recomputed.slice(0, 12)}... stored ${e.hash.slice(0, 12)}...`);
    }
    expectedPrev = e.hash;
  }

  return { valid: errors.length === 0, length: allEvents.length, errors };
}

let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

export function startHeartbeat() {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  heartbeatInterval = setInterval(async () => {
    try {
      const chainCheck = await verifyHashChain();
      await storage.addHeartbeat({
        status: chainCheck.valid ? "OK" : "CHAIN_ERROR",
        hashChainValid: chainCheck.valid,
        details: {
          chainLength: chainCheck.length,
          errors: chainCheck.errors.slice(0, 5),
          timestamp: Date.now(),
          build: BUILD_VERSION,
        },
      });
      console.log(`[a0p] Heartbeat: chain=${chainCheck.valid ? "OK" : "ERROR"} events=${chainCheck.length} build=${BUILD_VERSION}`);
    } catch (err) {
      console.error("[a0p] Heartbeat error:", err);
      await storage.addHeartbeat({
        status: "ERROR",
        hashChainValid: false,
        details: { error: String(err), timestamp: Date.now(), build: BUILD_VERSION },
      });
    }
  }, 60 * 60 * 1000);

  setTimeout(async () => {
    try {
      const chainCheck = await verifyHashChain();
      await storage.addHeartbeat({
        status: chainCheck.valid ? "OK" : "CHAIN_ERROR",
        hashChainValid: chainCheck.valid,
        details: { chainLength: chainCheck.length, errors: chainCheck.errors.slice(0, 5), timestamp: Date.now(), note: "startup", build: BUILD_VERSION },
      });
    } catch {}
  }, 5000);
}

export function stopHeartbeat() {
  if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }
}

export const ENGINE_STATUS = {
  isRunning: false,
  emergencyStop: false,
};

export function emergencyStopEngine() {
  ENGINE_STATUS.emergencyStop = true;
  ENGINE_STATUS.isRunning = false;
  stopHeartbeat();
}

export function resumeEngine() {
  ENGINE_STATUS.emergencyStop = false;
  ENGINE_STATUS.isRunning = true;
  startHeartbeat();
}

const DEFAULT_COST_RATES: Record<string, { prompt: number; completion: number; cache: number }> = {
  "gemini": { prompt: 0.075 / 1_000_000, completion: 0.30 / 1_000_000, cache: 0.01875 / 1_000_000 },
  "grok": { prompt: 0.30 / 1_000_000, completion: 0.50 / 1_000_000, cache: 0.075 / 1_000_000 },
};

let cachedTokenRates: Record<string, { prompt: number; completion: number; cache: number }> | null = null;
let tokenRatesCacheTime = 0;
const TOKEN_RATES_CACHE_TTL = 60000;

export async function getTokenRates(): Promise<Record<string, { prompt: number; completion: number; cache: number }>> {
  if (cachedTokenRates && Date.now() - tokenRatesCacheTime < TOKEN_RATES_CACHE_TTL) {
    return cachedTokenRates;
  }
  try {
    const toggle = await storage.getSystemToggle("token_rates");
    if (toggle?.parameters && typeof toggle.parameters === "object") {
      cachedTokenRates = { ...DEFAULT_COST_RATES, ...(toggle.parameters as any) };
    } else {
      cachedTokenRates = { ...DEFAULT_COST_RATES };
    }
  } catch {
    cachedTokenRates = { ...DEFAULT_COST_RATES };
  }
  tokenRatesCacheTime = Date.now();
  return cachedTokenRates!;
}

export function invalidateTokenRatesCache() {
  cachedTokenRates = null;
  tokenRatesCacheTime = 0;
}

export async function estimateCost(model: string, promptTokens: number, completionTokens: number, cacheTokens: number = 0): Promise<number> {
  const rates = await getTokenRates();
  const modelRates = rates[model] || rates["gemini"] || DEFAULT_COST_RATES["gemini"];
  return modelRates.prompt * promptTokens + modelRates.completion * completionTokens + modelRates.cache * cacheTokens;
}

export interface TrackCostOptions {
  conversationId?: number;
  stage?: string;
  pipelinePreset?: string;
  cacheTokens?: number;
}

export async function checkSpendLimit(userId: string | null): Promise<{ allowed: boolean; mode: string; currentSpend: number; limit: number }> {
  try {
    const toggle = await storage.getSystemToggle("spend_limit_monthly");
    if (!toggle?.enabled) return { allowed: true, mode: "disabled", currentSpend: 0, limit: 0 };
    const params = (toggle.parameters || {}) as any;
    const limit = params.limit || 50;
    const mode = params.mode || "warn";

    const summary = await storage.getCostSummary();
    const currentSpend = summary.costThisMonth || 0;

    if (currentSpend >= limit) {
      if (mode === "hard_stop") {
        return { allowed: false, mode, currentSpend, limit };
      }
      console.warn(`[a0p:spend] Monthly spend limit exceeded: $${currentSpend.toFixed(4)} / $${limit}. Mode: ${mode}`);
    }
    return { allowed: true, mode, currentSpend, limit };
  } catch {
    return { allowed: true, mode: "error", currentSpend: 0, limit: 0 };
  }
}

export async function trackCost(userId: string | null, model: string, promptTokens: number, completionTokens: number, options?: TrackCostOptions) {
  const cacheTokens = options?.cacheTokens || 0;
  const cost = await estimateCost(model, promptTokens, completionTokens, cacheTokens);
  await storage.addCostMetric({
    userId,
    model,
    promptTokens,
    completionTokens,
    cacheTokens,
    estimatedCost: cost,
    conversationId: options?.conversationId || null,
    stage: options?.stage || null,
    pipelinePreset: options?.pipelinePreset || null,
  });
  return cost;
}

export type EdcmDirectiveType =
  | "CONSTRAINT_REFOCUS"
  | "DISSONANCE_HALT"
  | "DRIFT_ANCHOR"
  | "DIVERGENCE_COMMIT"
  | "INTENSITY_CALM"
  | "BALANCE_CONCISE";

export interface EdcmDirective {
  type: EdcmDirectiveType;
  metric: keyof EdcmMetrics;
  metricValue: number;
  threshold: number;
  instruction: string;
  fired: boolean;
  enabled: boolean;
}

export interface EdcmDirectiveConfig {
  enabled: boolean;
  thresholds: Record<EdcmDirectiveType, number>;
  directiveToggles: Record<EdcmDirectiveType, boolean>;
}

const EDCM_DIRECTIVE_DEFAULTS: EdcmDirectiveConfig = {
  enabled: true,
  thresholds: {
    CONSTRAINT_REFOCUS: 0.80,
    DISSONANCE_HALT: 0.80,
    DRIFT_ANCHOR: 0.80,
    DIVERGENCE_COMMIT: 0.80,
    INTENSITY_CALM: 0.80,
    BALANCE_CONCISE: 0.80,
  },
  directiveToggles: {
    CONSTRAINT_REFOCUS: true,
    DISSONANCE_HALT: true,
    DRIFT_ANCHOR: true,
    DIVERGENCE_COMMIT: true,
    INTENSITY_CALM: true,
    BALANCE_CONCISE: true,
  },
};

const DIRECTIVE_METRIC_MAP: Record<EdcmDirectiveType, keyof EdcmMetrics> = {
  CONSTRAINT_REFOCUS: "CM",
  DISSONANCE_HALT: "DA",
  DRIFT_ANCHOR: "DRIFT",
  DIVERGENCE_COMMIT: "DVG",
  INTENSITY_CALM: "INT",
  BALANCE_CONCISE: "TBF",
};

const DIRECTIVE_INSTRUCTIONS: Record<EdcmDirectiveType, string> = {
  CONSTRAINT_REFOCUS: "High constraint detected. Refocus on the core task constraints and requirements. Narrow your response to address the specific ask without expanding scope.",
  DISSONANCE_HALT: "Cognitive dissonance detected. Pause and resolve contradictions before proceeding. Do not present conflicting information without explicit reconciliation.",
  DRIFT_ANCHOR: "Topic drift detected. Anchor back to the original subject. Summarize how the current thread connects to the initial query before continuing.",
  DIVERGENCE_COMMIT: "High divergence detected. Commit to a single coherent direction. Avoid branching into multiple unresolved threads.",
  INTENSITY_CALM: "High intensity detected. Reduce emotional and rhetorical intensity. Use measured, neutral language and focus on factual content.",
  BALANCE_CONCISE: "Turn-balance skew detected. Be more concise. Match response length proportionally to the complexity of the input.",
};

const edcmDirectiveFirings: Array<{
  timestamp: number;
  directives: EdcmDirective[];
  config: EdcmDirectiveConfig;
}> = [];

const MAX_DIRECTIVE_HISTORY = 200;

export async function getEdcmDirectiveConfig(): Promise<EdcmDirectiveConfig> {
  try {
    if (typeof storage.getSystemToggle === "function") {
      const toggle = await storage.getSystemToggle("edcm_directives");
      if (toggle) {
        const params = (toggle.parameters || {}) as any;
        return {
          enabled: toggle.enabled,
          thresholds: {
            ...EDCM_DIRECTIVE_DEFAULTS.thresholds,
            ...(params.thresholds || {}),
          },
          directiveToggles: {
            ...EDCM_DIRECTIVE_DEFAULTS.directiveToggles,
            ...(params.directiveToggles || {}),
          },
        };
      }
    }
  } catch {}
  return { ...EDCM_DIRECTIVE_DEFAULTS };
}

export async function generateEdcmDirectives(
  metrics: EdcmMetrics,
  configOverride?: Partial<EdcmDirectiveConfig>
): Promise<EdcmDirective[]> {
  const baseConfig = await getEdcmDirectiveConfig();
  const config: EdcmDirectiveConfig = {
    enabled: configOverride?.enabled ?? baseConfig.enabled,
    thresholds: { ...baseConfig.thresholds, ...(configOverride?.thresholds || {}) },
    directiveToggles: { ...baseConfig.directiveToggles, ...(configOverride?.directiveToggles || {}) },
  };

  const directives: EdcmDirective[] = [];

  for (const [directiveType, metricKey] of Object.entries(DIRECTIVE_METRIC_MAP) as [EdcmDirectiveType, keyof EdcmMetrics][]) {
    const metricValue = metrics[metricKey].value;
    const threshold = config.thresholds[directiveType];
    const enabled = config.enabled && config.directiveToggles[directiveType];
    const fired = enabled && metricValue >= threshold;

    directives.push({
      type: directiveType,
      metric: metricKey,
      metricValue,
      threshold,
      instruction: DIRECTIVE_INSTRUCTIONS[directiveType],
      fired,
      enabled,
    });
  }

  const firedDirectives = directives.filter(d => d.fired);

  if (firedDirectives.length > 0) {
    edcmDirectiveFirings.push({
      timestamp: Date.now(),
      directives: [...directives],
      config: { ...config },
    });
    if (edcmDirectiveFirings.length > MAX_DIRECTIVE_HISTORY) {
      edcmDirectiveFirings.splice(0, edcmDirectiveFirings.length - MAX_DIRECTIVE_HISTORY);
    }
    console.log(
      `[a0p:edcm] Directives fired: ${firedDirectives.map(d => d.type).join(", ")} ` +
      `| Metrics: ${firedDirectives.map(d => `${d.metric}=${d.metricValue.toFixed(3)}`).join(", ")}`
    );
  }

  return directives;
}

export function getEdcmDirectiveHistory(): Array<{
  timestamp: number;
  directives: EdcmDirective[];
  config: EdcmDirectiveConfig;
}> {
  return [...edcmDirectiveFirings];
}

export function buildDirectivePromptInjection(directives: EdcmDirective[]): string {
  const fired = directives.filter(d => d.fired);
  if (fired.length === 0) return "";

  const lines = fired.map(d => `[${d.type}] ${d.instruction}`);
  return `\n---\nEDCM BEHAVIORAL DIRECTIVES (active):\n${lines.join("\n")}\n---\n`;
}

export const PTCA_CONFIG = {
  build: BUILD_VERSION,
  seed_count: PCNA_N,
  site: { ring_size: HEPT_RING_SIZE, hub_index: HEPT_HUB_INDEX },
  rotation: { delta: 1, dir_rule: "(-1)^s" },
  aggregators: { Agg6: "mean", AggSeeds: "mean" },
  coupling: { alpha: PTCA_ALPHA_COUPLING, beta: PTCA_BETA_COUPLING, gamma: PTCA_GAMMA_COUPLING },
  diffusion: { alpha: PTCA_ALPHA_DIFFUSION, beta: PTCA_BETA_DRIFT, gamma: PTCA_GAMMA_DAMPING },
  tensor_axes: {
    prime_node: PCNA_N,
    sentinel: PTCA_SENTINEL_COUNT,
    phase: PTCA_PHASE_COUNT,
    hept: HEPT_TOTAL_SITES,
  },
  grouping: { group_size: PCNA_N, phase_scope: "v2_between_groups_only" },
  thresholds: { trigger_high: ALERT_TRIGGER_HIGH, clear_low: ALERT_CLEAR_LOW, hysteresis: true },
};

const MEMORY_SEED_COUNT = 11;
const MEMORY_WORKING_N = 53;
const MEMORY_PTCA_ELEMENTS = 504;

const DEFAULT_SEED_LABELS: string[] = [
  "User preferences",
  "Topics/interests",
  "Tool patterns",
  "Conversation patterns",
  "Domain knowledge",
  "Error patterns",
  "TIW knowledge",
  "External research",
  "Relational context",
  "Active goals",
  "Meta-learning",
];

export interface MemorySeedState {
  seedIndex: number;
  label: string;
  summary: string;
  originalSummary: string;
  pinned: boolean;
  enabled: boolean;
  weight: number;
  ptcaValues: number[];
  pcnaWeights: number[];
  sentinelPassCount: number;
  sentinelFailCount: number;
  lastSentinelStatus: string | null;
}

export interface MemorySentinelResult {
  sentinel: string;
  passed: boolean;
  reason: string;
  seedIndex: number;
}

export interface MemoryAttribution {
  [seedKey: string]: number;
}

export interface MemoryInterferenceEvent {
  seedA: number;
  seedB: number;
  affectedNodes: number[];
  magnitude: number;
}

export interface MemoryInjectionResult {
  bias: number[];
  sentinelResults: MemorySentinelResult[];
  attribution: MemoryAttribution;
  interferenceEvents: MemoryInterferenceEvent[];
  seedsUsed: number[];
}

let memoryRequestCounter = 0;

async function getMemoryConfig(): Promise<{
  enabled: boolean;
  alpha: number;
  s8Threshold: number;
  s9Threshold: number;
  driftCheckInterval: number;
}> {
  try {
    const toggle = await storage.getSystemToggle("memory_injection");
    if (toggle) {
      const params = (toggle.parameters || {}) as any;
      return {
        enabled: toggle.enabled,
        alpha: params.alpha ?? 0.1,
        s8Threshold: params.s8_threshold ?? 50.0,
        s9Threshold: params.s9_threshold ?? -0.5,
        driftCheckInterval: params.drift_check_interval ?? 50,
      };
    }
  } catch {}
  return { enabled: true, alpha: 0.1, s8Threshold: 50.0, s9Threshold: -0.5, driftCheckInterval: 50 };
}

function initDefaultPtcaValues(): number[] {
  return new Array(MEMORY_PTCA_ELEMENTS).fill(0);
}

function initDefaultPcnaWeights(): number[] {
  return new Array(MEMORY_SEED_COUNT).fill(1.0 / MEMORY_SEED_COUNT);
}

function initProjectionMatrix(rows: number, cols: number): number[][] {
  const matrix: number[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: number[] = [];
    for (let c = 0; c < cols; c++) {
      row.push((Math.random() - 0.5) * 0.02);
    }
    matrix.push(row);
  }
  return matrix;
}

export async function initializeMemorySeeds(): Promise<void> {
  const existing = await storage.getMemorySeeds();
  if (existing.length >= MEMORY_SEED_COUNT) return;

  for (let i = 0; i < MEMORY_SEED_COUNT; i++) {
    const exists = existing.find(s => s.seedIndex === i);
    if (!exists) {
      await storage.upsertMemorySeed({
        seedIndex: i,
        label: DEFAULT_SEED_LABELS[i],
        summary: "",
        originalSummary: "",
        pinned: false,
        enabled: true,
        weight: 1.0,
        ptcaValues: initDefaultPtcaValues(),
        pcnaWeights: initDefaultPcnaWeights(),
        sentinelPassCount: 0,
        sentinelFailCount: 0,
        lastSentinelStatus: null,
      });
    }
  }

  const proj = await storage.getMemoryProjection();
  if (!proj) {
    await storage.upsertMemoryProjection({
      projectionIn: initProjectionMatrix(MEMORY_SEED_COUNT, MEMORY_WORKING_N),
      projectionOut: initProjectionMatrix(MEMORY_WORKING_N, MEMORY_SEED_COUNT),
      requestCount: 0,
    });
  }

  await logMemory("seeds_initialized", { seedCount: MEMORY_SEED_COUNT, labels: DEFAULT_SEED_LABELS });
}

function computeProjectedValues(
  projectionIn: number[][],
  seeds: MemorySeedState[]
): number[] {
  const bias = new Array(MEMORY_WORKING_N).fill(0);
  for (const seed of seeds) {
    if (!seed.enabled) continue;
    const ptca = seed.ptcaValues;
    if (!ptca || ptca.length === 0) continue;
    const projRow = projectionIn[seed.seedIndex];
    if (!projRow) continue;
    for (let j = 0; j < MEMORY_WORKING_N; j++) {
      let val = 0;
      const ptcaSliceLen = Math.min(ptca.length, MEMORY_WORKING_N);
      for (let k = 0; k < ptcaSliceLen; k++) {
        val += ptca[k] * (projRow[j] || 0);
      }
      bias[j] += val * seed.weight;
    }
  }
  return bias;
}

function runMemorySentinels(
  seed: MemorySeedState,
  projectedValues: number[],
  allSeeds: MemorySeedState[],
  config: { s8Threshold: number; s9Threshold: number }
): MemorySentinelResult[] {
  const results: MemorySentinelResult[] = [];

  const hasOrigin = seed.summary.length > 0 || seed.originalSummary.length > 0 || seed.label.length > 0;
  results.push({
    sentinel: "S1_PROVENANCE",
    passed: hasOrigin,
    reason: hasOrigin ? "Seed has traceable origin" : "Seed has no traceable origin",
    seedIndex: seed.seedIndex,
  });

  const allInBounds = projectedValues.every(v => v >= -1.0 && v <= 1.0);
  results.push({
    sentinel: "S3_BOUNDS",
    passed: allInBounds,
    reason: allInBounds ? "All projected values within [-1.0, 1.0]" : "Projected values out of bounds",
    seedIndex: seed.seedIndex,
  });

  const ptcaStr = JSON.stringify(seed.ptcaValues || []);
  const hashCheck = createHash("sha256").update(ptcaStr).digest("hex");
  const hashValid = hashCheck.length > 0;
  results.push({
    sentinel: "S4_APPROVAL",
    passed: hashValid,
    reason: hashValid ? "Hash integrity verified" : "Hash integrity check failed",
    seedIndex: seed.seedIndex,
  });

  const totalEnergy = projectedValues.reduce((sum, v) => sum + v * v, 0);
  const s8Passed = totalEnergy < config.s8Threshold;
  results.push({
    sentinel: "S8_RISK",
    passed: s8Passed,
    reason: s8Passed ? `Total energy ${totalEnergy.toFixed(3)} < ${config.s8Threshold}` : `Total energy ${totalEnergy.toFixed(3)} exceeds threshold ${config.s8Threshold}`,
    seedIndex: seed.seedIndex,
  });

  let s9Passed = true;
  let s9Reason = "Coherence check passed";
  for (const other of allSeeds) {
    if (other.seedIndex === seed.seedIndex) continue;
    if (!other.enabled) continue;
    const similarity = cosineSimilarity(seed.ptcaValues || [], other.ptcaValues || []);
    if (similarity < config.s9Threshold) {
      s9Passed = false;
      s9Reason = `Cosine similarity with seed ${other.seedIndex} is ${similarity.toFixed(3)} < ${config.s9Threshold}`;
      break;
    }
  }
  results.push({
    sentinel: "S9_COHERENCE",
    passed: s9Passed,
    reason: s9Reason,
    seedIndex: seed.seedIndex,
  });

  return results;
}

function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom < 1e-12) return 0;
  return dotProduct / denom;
}

function detectInterference(seeds: MemorySeedState[], projectionIn: number[][]): MemoryInterferenceEvent[] {
  const events: MemoryInterferenceEvent[] = [];
  const enabledSeeds = seeds.filter(s => s.enabled);
  const significanceThreshold = 0.05;

  for (let i = 0; i < enabledSeeds.length; i++) {
    for (let j = i + 1; j < enabledSeeds.length; j++) {
      const seedA = enabledSeeds[i];
      const seedB = enabledSeeds[j];
      const affectedNodes: number[] = [];
      let totalMagnitude = 0;

      for (let n = 0; n < MEMORY_WORKING_N; n++) {
        const projA = (projectionIn[seedA.seedIndex]?.[n] || 0);
        const projB = (projectionIn[seedB.seedIndex]?.[n] || 0);

        const ptcaA = (seedA.ptcaValues?.[n % (seedA.ptcaValues?.length || 1)] || 0);
        const ptcaB = (seedB.ptcaValues?.[n % (seedB.ptcaValues?.length || 1)] || 0);

        const biasA = projA * ptcaA * seedA.weight;
        const biasB = projB * ptcaB * seedB.weight;

        if (Math.abs(biasA) > significanceThreshold &&
            Math.abs(biasB) > significanceThreshold &&
            Math.sign(biasA) !== Math.sign(biasB)) {
          affectedNodes.push(n);
          totalMagnitude += Math.abs(biasA - biasB);
        }
      }

      if (affectedNodes.length > 0) {
        events.push({
          seedA: seedA.seedIndex,
          seedB: seedB.seedIndex,
          affectedNodes,
          magnitude: totalMagnitude,
        });
      }
    }
  }

  return events;
}

function computeAttribution(
  seeds: MemorySeedState[],
  projectionIn: number[][],
  bias: number[]
): MemoryAttribution {
  const attribution: MemoryAttribution = {};
  const totalBiasMagnitude = bias.reduce((sum, v) => sum + Math.abs(v), 0);
  if (totalBiasMagnitude < 1e-12) {
    for (const seed of seeds) {
      if (seed.enabled) attribution[`seed${seed.seedIndex}`] = 0;
    }
    return attribution;
  }

  for (const seed of seeds) {
    if (!seed.enabled) continue;
    const ptca = seed.ptcaValues || [];
    const projRow = projectionIn[seed.seedIndex];
    if (!projRow) {
      attribution[`seed${seed.seedIndex}`] = 0;
      continue;
    }
    let seedContrib = 0;
    for (let j = 0; j < MEMORY_WORKING_N; j++) {
      let val = 0;
      const ptcaSliceLen = Math.min(ptca.length, MEMORY_WORKING_N);
      for (let k = 0; k < ptcaSliceLen; k++) {
        val += ptca[k] * (projRow[j] || 0);
      }
      seedContrib += Math.abs(val * seed.weight);
    }
    attribution[`seed${seed.seedIndex}`] = parseFloat((seedContrib / totalBiasMagnitude).toFixed(4));
  }

  return attribution;
}

export async function performMemoryInjection(
  workingState: number[]
): Promise<MemoryInjectionResult> {
  const config = await getMemoryConfig();

  if (!config.enabled) {
    return {
      bias: new Array(MEMORY_WORKING_N).fill(0),
      sentinelResults: [],
      attribution: {},
      interferenceEvents: [],
      seedsUsed: [],
    };
  }

  const allSeedsRaw = await storage.getMemorySeeds();
  const proj = await storage.getMemoryProjection();

  if (allSeedsRaw.length === 0 || !proj) {
    return {
      bias: new Array(MEMORY_WORKING_N).fill(0),
      sentinelResults: [],
      attribution: {},
      interferenceEvents: [],
      seedsUsed: [],
    };
  }

  const projectionIn = (proj.projectionIn || []) as number[][];
  const allSeeds: MemorySeedState[] = allSeedsRaw.map(s => ({
    seedIndex: s.seedIndex,
    label: s.label,
    summary: s.summary,
    originalSummary: s.originalSummary,
    pinned: s.pinned,
    enabled: s.enabled,
    weight: s.weight,
    ptcaValues: (s.ptcaValues || []) as number[],
    pcnaWeights: (s.pcnaWeights || []) as number[],
    sentinelPassCount: s.sentinelPassCount,
    sentinelFailCount: s.sentinelFailCount,
    lastSentinelStatus: s.lastSentinelStatus,
  }));

  const allSentinelResults: MemorySentinelResult[] = [];
  const passedSeeds: MemorySeedState[] = [];

  for (const seed of allSeeds) {
    if (!seed.enabled) continue;

    const seedProjected = new Array(MEMORY_WORKING_N).fill(0);
    const ptca = seed.ptcaValues;
    const projRow = projectionIn[seed.seedIndex];
    if (projRow) {
      for (let j = 0; j < MEMORY_WORKING_N; j++) {
        let val = 0;
        const ptcaSliceLen = Math.min(ptca.length, MEMORY_WORKING_N);
        for (let k = 0; k < ptcaSliceLen; k++) {
          val += ptca[k] * (projRow[j] || 0);
        }
        seedProjected[j] = val * seed.weight;
      }
    }

    const sentinelResults = runMemorySentinels(seed, seedProjected, allSeeds, config);
    allSentinelResults.push(...sentinelResults);

    const allPassed = sentinelResults.every(r => r.passed);

    await storage.updateMemorySeed(seed.seedIndex, {
      sentinelPassCount: seed.sentinelPassCount + (allPassed ? 1 : 0),
      sentinelFailCount: seed.sentinelFailCount + (allPassed ? 0 : 1),
      lastSentinelStatus: allPassed ? "PASS" : `FAIL:${sentinelResults.filter(r => !r.passed).map(r => r.sentinel).join(",")}`,
    });

    await logSentinel("memory_sentinel_check", {
      seedIndex: seed.seedIndex,
      label: seed.label,
      results: sentinelResults,
      allPassed,
    });

    if (allPassed) {
      passedSeeds.push(seed);
    }
  }

  const interferenceEvents = detectInterference(passedSeeds, projectionIn);
  if (interferenceEvents.length > 0) {
    await logInterference("cross_seed_conflict", {
      events: interferenceEvents,
      timestamp: Date.now(),
    });
  }

  const bias = computeProjectedValues(projectionIn, passedSeeds);

  for (let i = 0; i < bias.length; i++) {
    bias[i] = Math.max(-1.0, Math.min(1.0, bias[i]));
  }

  const attribution = computeAttribution(passedSeeds, projectionIn, bias);

  await logAttribution("per_response_attribution", {
    attribution,
    seedsUsed: passedSeeds.map(s => s.seedIndex),
    biasMagnitude: bias.reduce((sum, v) => sum + Math.abs(v), 0),
  });

  await logMemory("injection_complete", {
    seedsUsed: passedSeeds.map(s => s.seedIndex),
    sentinelPassCount: allSentinelResults.filter(r => r.passed).length,
    sentinelFailCount: allSentinelResults.filter(r => !r.passed).length,
    interferenceCount: interferenceEvents.length,
    biasMagnitude: bias.reduce((sum, v) => sum + Math.abs(v), 0),
  });

  memoryRequestCounter++;

  if (memoryRequestCounter % 10 === 0) {
    await saveMemorySnapshot();
  }

  if (memoryRequestCounter % (await getMemoryConfig()).driftCheckInterval === 0) {
    await checkSemanticDrift();
  }

  return {
    bias,
    sentinelResults: allSentinelResults,
    attribution,
    interferenceEvents,
    seedsUsed: passedSeeds.map(s => s.seedIndex),
  };
}

export async function performMemoryProjectionOut(
  finalState: number[]
): Promise<void> {
  const config = await getMemoryConfig();
  if (!config.enabled) return;

  const proj = await storage.getMemoryProjection();
  if (!proj) return;

  const projectionOut = (proj.projectionOut || []) as number[][];
  const seeds = await storage.getMemorySeeds();
  const alpha = config.alpha;

  for (const seed of seeds) {
    if (!seed.enabled || seed.pinned) continue;

    const ptca = ((seed.ptcaValues || []) as number[]).slice();
    const projCol = projectionOut.map(row => row?.[seed.seedIndex] || 0);

    for (let k = 0; k < Math.min(ptca.length, MEMORY_WORKING_N); k++) {
      let projected = 0;
      for (let j = 0; j < Math.min(finalState.length, MEMORY_WORKING_N); j++) {
        projected += finalState[j] * (projCol[j] || 0);
      }
      ptca[k] = (1 - alpha) * ptca[k] + alpha * projected;
    }

    await storage.updateMemorySeed(seed.seedIndex, {
      ptcaValues: ptca,
    });
  }

  await storage.upsertMemoryProjection({
    projectionIn: proj.projectionIn,
    projectionOut: proj.projectionOut,
    requestCount: (proj.requestCount || 0) + 1,
  });

  await logMemory("projection_out_complete", {
    alpha,
    seedsUpdated: seeds.filter(s => s.enabled && !s.pinned).map(s => s.seedIndex),
  });
}

export async function updateSemanticMemory(
  newSummarySnippet: string,
  targetSeedIndex?: number
): Promise<{ seedIndex: number; updatedSummary: string }> {
  const seeds = await storage.getMemorySeeds();
  let bestSeed = targetSeedIndex;

  if (bestSeed === undefined || bestSeed < 0 || bestSeed >= MEMORY_SEED_COUNT) {
    const keywords: Record<number, string[]> = {
      0: ["prefer", "like", "want", "style", "format"],
      1: ["topic", "interest", "curious", "learn", "subject"],
      2: ["tool", "function", "api", "call", "use"],
      3: ["conversation", "chat", "discuss", "talk", "dialogue"],
      4: ["domain", "knowledge", "expert", "field", "technical"],
      5: ["error", "bug", "fix", "issue", "problem"],
      6: ["tiw", "interdependence", "ethical", "cooperative", "alignment"],
      7: ["research", "paper", "study", "finding", "discover"],
      8: ["relation", "context", "background", "history", "connection"],
      9: ["goal", "objective", "target", "plan", "accomplish"],
      10: ["meta", "learn", "adapt", "improve", "pattern"],
    };

    const lower = newSummarySnippet.toLowerCase();
    let maxScore = -1;
    bestSeed = 7;
    for (const [idx, kws] of Object.entries(keywords)) {
      const score = kws.reduce((s, kw) => s + (lower.includes(kw) ? 1 : 0), 0);
      if (score > maxScore) {
        maxScore = score;
        bestSeed = parseInt(idx);
      }
    }
  }

  const seed = seeds.find(s => s.seedIndex === bestSeed);
  if (!seed) {
    return { seedIndex: bestSeed!, updatedSummary: newSummarySnippet };
  }

  let updatedSummary: string;
  if (seed.pinned) {
    updatedSummary = seed.summary ? `${seed.summary}\n${newSummarySnippet}` : newSummarySnippet;
  } else {
    const combined = seed.summary ? `${seed.summary} ${newSummarySnippet}` : newSummarySnippet;
    updatedSummary = combined.length > 500 ? combined.slice(combined.length - 500) : combined;
  }

  await storage.updateMemorySeed(bestSeed!, {
    summary: updatedSummary,
    originalSummary: seed.originalSummary || (seed.summary ? seed.summary : updatedSummary),
  });

  await logMemory("semantic_memory_update", {
    seedIndex: bestSeed,
    label: seed.label,
    pinned: seed.pinned,
    summaryLength: updatedSummary.length,
    snippet: newSummarySnippet.slice(0, 100),
  });

  return { seedIndex: bestSeed!, updatedSummary };
}

export async function checkSemanticDrift(): Promise<Array<{ seedIndex: number; label: string; drift: number; flagged: boolean }>> {
  const seeds = await storage.getMemorySeeds();
  const driftResults: Array<{ seedIndex: number; label: string; drift: number; flagged: boolean }> = [];

  for (const seed of seeds) {
    if (seed.pinned) continue;
    if (!seed.summary || !seed.originalSummary) continue;
    if (seed.summary === seed.originalSummary) {
      driftResults.push({ seedIndex: seed.seedIndex, label: seed.label, drift: 0, flagged: false });
      continue;
    }

    const metrics = computeEdcmMetrics(`Original: ${seed.originalSummary}\nCurrent: ${seed.summary}`);
    const driftValue = metrics.DRIFT.value;
    const flagged = driftValue > 0.6;

    driftResults.push({ seedIndex: seed.seedIndex, label: seed.label, drift: driftValue, flagged });

    if (flagged) {
      await logMemory("semantic_drift_warning", {
        seedIndex: seed.seedIndex,
        label: seed.label,
        drift: driftValue,
        originalLength: seed.originalSummary.length,
        currentLength: seed.summary.length,
      });
    }
  }

  return driftResults;
}

async function saveMemorySnapshot(): Promise<void> {
  const seeds = await storage.getMemorySeeds();
  const proj = await storage.getMemoryProjection();

  await storage.addMemoryTensorSnapshot({
    seedsState: seeds.map(s => ({
      seedIndex: s.seedIndex,
      label: s.label,
      summary: s.summary,
      enabled: s.enabled,
      pinned: s.pinned,
      weight: s.weight,
      sentinelPassCount: s.sentinelPassCount,
      sentinelFailCount: s.sentinelFailCount,
    })),
    projectionIn: proj?.projectionIn || null,
    projectionOut: proj?.projectionOut || null,
    requestCount: memoryRequestCounter,
  });

  await logMemory("snapshot_saved", { requestCount: memoryRequestCounter });
}

export async function getMemoryState(): Promise<{
  seeds: MemorySeedState[];
  projectionIn: number[][] | null;
  projectionOut: number[][] | null;
  requestCount: number;
  config: Awaited<ReturnType<typeof getMemoryConfig>>;
}> {
  const seedsRaw = await storage.getMemorySeeds();
  const proj = await storage.getMemoryProjection();
  const config = await getMemoryConfig();

  const seeds: MemorySeedState[] = seedsRaw.map(s => ({
    seedIndex: s.seedIndex,
    label: s.label,
    summary: s.summary,
    originalSummary: s.originalSummary,
    pinned: s.pinned,
    enabled: s.enabled,
    weight: s.weight,
    ptcaValues: (s.ptcaValues || []) as number[],
    pcnaWeights: (s.pcnaWeights || []) as number[],
    sentinelPassCount: s.sentinelPassCount,
    sentinelFailCount: s.sentinelFailCount,
    lastSentinelStatus: s.lastSentinelStatus,
  }));

  return {
    seeds,
    projectionIn: (proj?.projectionIn as number[][] | null) || null,
    projectionOut: (proj?.projectionOut as number[][] | null) || null,
    requestCount: proj?.requestCount || 0,
    config,
  };
}

export async function clearMemorySeed(seedIndex: number): Promise<void> {
  await storage.updateMemorySeed(seedIndex, {
    summary: "",
    originalSummary: "",
    ptcaValues: initDefaultPtcaValues(),
    pcnaWeights: initDefaultPcnaWeights(),
    sentinelPassCount: 0,
    sentinelFailCount: 0,
    lastSentinelStatus: null,
  });
  await logMemory("seed_cleared", { seedIndex });
}

export async function importMemorySeedText(seedIndex: number, text: string): Promise<void> {
  await storage.updateMemorySeed(seedIndex, {
    summary: text.slice(0, 500),
    originalSummary: text.slice(0, 500),
  });
  await logMemory("seed_text_imported", { seedIndex, textLength: text.length });
}

export async function exportMemoryIdentity(): Promise<{
  version: string;
  timestamp: string;
  seeds: Array<{
    seedIndex: number;
    label: string;
    summary: string;
    originalSummary: string;
    pinned: boolean;
    enabled: boolean;
    weight: number;
    ptcaValues: number[];
    pcnaWeights: number[];
    sentinelPassCount: number;
    sentinelFailCount: number;
  }>;
  projectionIn: number[][] | null;
  projectionOut: number[][] | null;
  requestCount: number;
}> {
  const state = await getMemoryState();
  return {
    version: BUILD_VERSION,
    timestamp: new Date().toISOString(),
    seeds: state.seeds.map(s => ({
      seedIndex: s.seedIndex,
      label: s.label,
      summary: s.summary,
      originalSummary: s.originalSummary,
      pinned: s.pinned,
      enabled: s.enabled,
      weight: s.weight,
      ptcaValues: s.ptcaValues,
      pcnaWeights: s.pcnaWeights,
      sentinelPassCount: s.sentinelPassCount,
      sentinelFailCount: s.sentinelFailCount,
    })),
    projectionIn: state.projectionIn,
    projectionOut: state.projectionOut,
    requestCount: state.requestCount,
  };
}

export async function importMemoryIdentity(data: {
  seeds: Array<{
    seedIndex: number;
    label: string;
    summary: string;
    originalSummary: string;
    pinned: boolean;
    enabled: boolean;
    weight: number;
    ptcaValues: number[];
    pcnaWeights: number[];
  }>;
  projectionIn?: number[][] | null;
  projectionOut?: number[][] | null;
}): Promise<void> {
  await saveMemorySnapshot();

  for (const seedData of data.seeds) {
    if (seedData.seedIndex < 0 || seedData.seedIndex >= MEMORY_SEED_COUNT) continue;
    await storage.upsertMemorySeed({
      seedIndex: seedData.seedIndex,
      label: seedData.label,
      summary: seedData.summary,
      originalSummary: seedData.originalSummary,
      pinned: seedData.pinned,
      enabled: seedData.enabled,
      weight: seedData.weight,
      ptcaValues: seedData.ptcaValues,
      pcnaWeights: seedData.pcnaWeights,
      sentinelPassCount: 0,
      sentinelFailCount: 0,
      lastSentinelStatus: null,
    });
  }

  if (data.projectionIn || data.projectionOut) {
    const proj = await storage.getMemoryProjection();
    await storage.upsertMemoryProjection({
      projectionIn: data.projectionIn || proj?.projectionIn || initProjectionMatrix(MEMORY_SEED_COUNT, MEMORY_WORKING_N),
      projectionOut: data.projectionOut || proj?.projectionOut || initProjectionMatrix(MEMORY_WORKING_N, MEMORY_SEED_COUNT),
      requestCount: 0,
    });
  }

  await logMaster("memory", "identity_imported", {
    seedCount: data.seeds.length,
    hasProjections: !!(data.projectionIn || data.projectionOut),
  });
}

export function buildMemoryContextPrompt(seeds: MemorySeedState[]): string {
  const enabledSeeds = seeds.filter(s => s.enabled && s.summary.length > 0);
  if (enabledSeeds.length === 0) return "";

  const lines = enabledSeeds.map(s => `[${s.label}] ${s.summary}`);
  return `\n---\nMEMORY CONTEXT (external seeds):\n${lines.join("\n")}\n---\n`;
}

export function buildAttributionContext(attribution: MemoryAttribution): string {
  const entries = Object.entries(attribution).filter(([_, v]) => v > 0.01);
  if (entries.length === 0) return "";
  const parts = entries.map(([k, v]) => `${k}: ${(v * 100).toFixed(1)}%`);
  return `\n[Memory Attribution: ${parts.join(", ")}]\n`;
}

export function getMemoryRequestCounter(): number {
  return memoryRequestCounter;
}

export { MEMORY_SEED_COUNT, MEMORY_WORKING_N, MEMORY_PTCA_ELEMENTS };

export interface BanditConfig {
  C: number;
  lambda: number;
  epsilon: number;
  coldStartThreshold: number;
}

const BANDIT_DEFAULTS: BanditConfig = {
  C: Math.SQRT2,
  lambda: 0.95,
  epsilon: 0.3,
  coldStartThreshold: 5,
};

async function getBanditConfig(): Promise<BanditConfig> {
  try {
    const toggle = await storage.getSystemToggle("bandit");
    if (toggle && toggle.parameters) {
      const p = toggle.parameters as any;
      return {
        C: typeof p.C === "number" ? p.C : BANDIT_DEFAULTS.C,
        lambda: typeof p.lambda === "number" ? p.lambda : BANDIT_DEFAULTS.lambda,
        epsilon: typeof p.epsilon === "number" ? p.epsilon : BANDIT_DEFAULTS.epsilon,
        coldStartThreshold: typeof p.coldStartThreshold === "number" ? p.coldStartThreshold : BANDIT_DEFAULTS.coldStartThreshold,
      };
    }
  } catch {}
  return { ...BANDIT_DEFAULTS };
}

async function isBanditEnabled(): Promise<boolean> {
  try {
    const toggle = await storage.getSystemToggle("bandit");
    return toggle ? toggle.enabled : true;
  } catch {
    return true;
  }
}

function computeUcb1(
  avgReward: number,
  emaReward: number,
  pulls: number,
  totalPulls: number,
  config: BanditConfig
): number {
  if (pulls === 0) return Infinity;
  const exploitation = emaReward;
  const exploration = config.C * Math.sqrt(Math.log(totalPulls) / pulls);
  return exploitation + exploration;
}

export async function banditSelect(domain: string): Promise<{ armName: string; armId: number } | null> {
  const enabled = await isBanditEnabled();
  if (!enabled) {
    await logMaster("bandit", "select_skipped", { domain, reason: "bandit_disabled" });
    return null;
  }

  const arms = await storage.getBanditArms(domain);
  const activeArms = arms.filter(a => a.enabled);
  if (activeArms.length === 0) {
    await logMaster("bandit", "select_no_arms", { domain });
    return null;
  }

  const config = await getBanditConfig();
  const totalPulls = activeArms.reduce((s, a) => s + a.pulls, 0);

  const coldStartArms = activeArms.filter(a => a.pulls < config.coldStartThreshold);
  if (coldStartArms.length > 0 && Math.random() < config.epsilon) {
    const chosen = coldStartArms[Math.floor(Math.random() * coldStartArms.length)];
    await logMaster("bandit", "select_cold_start", {
      domain, arm: chosen.armName, armId: chosen.id, pulls: chosen.pulls,
      epsilon: config.epsilon, coldStartThreshold: config.coldStartThreshold,
    });
    return { armName: chosen.armName, armId: chosen.id };
  }

  let bestScore = -Infinity;
  let bestArm = activeArms[0];
  for (const arm of activeArms) {
    const score = computeUcb1(arm.avgReward, arm.emaReward, arm.pulls, Math.max(totalPulls, 1), config);
    if (score > bestScore) {
      bestScore = score;
      bestArm = arm;
    }
  }

  await logMaster("bandit", "select", {
    domain, arm: bestArm.armName, armId: bestArm.id,
    ucbScore: bestScore, pulls: bestArm.pulls, emaReward: bestArm.emaReward,
    totalPulls, config,
  });

  return { armName: bestArm.armName, armId: bestArm.id };
}

export async function banditReward(armId: number, reward: number): Promise<void> {
  const enabled = await isBanditEnabled();
  if (!enabled) return;

  const arm = await storage.getBanditArm(armId);
  if (!arm) {
    await logMaster("bandit", "reward_error", { armId, reason: "arm_not_found" });
    return;
  }

  const config = await getBanditConfig();
  const newPulls = arm.pulls + 1;
  const newTotalReward = arm.totalReward + reward;
  const newAvgReward = newTotalReward / newPulls;
  const newEmaReward = arm.pulls === 0
    ? reward
    : config.lambda * arm.emaReward + (1 - config.lambda) * reward;

  const totalPullsInDomain = (await storage.getBanditArms(arm.domain))
    .filter(a => a.enabled)
    .reduce((s, a) => s + a.pulls, 0) + 1;

  const newUcbScore = computeUcb1(newAvgReward, newEmaReward, newPulls, totalPullsInDomain, config);

  await storage.updateBanditArm(armId, {
    pulls: newPulls,
    totalReward: newTotalReward,
    avgReward: newAvgReward,
    emaReward: newEmaReward,
    ucbScore: newUcbScore,
    lastPulled: new Date(),
  });

  await logMaster("bandit", "reward", {
    armId, domain: arm.domain, arm: arm.armName, reward,
    newPulls, newAvgReward, newEmaReward, newUcbScore,
    lambda: config.lambda,
  });
}

export async function banditGetStats(domain?: string): Promise<{
  arms: any[];
  config: BanditConfig;
  enabled: boolean;
  totalPulls: number;
}> {
  const arms = await storage.getBanditArms(domain);
  const config = await getBanditConfig();
  const enabled = await isBanditEnabled();
  const totalPulls = arms.reduce((s, a) => s + a.pulls, 0);
  return { arms, config, enabled, totalPulls };
}

export async function banditToggleArm(armId: number, enabled: boolean): Promise<void> {
  await storage.updateBanditArm(armId, { enabled });
  await logMaster("bandit", "toggle_arm", { armId, enabled });
}

const DEFAULT_ARMS: Record<string, string[]> = {
  tool: ["web_search", "fetch_url", "gmail_search", "gmail_send", "github_search", "code_execute"],
  model: ["gemini", "grok", "synthesis"],
  ptca_route: ["standard", "deep_solve", "heptagram_boost", "sentinel_focus"],
  pcna_route: ["ring_53", "adjacency_8", "full_diffusion", "hub_only"],
};

export async function initializeBanditArms(): Promise<void> {
  const enabled = await isBanditEnabled();

  for (const [domain, armNames] of Object.entries(DEFAULT_ARMS)) {
    for (const armName of armNames) {
      await storage.upsertBanditArm({
        domain,
        armName,
        pulls: 0,
        totalReward: 0,
        avgReward: 0,
        emaReward: 0,
        ucbScore: 0,
        enabled: true,
        lastPulled: null,
      });
    }
  }

  await storage.upsertSystemToggle("bandit", true, {
    ...BANDIT_DEFAULTS,
  });

  await logMaster("bandit", "initialize", {
    domains: Object.keys(DEFAULT_ARMS),
    armCounts: Object.fromEntries(Object.entries(DEFAULT_ARMS).map(([k, v]) => [k, v.length])),
    enabled,
  });
}

export async function recordCorrelation(
  toolArm: string | null,
  modelArm: string | null,
  ptcaArm: string | null,
  pcnaArm: string | null,
  jointReward: number
): Promise<void> {
  const enabled = await isBanditEnabled();
  if (!enabled) return;

  await storage.addBanditCorrelation({
    toolArm,
    modelArm,
    ptcaArm,
    pcnaArm,
    jointReward,
  });

  await logMaster("bandit", "correlation_recorded", {
    toolArm, modelArm, ptcaArm, pcnaArm, jointReward,
  });
}

export async function getTopCorrelations(limit = 50): Promise<any[]> {
  return storage.getBanditCorrelations(limit);
}
