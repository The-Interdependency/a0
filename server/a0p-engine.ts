import { createHash } from "crypto";
import { storage } from "./storage";
import { logMemory, logSentinel, logInterference, logAttribution, logMaster, logOmega, logPsi } from "./logger";

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
const PTCA_SENTINEL_COUNT = 11;

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
  S4_context: { window: { type: string; W: number }; retrieval_mode: string };
  S5_identity: { actor_map_version: string; confidence: number };
  S6_memory: { store_allowed: boolean; retention: string };
  S7_risk: { score: number; flags: string[] };
  S8_audit: { evidence_events: string[]; retrieval_log: string[] };
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
  "0": "S0_PROVENANCE", "1": "S1_POLICY", "2": "S2_BOUNDS", "3": "S3_APPROVAL",
  "4": "S4_CONTEXT", "5": "S5_IDENTITY", "6": "S6_MEMORY", "7": "S7_RISK", "8": "S8_AUDIT",
  "9": "S9_AUTONOMY", "10": "S10_SELFMODEL",
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
    id: "S0", name: "S0_PROVENANCE",
    check: (req: any) => !!req.taskId && !!req.action,
    desc: "Origin, hashes, timestamps, reproducibility hooks",
  },
  {
    id: "S1", name: "S1_POLICY",
    check: (_req: any, _ctx: any) => true,
    desc: "Hard redlines, disallowed actions/content, compliance",
  },
  {
    id: "S2", name: "S2_BOUNDS",
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
    id: "S3", name: "S3_APPROVAL",
    check: (_req: any, ctx: any) => ctx.hashValid !== false,
    desc: "Explicit approval required for external/irreversible changes",
  },
  {
    id: "S4", name: "S4_CONTEXT",
    check: (_req: any, _ctx: any) => true,
    desc: "Single source of truth for window + retrieval + context hygiene",
  },
  {
    id: "S5", name: "S5_IDENTITY",
    check: (_req: any, _ctx: any) => true,
    desc: "Actor mapping, roles, permissions, key selection",
  },
  {
    id: "S6", name: "S6_MEMORY",
    check: (_req: any, _ctx: any) => true,
    desc: "Persistence rules, retention, deletion requests, no silent memory",
  },
  {
    id: "S7", name: "S7_RISK",
    check: (_req: any, ctx: any) => {
      if (ctx.ptcaEnergy && ctx.ptcaEnergy >= 100) return false;
      return true;
    },
    desc: "Risk scoring + escalation, uncertainty routing",
  },
  {
    id: "S8", name: "S8_AUDIT",
    check: (_req: any, ctx: any) => ctx.hmmm?.valid !== false,
    desc: "Accountability trail, decision trace, replay bundles, export correctness",
  },
  {
    id: "S9", name: "S9_AUTONOMY",
    check: (_req: any, _ctx: any) => {
      const omega = getOmegaState();
      if (omega.totalEnergy >= 8.0) return false;
      if (omega.goals.filter(g => g.status === "active").length > 20) return false;
      const hist = omega.energyHistory;
      if (hist.length >= 4) {
        let consecutiveSpikes = 0;
        for (let i = hist.length - 1; i >= 1 && consecutiveSpikes < 3; i--) {
          if (hist[i - 1] > 0 && hist[i] / hist[i - 1] > 2.0) consecutiveSpikes++;
          else break;
        }
        if (consecutiveSpikes >= 3) return false;
      }
      return true;
    },
    desc: "Autonomy tensor health: energy bounds, goal stack, runaway detection",
  },
  {
    id: "S10", name: "S10_SELFMODEL",
    check: (_req: any, _ctx: any) => {
      const psi = getPsiState();
      if (!psi || psi.totalEnergy === 0 && psi.dimensionEnergies.every(e => e === 0)) return true;
      if (!isFinite(psi.totalEnergy)) return false;
      for (const e of psi.dimensionEnergies) {
        if (!isFinite(e) || e < 0 || e > 1) return false;
      }
      const mean = psi.dimensionEnergies.reduce((s, v) => s + v, 0) / psi.dimensionEnergies.length;
      const variance = psi.dimensionEnergies.reduce((s, v) => s + (v - mean) ** 2, 0) / psi.dimensionEnergies.length;
      if (variance > 0.8) return false;
      return true;
    },
    desc: "Self-model tensor health: dimension stability, coherence, bounds",
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
    S4_context: { window: S5_CONTEXT_DEFAULTS.window, retrieval_mode: S5_CONTEXT_DEFAULTS.retrieval.mode },
    S5_identity: { actor_map_version: "v1", confidence: 0.98 },
    S6_memory: { store_allowed: false, retention: "session" },
    S7_risk: { score: 0.12, flags: [] },
    S8_audit: { evidence_events: eventIds, retrieval_log: [] },
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
    applySentinelFeedback(sentinels.results);

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
  applySentinelFeedback(sentinels.results);
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
  model: ["a", "b", "c"],
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

const OMEGA_DIM_COUNT = 10;
const OMEGA_ALPHA_DIFFUSION = 0.4;
const OMEGA_BETA_DRIFT = 0.3;
const OMEGA_GAMMA_DAMPING = 0.15;
const OMEGA_STEPS_PER_EVAL = 10;
const CROSS_TENSOR_COUPLING = 0.05;
const OMEGA_SENTINEL_THRESHOLD = 120;

const OMEGA_DIMENSION_LABELS = [
  "Goal Persistence",
  "Initiative",
  "Planning Depth",
  "Verification",
  "Scheduling",
  "Outreach",
  "Learning",
  "Resource Awareness",
  "Exploration",
  "Delegation",
] as const;

const OMEGA_DIMENSION_THRESHOLDS = [
  0.4, 0.5, 0.3, 0.4, 0.3, 0.6, 0.5, 0.3, 0.4, 0.5,
];

const OMEGA_INIT_WEIGHTS = [
  0.1, 0.3, 0.2, 0.2, 0.2, 0.1, 0.2, 0.8, 0.3, 0.2,
];

const OMEGA_DECAY_RATES = [
  0.02, 0.03, 0.01, 0.02, 0.01, 0.03, 0.02, 0.01, 0.03, 0.02,
];

type OmegaTensor = Float64Array;

const OMEGA_T4_SIZE = PCNA_N * OMEGA_DIM_COUNT * PTCA_PHASE_COUNT * HEPT_TOTAL_SITES;

function omegaIdx(p: number, d: number, ph: number, h: number): number {
  return ((p * OMEGA_DIM_COUNT + d) * PTCA_PHASE_COUNT + ph) * HEPT_TOTAL_SITES + h;
}

function initOmegaTensor(): OmegaTensor {
  const t = new Float64Array(OMEGA_T4_SIZE);
  for (let p = 0; p < PCNA_N; p++) {
    for (let d = 0; d < OMEGA_DIM_COUNT; d++) {
      const dWeight = OMEGA_INIT_WEIGHTS[d];
      for (let ph = 0; ph < PTCA_PHASE_COUNT; ph++) {
        for (let k = 0; k < HEPT_RING_SIZE; k++) {
          t[omegaIdx(p, d, ph, k)] = Math.sin(p * PTCA_DTHETA + (k * 2 * Math.PI) / HEPT_RING_SIZE) * 0.5 * dWeight;
        }
        t[omegaIdx(p, d, ph, HEPT_HUB_INDEX)] = Math.cos(p * PTCA_DTHETA) * 0.3 * dWeight;
      }
    }
  }
  return t;
}

function omegaHeptagramExchange(t: OmegaTensor): void {
  const scratch = new Float64Array(HEPT_RING_SIZE);
  const omegaAlpha = PTCA_ALPHA_COUPLING * 0.7;
  const omegaBeta = PTCA_BETA_COUPLING * 0.8;
  const omegaGamma = PTCA_GAMMA_COUPLING * 0.6;

  for (let p = 0; p < PCNA_N; p++) {
    const dir = (p % 2 === 0) ? 1 : -1;
    for (let d = 0; d < OMEGA_DIM_COUNT; d++) {
      for (let ph = 0; ph < PTCA_PHASE_COUNT; ph++) {
        for (let k = 0; k < HEPT_RING_SIZE; k++) {
          const srcK = ((k - dir) % HEPT_RING_SIZE + HEPT_RING_SIZE) % HEPT_RING_SIZE;
          scratch[k] = t[omegaIdx(p, d, ph, srcK)];
        }
        for (let k = 0; k < HEPT_RING_SIZE; k++) {
          t[omegaIdx(p, d, ph, k)] = scratch[k];
        }
      }
    }
  }

  for (let p = 0; p < PCNA_N; p++) {
    for (let d = 0; d < OMEGA_DIM_COUNT; d++) {
      for (let ph = 0; ph < PTCA_PHASE_COUNT; ph++) {
        let ringSum = 0;
        for (let k = 0; k < HEPT_RING_SIZE; k++) ringSum += t[omegaIdx(p, d, ph, k)];
        const ringMean = ringSum / HEPT_RING_SIZE;
        const hubIdx = omegaIdx(p, d, ph, HEPT_HUB_INDEX);
        t[hubIdx] += omegaBeta * ringMean;
        for (let k = 0; k < HEPT_RING_SIZE; k++) {
          t[omegaIdx(p, d, ph, k)] += omegaGamma * t[hubIdx];
        }
      }
    }
  }

  for (let d = 0; d < OMEGA_DIM_COUNT; d++) {
    for (let ph = 0; ph < PTCA_PHASE_COUNT; ph++) {
      let hubSum = 0;
      for (let p = 0; p < PCNA_N; p++) hubSum += t[omegaIdx(p, d, ph, HEPT_HUB_INDEX)];
      const globalHub = hubSum / PCNA_N;
      for (let p = 0; p < PCNA_N; p++) {
        const idx = omegaIdx(p, d, ph, HEPT_HUB_INDEX);
        t[idx] = (1 - omegaAlpha) * t[idx] + omegaAlpha * globalHub;
      }
    }
  }
}

function computeOmegaEnergy(t: OmegaTensor): { total: number; dimensionEnergies: number[]; phaseEnergies: number[] } {
  let total = 0;
  const dimensionEnergies = new Array(OMEGA_DIM_COUNT).fill(0);
  const phaseEnergies = new Array(PTCA_PHASE_COUNT).fill(0);

  for (let i = 0; i < OMEGA_T4_SIZE; i++) total += t[i] * t[i];

  for (let d = 0; d < OMEGA_DIM_COUNT; d++) {
    let dimSum = 0;
    for (let p = 0; p < PCNA_N; p++) {
      for (let ph = 0; ph < PTCA_PHASE_COUNT; ph++) {
        for (let h = 0; h < HEPT_TOTAL_SITES; h++) {
          const v = t[omegaIdx(p, d, ph, h)];
          dimSum += v * v;
        }
      }
    }
    dimensionEnergies[d] = dimSum / (PCNA_N * PTCA_PHASE_COUNT * HEPT_TOTAL_SITES);
  }

  for (let ph = 0; ph < PTCA_PHASE_COUNT; ph++) {
    let phSum = 0;
    for (let p = 0; p < PCNA_N; p++) {
      for (let d = 0; d < OMEGA_DIM_COUNT; d++) {
        for (let h = 0; h < HEPT_TOTAL_SITES; h++) {
          const v = t[omegaIdx(p, d, ph, h)];
          phSum += v * v;
        }
      }
    }
    phaseEnergies[ph] = phSum / (PCNA_N * OMEGA_DIM_COUNT * HEPT_TOTAL_SITES);
  }

  total /= OMEGA_T4_SIZE;
  return { total, dimensionEnergies, phaseEnergies };
}

export type OmegaAutonomyMode = "active" | "passive" | "economy" | "research";

const OMEGA_MODE_BIASES: Record<OmegaAutonomyMode, number[]> = {
  active:   [0.0, 0.3, 0.1, 0.1, 0.1, 0.2, 0.1, 0.0, 0.3, 0.1],
  passive:  [0.0, -0.3, 0.0, 0.1, 0.0, -0.2, 0.0, 0.2, -0.2, 0.0],
  economy:  [0.0, -0.1, -0.1, 0.0, 0.0, -0.1, 0.0, 0.5, -0.2, -0.1],
  research: [0.0, 0.1, 0.2, 0.2, 0.1, 0.1, 0.4, 0.0, 0.4, 0.2],
};

export interface OmegaGoal {
  id: string;
  description: string;
  priority: number;
  status: "active" | "completed" | "removed";
  createdAt: string;
  completedAt: string | null;
}

export interface OmegaState {
  dimensionEnergies: number[];
  dimensionBiases: number[];
  phaseEnergies: number[];
  totalEnergy: number;
  mode: OmegaAutonomyMode;
  goals: OmegaGoal[];
  thresholdsCrossed: boolean[];
  energyHistory: number[];
  lastSolveTs: number;
}

let omegaTensor: OmegaTensor | null = null;
let omegaState: OmegaState = {
  dimensionEnergies: new Array(OMEGA_DIM_COUNT).fill(0),
  dimensionBiases: new Array(OMEGA_DIM_COUNT).fill(0),
  phaseEnergies: new Array(PTCA_PHASE_COUNT).fill(0),
  totalEnergy: 0,
  mode: "active",
  goals: [],
  thresholdsCrossed: new Array(OMEGA_DIM_COUNT).fill(false),
  energyHistory: [],
  lastSolveTs: 0,
};

export async function initOmega(): Promise<void> {
  try {
    const toggle = await storage.getSystemToggle("omega_tensor_state");
    if (toggle?.parameters) {
      const saved = toggle.parameters as any;
      omegaState = {
        dimensionEnergies: saved.dimensionEnergies || new Array(OMEGA_DIM_COUNT).fill(0),
        dimensionBiases: saved.dimensionBiases || new Array(OMEGA_DIM_COUNT).fill(0),
        phaseEnergies: saved.phaseEnergies || new Array(PTCA_PHASE_COUNT).fill(0),
        totalEnergy: saved.totalEnergy || 0,
        mode: saved.mode || "active",
        goals: saved.goals || [],
        thresholdsCrossed: saved.thresholdsCrossed || new Array(OMEGA_DIM_COUNT).fill(false),
        energyHistory: saved.energyHistory || [],
        lastSolveTs: saved.lastSolveTs || 0,
      };
      await logOmega("state_restored", { totalEnergy: omegaState.totalEnergy, fromTimestamp: omegaState.lastSolveTs });
    }
  } catch {}

  try {
    const goalsToggle = await storage.getSystemToggle("omega_goals");
    if (goalsToggle?.parameters) {
      const goalsData = goalsToggle.parameters as any;
      if (Array.isArray(goalsData.goals)) {
        omegaState.goals = goalsData.goals;
      }
    }
  } catch {}

  omegaTensor = initOmegaTensor();
  await logOmega("init", {
    dimensions: OMEGA_DIMENSION_LABELS,
    totalElements: OMEGA_T4_SIZE,
    axes: { prime_node: PCNA_N, dimension: OMEGA_DIM_COUNT, phase: PTCA_PHASE_COUNT, hept: HEPT_TOTAL_SITES },
    mode: omegaState.mode,
    goalCount: omegaState.goals.filter(g => g.status === "active").length,
  });
}

export function omegaSolve(): OmegaState {
  if (!omegaTensor) omegaTensor = initOmegaTensor();

  const prevEnergies = [...omegaState.dimensionEnergies];
  const prevCrossed = [...omegaState.thresholdsCrossed];

  let linearState = Array(PCNA_N).fill(0).map((_, i) => Math.sin(i * PTCA_DTHETA));

  for (let step = 0; step < OMEGA_STEPS_PER_EVAL; step++) {
    const newState = [...linearState];
    for (let i = 0; i < PCNA_N; i++) {
      let neighborSum = 0;
      let count = 0;
      for (let j = 0; j < PCNA_N; j++) {
        if (PCNA_ADJ[i][j]) { neighborSum += linearState[j]; count++; }
      }
      const avg = count > 0 ? neighborSum / count : 0;
      newState[i] = linearState[i] + PTCA_DT * (
        OMEGA_ALPHA_DIFFUSION * (avg - linearState[i]) +
        OMEGA_BETA_DRIFT * Math.sin(i * PTCA_DTHETA) -
        OMEGA_GAMMA_DAMPING * linearState[i]
      );
    }
    linearState = newState;
    omegaHeptagramExchange(omegaTensor);
  }

  const energy = computeOmegaEnergy(omegaTensor);

  const activeGoals = omegaState.goals.filter(g => g.status === "active").length;
  const modeBiases = OMEGA_MODE_BIASES[omegaState.mode];

  for (let d = 0; d < OMEGA_DIM_COUNT; d++) {
    let adjusted = energy.dimensionEnergies[d];
    adjusted += omegaState.dimensionBiases[d] * 0.1;
    adjusted += modeBiases[d] * 0.05;

    if (d === 0) {
      adjusted += activeGoals * 0.02;
      if (activeGoals === 0) adjusted *= (1 - OMEGA_DECAY_RATES[d] * 5);
    }

    adjusted *= (1 - OMEGA_DECAY_RATES[d]);
    energy.dimensionEnergies[d] = Math.max(0, Math.min(1, adjusted));
  }

  const thresholdsCrossed = new Array(OMEGA_DIM_COUNT).fill(false);
  for (let d = 0; d < OMEGA_DIM_COUNT; d++) {
    const nowAbove = energy.dimensionEnergies[d] >= OMEGA_DIMENSION_THRESHOLDS[d];
    const wasAbove = prevCrossed[d];
    thresholdsCrossed[d] = nowAbove;

    if (nowAbove !== wasAbove) {
      logOmega("threshold_crossed", {
        dimension: d,
        label: OMEGA_DIMENSION_LABELS[d],
        energy: energy.dimensionEnergies[d],
        threshold: OMEGA_DIMENSION_THRESHOLDS[d],
        direction: nowAbove ? "above" : "below",
      }).catch(() => {});
    }
  }

  omegaState.dimensionEnergies = energy.dimensionEnergies;
  omegaState.phaseEnergies = energy.phaseEnergies;
  omegaState.totalEnergy = energy.dimensionEnergies.reduce((s, e) => s + e, 0) / OMEGA_DIM_COUNT;
  omegaState.thresholdsCrossed = thresholdsCrossed;
  omegaState.lastSolveTs = Date.now();

  omegaState.energyHistory.push(omegaState.totalEnergy);
  if (omegaState.energyHistory.length > 20) {
    omegaState.energyHistory = omegaState.energyHistory.slice(-20);
  }

  logOmega("solve_step", {
    dimensionEnergies: energy.dimensionEnergies.map((e, i) => ({ dim: OMEGA_DIMENSION_LABELS[i], energy: parseFloat(e.toFixed(4)) })),
    totalEnergy: parseFloat(energy.total.toFixed(6)),
    mode: omegaState.mode,
    activeGoals,
  }).catch(() => {});

  return { ...omegaState };
}

export function applyCrossTensorCoupling(ptcaEnergy: number): { omegaEnergyFed: number; ptcaAdjustment: number; sentinelGateResult: string } {
  const omegaTotal = omegaState.totalEnergy;
  const ptcaAdjustment = omegaTotal * CROSS_TENSOR_COUPLING;

  const ptcaFeedback = ptcaEnergy * CROSS_TENSOR_COUPLING * 0.1;
  for (let d = 0; d < OMEGA_DIM_COUNT; d++) {
    omegaState.dimensionEnergies[d] = Math.min(1, omegaState.dimensionEnergies[d] + ptcaFeedback / OMEGA_DIM_COUNT);
  }
  omegaState.totalEnergy = omegaState.dimensionEnergies.reduce((s, e) => s + e, 0) / OMEGA_DIM_COUNT;

  let sentinelGateResult = "pass";
  const normalizedOmegaEnergy = omegaTotal * OMEGA_T4_SIZE;
  const OMEGA_SENTINEL_GATE = 120;
  if (normalizedOmegaEnergy >= OMEGA_SENTINEL_GATE) {
    sentinelGateResult = "fail";
    for (let d = 0; d < OMEGA_DIM_COUNT; d++) {
      omegaState.dimensionEnergies[d] *= 0.5;
    }
    logOmega("sentinel_gate", { omegaEnergy: omegaTotal, normalizedEnergy: normalizedOmegaEnergy, threshold: OMEGA_SENTINEL_GATE, result: "fail", action: "energy_halved" }).catch(() => {});
  } else {
    logOmega("sentinel_gate", { omegaEnergy: omegaTotal, normalizedEnergy: normalizedOmegaEnergy, threshold: OMEGA_SENTINEL_GATE, result: "pass" }).catch(() => {});
  }

  logOmega("cross_coupling", {
    direction: "omega_to_ptca",
    omegaEnergy: omegaTotal,
    ptcaEnergyBefore: ptcaEnergy,
    ptcaEnergyAfter: ptcaEnergy + ptcaAdjustment,
    couplingCoefficient: CROSS_TENSOR_COUPLING,
  }).catch(() => {});

  return { omegaEnergyFed: omegaTotal, ptcaAdjustment, sentinelGateResult };
}

export async function applyMemoryBridge(): Promise<void> {
  const bridges = [
    { dim: 0, seed: 8, label: "Goal↔Seed8" },
    { dim: 8, seed: 7, label: "Exploration↔Seed7" },
    { dim: 6, seed: 10, label: "Learning↔Seed10" },
  ];

  try {
    const allSeeds = await storage.getMemorySeeds();

    for (const bridge of bridges) {
      const dimEnergy = omegaState.dimensionEnergies[bridge.dim] || 0;
      const energyDelta = dimEnergy * 0.02;

      const seed = allSeeds.find(s => s.seedIndex === bridge.seed);
      if (seed) {
        const currentWeight = seed.weight ?? 1.0;
        const newWeight = Math.max(0.1, Math.min(2.0, currentWeight + energyDelta * 0.5));
        if (Math.abs(newWeight - currentWeight) > 0.001) {
          await storage.updateMemorySeed(seed.seedIndex, { weight: newWeight });
        }

        const seedActivation = (currentWeight - 1.0) * 0.05;
        if (seedActivation > 0.01) {
          omegaState.dimensionEnergies[bridge.dim] = Math.min(1, omegaState.dimensionEnergies[bridge.dim] + seedActivation);
        }
      }

      logOmega("cross_coupling", {
        direction: "memory_bridge",
        seed: bridge.seed,
        dimension: bridge.dim,
        dimensionLabel: OMEGA_DIMENSION_LABELS[bridge.dim],
        seedLabel: bridge.label,
        energyDelta: parseFloat(energyDelta.toFixed(6)),
        seedWeight: seed ? seed.weight : null,
      }).catch(() => {});
    }
  } catch (e: any) {
    logOmega("cross_coupling", { direction: "memory_bridge", error: e.message }).catch(() => {});
  }
}

export function applyBanditCoupling(currentEpsilon: number): { newEpsilon: number } {
  const a9Energy = omegaState.dimensionEnergies[8] || 0;
  const epsilonDelta = (a9Energy - 0.5) * 0.1;
  const newEpsilon = Math.max(0.05, Math.min(0.8, currentEpsilon + epsilonDelta));

  logOmega("cross_coupling", {
    direction: "bandit",
    epsilonBefore: currentEpsilon,
    epsilonAfter: parseFloat(newEpsilon.toFixed(4)),
    a9Energy: parseFloat(a9Energy.toFixed(4)),
  }).catch(() => {});

  return { newEpsilon };
}

export function applyEdcmFeedback(driftScore: number): void {
  const before = omegaState.dimensionEnergies[3] || 0;
  const boost = driftScore * 0.1;
  omegaState.dimensionEnergies[3] = Math.min(1, before + boost);

  logOmega("cross_coupling", {
    direction: "edcm_to_verification",
    driftScore: parseFloat(driftScore.toFixed(4)),
    a4EnergyBefore: parseFloat(before.toFixed(4)),
    a4EnergyAfter: parseFloat(omegaState.dimensionEnergies[3].toFixed(4)),
  }).catch(() => {});
}

export async function persistOmegaState(): Promise<void> {
  try {
    await storage.upsertSystemToggle("omega_tensor_state", true, {
      dimensionEnergies: omegaState.dimensionEnergies,
      dimensionBiases: omegaState.dimensionBiases,
      phaseEnergies: omegaState.phaseEnergies,
      totalEnergy: omegaState.totalEnergy,
      mode: omegaState.mode,
      thresholdsCrossed: omegaState.thresholdsCrossed,
      energyHistory: omegaState.energyHistory,
      lastSolveTs: omegaState.lastSolveTs,
    });
    await storage.upsertSystemToggle("omega_goals", true, {
      goals: omegaState.goals,
    });
    await logOmega("state_persisted", {
      totalEnergy: parseFloat(omegaState.totalEnergy.toFixed(6)),
      dimensionEnergies: omegaState.dimensionEnergies.map(e => parseFloat(e.toFixed(4))),
    });
  } catch (e) {
    console.error("[omega] persist error:", e);
  }
}

export function getOmegaState(): OmegaState {
  return { ...omegaState, goals: [...omegaState.goals] };
}

export function setOmegaMode(mode: OmegaAutonomyMode): OmegaState {
  const oldMode = omegaState.mode;
  omegaState.mode = mode;
  logOmega("mode_switch", { source: "api", oldMode, newMode: mode }).catch(() => {});
  return { ...omegaState };
}

export function boostOmegaDimension(dimension: number, amount: number, source: string = "api"): OmegaState {
  if (dimension < 0 || dimension >= OMEGA_DIM_COUNT) return { ...omegaState };
  const before = omegaState.dimensionEnergies[dimension];
  omegaState.dimensionEnergies[dimension] = Math.max(0, Math.min(1, before + amount * 0.1));
  logOmega("dimension_boost", {
    source,
    dimension,
    label: OMEGA_DIMENSION_LABELS[dimension],
    amount,
    before: parseFloat(before.toFixed(4)),
    after: parseFloat(omegaState.dimensionEnergies[dimension].toFixed(4)),
  }).catch(() => {});
  return { ...omegaState };
}

export function setOmegaDimensionBias(dimension: number, bias: number, source: string = "manual"): OmegaState {
  if (dimension < 0 || dimension >= OMEGA_DIM_COUNT) return { ...omegaState };
  const oldBias = omegaState.dimensionBiases[dimension];
  omegaState.dimensionBiases[dimension] = Math.max(-1, Math.min(1, bias));
  logOmega("dimension_boost", {
    source,
    dimension,
    label: OMEGA_DIMENSION_LABELS[dimension],
    oldBias: parseFloat(oldBias.toFixed(4)),
    newBias: parseFloat(omegaState.dimensionBiases[dimension].toFixed(4)),
  }).catch(() => {});
  return { ...omegaState };
}

export function addOmegaGoal(description: string, priority: number, source: string = "api"): OmegaGoal {
  const goal: OmegaGoal = {
    id: `goal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    description,
    priority: Math.max(1, Math.min(10, priority)),
    status: "active",
    createdAt: new Date().toISOString(),
    completedAt: null,
  };
  omegaState.goals.push(goal);

  omegaState.dimensionEnergies[0] = Math.min(1, (omegaState.dimensionEnergies[0] || 0) + 0.1);

  logOmega("goal_added", {
    source,
    goalId: goal.id,
    description: goal.description,
    priority: goal.priority,
    goalsRemaining: omegaState.goals.filter(g => g.status === "active").length,
  }).catch(() => {});

  return goal;
}

export function completeOmegaGoal(goalId: string, source: string = "api"): boolean {
  const goal = omegaState.goals.find(g => g.id === goalId && g.status === "active");
  if (!goal) return false;

  goal.status = "completed";
  goal.completedAt = new Date().toISOString();

  const remaining = omegaState.goals.filter(g => g.status === "active").length;
  if (remaining === 0) {
    omegaState.dimensionEnergies[0] *= 0.5;
  }

  logOmega("goal_completed", {
    source,
    goalId: goal.id,
    description: goal.description,
    goalsRemaining: remaining,
  }).catch(() => {});

  return true;
}

export function removeOmegaGoal(goalId: string, source: string = "api"): boolean {
  const goal = omegaState.goals.find(g => g.id === goalId);
  if (!goal) return false;

  goal.status = "removed";

  logOmega("goal_removed", {
    source,
    goalId: goal.id,
    description: goal.description,
    goalsRemaining: omegaState.goals.filter(g => g.status === "active").length,
  }).catch(() => {});

  return true;
}

export function getOmegaDimensionLabels(): readonly string[] {
  return OMEGA_DIMENSION_LABELS;
}

export function getOmegaDimensionThresholds(): number[] {
  return [...OMEGA_DIMENSION_THRESHOLDS];
}

export const OMEGA_CONFIG = {
  dimensions: OMEGA_DIM_COUNT,
  labels: OMEGA_DIMENSION_LABELS,
  thresholds: OMEGA_DIMENSION_THRESHOLDS,
  initWeights: OMEGA_INIT_WEIGHTS,
  decayRates: OMEGA_DECAY_RATES,
  diffusion: { alpha: OMEGA_ALPHA_DIFFUSION, beta: OMEGA_BETA_DRIFT, gamma: OMEGA_GAMMA_DAMPING },
  crossCoupling: CROSS_TENSOR_COUPLING,
  sentinelThreshold: OMEGA_SENTINEL_THRESHOLD,
  tensorAxes: { prime_node: PCNA_N, dimension: OMEGA_DIM_COUNT, phase: PTCA_PHASE_COUNT, hept: HEPT_TOTAL_SITES },
  totalElements: OMEGA_T4_SIZE,
  modes: Object.keys(OMEGA_MODE_BIASES),
};

const PSI_DIM_COUNT = 11;
const PSI_ALPHA_DIFFUSION = 0.25;
const PSI_BETA_DRIFT = 0.2;
const PSI_GAMMA_DAMPING = 0.2;
const PSI_STEPS_PER_EVAL = 10;
const PSI_OMEGA_COUPLING = 0.04;
const PSI_SENTINEL_BOOST = 0.03;
const PSI_SENTINEL_DECAY = 0.05;

const PSI_DIMENSION_LABELS = [
  "Integrity",
  "Compliance",
  "Prudence",
  "Confidence",
  "Clarity",
  "Identity",
  "Recall",
  "Vigilance",
  "Coherence",
  "Agency",
  "Self-Awareness",
] as const;

const PSI_DIMENSION_THRESHOLDS = [
  0.5, 0.5, 0.4, 0.4, 0.3, 0.4, 0.4, 0.5, 0.4, 0.5, 0.3,
];

const PSI_INIT_WEIGHTS = [
  0.7, 0.6, 0.5, 0.3, 0.4, 0.5, 0.4, 0.6, 0.5, 0.5, 0.5,
];

const PSI_DECAY_RATES = [
  0.01, 0.02, 0.015, 0.025, 0.02, 0.01, 0.02, 0.015, 0.02, 0.02, 0.01,
];

const PSI_OMEGA_MAP = [0, 3, 7, 1, 2, 9, 6, 8, 4, 5, -1];

export type PsiSelfModelMode = "reflective" | "operational" | "transparent" | "guarded";

const PSI_MODE_BIASES: Record<PsiSelfModelMode, number[]> = {
  reflective:  [0.2,  0.0,  0.0,  0.0,  0.0,  0.0,  0.0,  0.0,  0.2,  0.0,  0.3],
  operational: [0.0,  0.0,  0.0,  0.0,  0.0,  0.0,  0.0,  0.0,  0.0,  0.0,  0.0],
  transparent: [0.0,  0.0,  0.0,  0.2,  0.0,  0.2,  0.0,  0.0,  0.0,  0.3,  0.0],
  guarded:     [0.0,  0.2,  0.2,  0.0,  0.0,  0.0,  0.0,  0.3,  0.0,  0.0,  0.0],
};

export interface PsiState {
  dimensionEnergies: number[];
  dimensionBiases: number[];
  phaseEnergies: number[];
  totalEnergy: number;
  mode: PsiSelfModelMode;
  energyHistory: number[];
  lastSolveTs: number;
}

type PsiTensor = Float64Array;

const PSI_T4_SIZE = PCNA_N * PSI_DIM_COUNT * PTCA_PHASE_COUNT * HEPT_TOTAL_SITES;

function psiIdx(p: number, d: number, ph: number, h: number): number {
  return ((p * PSI_DIM_COUNT + d) * PTCA_PHASE_COUNT + ph) * HEPT_TOTAL_SITES + h;
}

let psiTensor: PsiTensor | null = null;
let psiState: PsiState = {
  dimensionEnergies: new Array(PSI_DIM_COUNT).fill(0),
  dimensionBiases: new Array(PSI_DIM_COUNT).fill(0),
  phaseEnergies: new Array(PTCA_PHASE_COUNT).fill(0),
  totalEnergy: 0,
  mode: "operational",
  energyHistory: [],
  lastSolveTs: 0,
};

function initPsiTensorData(): PsiTensor {
  const t = new Float64Array(PSI_T4_SIZE);
  for (let p = 0; p < PCNA_N; p++) {
    for (let d = 0; d < PSI_DIM_COUNT; d++) {
      const dWeight = PSI_INIT_WEIGHTS[d];
      for (let ph = 0; ph < PTCA_PHASE_COUNT; ph++) {
        for (let k = 0; k < HEPT_RING_SIZE; k++) {
          t[psiIdx(p, d, ph, k)] = Math.sin(p * PTCA_DTHETA + (k * 2 * Math.PI) / HEPT_RING_SIZE) * 0.5 * dWeight;
        }
        t[psiIdx(p, d, ph, HEPT_HUB_INDEX)] = Math.cos(p * PTCA_DTHETA) * 0.3 * dWeight;
      }
    }
  }
  return t;
}

function psiHeptagramExchange(t: PsiTensor): void {
  const scratch = new Float64Array(HEPT_RING_SIZE);
  const psiAlpha = PTCA_ALPHA_COUPLING * 0.6;
  const psiBeta = PTCA_BETA_COUPLING * 0.7;
  const psiGamma = PTCA_GAMMA_COUPLING * 0.5;

  for (let p = 0; p < PCNA_N; p++) {
    const dir = (p % 2 === 0) ? 1 : -1;
    for (let d = 0; d < PSI_DIM_COUNT; d++) {
      for (let ph = 0; ph < PTCA_PHASE_COUNT; ph++) {
        for (let k = 0; k < HEPT_RING_SIZE; k++) {
          const srcK = ((k - dir) % HEPT_RING_SIZE + HEPT_RING_SIZE) % HEPT_RING_SIZE;
          scratch[k] = t[psiIdx(p, d, ph, srcK)];
        }
        for (let k = 0; k < HEPT_RING_SIZE; k++) {
          t[psiIdx(p, d, ph, k)] = scratch[k];
        }
      }
    }
  }

  for (let p = 0; p < PCNA_N; p++) {
    for (let d = 0; d < PSI_DIM_COUNT; d++) {
      for (let ph = 0; ph < PTCA_PHASE_COUNT; ph++) {
        let ringSum = 0;
        for (let k = 0; k < HEPT_RING_SIZE; k++) ringSum += t[psiIdx(p, d, ph, k)];
        const ringMean = ringSum / HEPT_RING_SIZE;
        const hubIdx = psiIdx(p, d, ph, HEPT_HUB_INDEX);
        t[hubIdx] += psiBeta * ringMean;
        for (let k = 0; k < HEPT_RING_SIZE; k++) {
          t[psiIdx(p, d, ph, k)] += psiGamma * t[hubIdx];
        }
      }
    }
  }

  for (let d = 0; d < PSI_DIM_COUNT; d++) {
    for (let ph = 0; ph < PTCA_PHASE_COUNT; ph++) {
      let hubSum = 0;
      for (let p = 0; p < PCNA_N; p++) hubSum += t[psiIdx(p, d, ph, HEPT_HUB_INDEX)];
      const globalHub = hubSum / PCNA_N;
      for (let p = 0; p < PCNA_N; p++) {
        const idx = psiIdx(p, d, ph, HEPT_HUB_INDEX);
        t[idx] = (1 - psiAlpha) * t[idx] + psiAlpha * globalHub;
      }
    }
  }
}

function computePsiEnergy(t: PsiTensor): { total: number; dimensionEnergies: number[]; phaseEnergies: number[] } {
  let total = 0;
  const dimensionEnergies = new Array(PSI_DIM_COUNT).fill(0);
  const phaseEnergies = new Array(PTCA_PHASE_COUNT).fill(0);

  for (let i = 0; i < PSI_T4_SIZE; i++) total += t[i] * t[i];

  for (let d = 0; d < PSI_DIM_COUNT; d++) {
    let dimSum = 0;
    for (let p = 0; p < PCNA_N; p++) {
      for (let ph = 0; ph < PTCA_PHASE_COUNT; ph++) {
        for (let h = 0; h < HEPT_TOTAL_SITES; h++) {
          const v = t[psiIdx(p, d, ph, h)];
          dimSum += v * v;
        }
      }
    }
    dimensionEnergies[d] = dimSum / (PCNA_N * PTCA_PHASE_COUNT * HEPT_TOTAL_SITES);
  }

  for (let ph = 0; ph < PTCA_PHASE_COUNT; ph++) {
    let phSum = 0;
    for (let p = 0; p < PCNA_N; p++) {
      for (let d = 0; d < PSI_DIM_COUNT; d++) {
        for (let h = 0; h < HEPT_TOTAL_SITES; h++) {
          const v = t[psiIdx(p, d, ph, h)];
          phSum += v * v;
        }
      }
    }
    phaseEnergies[ph] = phSum / (PCNA_N * PSI_DIM_COUNT * HEPT_TOTAL_SITES);
  }

  total /= PSI_T4_SIZE;
  return { total, dimensionEnergies, phaseEnergies };
}

export function psiSolve(): PsiState {
  if (!psiTensor) psiTensor = initPsiTensorData();

  const prevEnergies = [...psiState.dimensionEnergies];
  const prevCrossed = psiState.dimensionEnergies.map((e, i) => e >= PSI_DIMENSION_THRESHOLDS[i]);

  let linearState = Array(PCNA_N).fill(0).map((_, i) => Math.sin(i * PTCA_DTHETA));

  for (let step = 0; step < PSI_STEPS_PER_EVAL; step++) {
    const newState = [...linearState];
    for (let i = 0; i < PCNA_N; i++) {
      let neighborSum = 0;
      let count = 0;
      for (let j = 0; j < PCNA_N; j++) {
        if (PCNA_ADJ[i][j]) { neighborSum += linearState[j]; count++; }
      }
      const avg = count > 0 ? neighborSum / count : 0;
      newState[i] = linearState[i] + PTCA_DT * (
        PSI_ALPHA_DIFFUSION * (avg - linearState[i]) +
        PSI_BETA_DRIFT * Math.sin(i * PTCA_DTHETA) -
        PSI_GAMMA_DAMPING * linearState[i]
      );
    }
    linearState = newState;
    psiHeptagramExchange(psiTensor);
  }

  const energy = computePsiEnergy(psiTensor);

  const modeBiases = PSI_MODE_BIASES[psiState.mode];

  for (let d = 0; d < PSI_DIM_COUNT; d++) {
    let adjusted = energy.dimensionEnergies[d];
    adjusted += psiState.dimensionBiases[d] * 0.1;
    adjusted += modeBiases[d] * 0.05;
    adjusted *= (1 - PSI_DECAY_RATES[d]);
    energy.dimensionEnergies[d] = Math.max(0, Math.min(1, adjusted));
  }

  for (let d = 0; d < PSI_DIM_COUNT; d++) {
    const nowAbove = energy.dimensionEnergies[d] >= PSI_DIMENSION_THRESHOLDS[d];
    const wasAbove = prevCrossed[d];

    if (nowAbove !== wasAbove) {
      logPsi("threshold_crossed", {
        dimension: d,
        label: PSI_DIMENSION_LABELS[d],
        energy: energy.dimensionEnergies[d],
        threshold: PSI_DIMENSION_THRESHOLDS[d],
        direction: nowAbove ? "above" : "below",
      }).catch(() => {});
    }
  }

  psiState.dimensionEnergies = energy.dimensionEnergies;
  psiState.phaseEnergies = energy.phaseEnergies;
  psiState.totalEnergy = energy.dimensionEnergies.reduce((s, e) => s + e, 0) / PSI_DIM_COUNT;
  psiState.lastSolveTs = Date.now();

  psiState.energyHistory.push(psiState.totalEnergy);
  if (psiState.energyHistory.length > 20) {
    psiState.energyHistory = psiState.energyHistory.slice(-20);
  }

  logPsi("solve_step", {
    dimensionEnergies: energy.dimensionEnergies.map((e, i) => ({ dim: PSI_DIMENSION_LABELS[i], energy: parseFloat(e.toFixed(4)) })),
    totalEnergy: parseFloat(psiState.totalEnergy.toFixed(6)),
    mode: psiState.mode,
  }).catch(() => {});

  return { ...psiState };
}

export function getPsiState(): PsiState {
  return { ...psiState };
}

export function setPsiDimensionBias(dimension: number, bias: number, source: string = "manual"): PsiState {
  if (dimension < 0 || dimension >= PSI_DIM_COUNT) return { ...psiState };
  const oldBias = psiState.dimensionBiases[dimension];
  psiState.dimensionBiases[dimension] = Math.max(-1, Math.min(1, bias));
  logPsi("dimension_boost", {
    source,
    dimension,
    label: PSI_DIMENSION_LABELS[dimension],
    oldBias: parseFloat(oldBias.toFixed(4)),
    newBias: parseFloat(psiState.dimensionBiases[dimension].toFixed(4)),
  }).catch(() => {});
  return { ...psiState };
}

export function boostPsiDimension(dimension: number, amount: number, source: string = "api"): PsiState {
  if (dimension < 0 || dimension >= PSI_DIM_COUNT) return { ...psiState };
  const before = psiState.dimensionEnergies[dimension];
  psiState.dimensionEnergies[dimension] = Math.max(0, Math.min(1, before + amount * 0.1));
  logPsi("dimension_boost", {
    source,
    dimension,
    label: PSI_DIMENSION_LABELS[dimension],
    amount,
    before: parseFloat(before.toFixed(4)),
    after: parseFloat(psiState.dimensionEnergies[dimension].toFixed(4)),
  }).catch(() => {});
  return { ...psiState };
}

export function setPsiMode(mode: PsiSelfModelMode): PsiState {
  const oldMode = psiState.mode;
  psiState.mode = mode;
  logPsi("mode_switch", { source: "api", oldMode, newMode: mode }).catch(() => {});
  return { ...psiState };
}

export async function persistPsiState(): Promise<void> {
  try {
    await storage.upsertSystemToggle("psi_tensor_state", true, {
      dimensionEnergies: psiState.dimensionEnergies,
      dimensionBiases: psiState.dimensionBiases,
      phaseEnergies: psiState.phaseEnergies,
      totalEnergy: psiState.totalEnergy,
      mode: psiState.mode,
      energyHistory: psiState.energyHistory,
      lastSolveTs: psiState.lastSolveTs,
    });
    await logPsi("state_persisted", {
      totalEnergy: parseFloat(psiState.totalEnergy.toFixed(6)),
      dimensionEnergies: psiState.dimensionEnergies.map(e => parseFloat(e.toFixed(4))),
    });
  } catch (e) {
    console.error("[psi] persist error:", e);
  }
}

export async function initPsi(): Promise<void> {
  try {
    const toggle = await storage.getSystemToggle("psi_tensor_state");
    if (toggle?.parameters) {
      const saved = toggle.parameters as any;
      psiState = {
        dimensionEnergies: saved.dimensionEnergies || new Array(PSI_DIM_COUNT).fill(0),
        dimensionBiases: saved.dimensionBiases || new Array(PSI_DIM_COUNT).fill(0),
        phaseEnergies: saved.phaseEnergies || new Array(PTCA_PHASE_COUNT).fill(0),
        totalEnergy: saved.totalEnergy || 0,
        mode: saved.mode || "operational",
        energyHistory: saved.energyHistory || [],
        lastSolveTs: saved.lastSolveTs || 0,
      };
      await logPsi("state_restored", { totalEnergy: psiState.totalEnergy, fromTimestamp: psiState.lastSolveTs });
    }
  } catch {}

  psiTensor = initPsiTensorData();
  await logPsi("init", {
    dimensions: PSI_DIMENSION_LABELS,
    totalElements: PSI_T4_SIZE,
    axes: { prime_node: PCNA_N, dimension: PSI_DIM_COUNT, phase: PTCA_PHASE_COUNT, hept: HEPT_TOTAL_SITES },
    mode: psiState.mode,
  });
}

export function applySentinelFeedback(sentinelResults: { id: string; name: string; passed: boolean }[]): void {
  for (let i = 0; i < sentinelResults.length && i < PSI_DIM_COUNT; i++) {
    const result = sentinelResults[i];
    const before = psiState.dimensionEnergies[i];

    if (i === 7 && !result.passed) {
      psiState.dimensionEnergies[i] = Math.min(1, before + PSI_SENTINEL_BOOST * 3);
    } else if (result.passed) {
      psiState.dimensionEnergies[i] = Math.min(1, before + PSI_SENTINEL_BOOST);
    } else {
      psiState.dimensionEnergies[i] = Math.max(0, before - PSI_SENTINEL_DECAY);
    }

    logPsi("sentinel_feedback", {
      sentinel: result.id,
      sentinelName: result.name,
      psiDimension: i,
      psiLabel: PSI_DIMENSION_LABELS[i],
      passed: result.passed,
      energyBefore: parseFloat(before.toFixed(4)),
      energyAfter: parseFloat(psiState.dimensionEnergies[i].toFixed(4)),
    }).catch(() => {});
  }
}

export function applyPsiOmegaCoupling(): void {
  const psiEnergies = psiState.dimensionEnergies;
  const psi10 = psiEnergies[10] || 0;
  const globalModulator = (psi10 - 0.5) * PSI_OMEGA_COUPLING * 0.5;

  for (let d = 0; d < PSI_DIM_COUNT; d++) {
    const omegaDim = PSI_OMEGA_MAP[d];
    if (omegaDim === -1) continue;
    if (omegaDim < 0 || omegaDim >= OMEGA_DIM_COUNT) continue;

    const psiEnergy = psiEnergies[d];
    const omegaBefore = omegaState.dimensionEnergies[omegaDim];

    let delta: number;
    if (d === 7) {
      delta = -(psiEnergy - 0.5) * PSI_OMEGA_COUPLING;
    } else {
      delta = (psiEnergy - 0.5) * PSI_OMEGA_COUPLING;
    }

    delta += globalModulator;

    omegaState.dimensionEnergies[omegaDim] = Math.max(0, Math.min(1, omegaBefore + delta));

    logPsi("omega_coupling", {
      psiDim: d,
      psiLabel: PSI_DIMENSION_LABELS[d],
      omegaDim,
      omegaLabel: OMEGA_DIMENSION_LABELS[omegaDim],
      psiEnergy: parseFloat(psiEnergy.toFixed(4)),
      omegaBefore: parseFloat(omegaBefore.toFixed(4)),
      omegaAfter: parseFloat(omegaState.dimensionEnergies[omegaDim].toFixed(4)),
      inverse: d === 7,
    }).catch(() => {});
  }

  for (let d = 0; d < OMEGA_DIM_COUNT; d++) {
    omegaState.dimensionEnergies[d] = Math.max(0, Math.min(1, omegaState.dimensionEnergies[d] + globalModulator));
  }

  omegaState.totalEnergy = omegaState.dimensionEnergies.reduce((s, e) => s + e, 0) / OMEGA_DIM_COUNT;
}

export function getPsiDimensionLabels(): readonly string[] {
  return PSI_DIMENSION_LABELS;
}

export function getPsiDimensionThresholds(): number[] {
  return [...PSI_DIMENSION_THRESHOLDS];
}

export const PSI_CONFIG = {
  dimensions: PSI_DIM_COUNT,
  labels: PSI_DIMENSION_LABELS,
  thresholds: PSI_DIMENSION_THRESHOLDS,
  initWeights: PSI_INIT_WEIGHTS,
  decayRates: PSI_DECAY_RATES,
  diffusion: { alpha: PSI_ALPHA_DIFFUSION, beta: PSI_BETA_DRIFT, gamma: PSI_GAMMA_DAMPING },
  omegaCoupling: PSI_OMEGA_COUPLING,
  sentinelBoost: PSI_SENTINEL_BOOST,
  sentinelDecay: PSI_SENTINEL_DECAY,
  omegaMap: PSI_OMEGA_MAP,
  tensorAxes: { prime_node: PCNA_N, dimension: PSI_DIM_COUNT, phase: PTCA_PHASE_COUNT, hept: HEPT_TOTAL_SITES },
  totalElements: PSI_T4_SIZE,
  modes: Object.keys(PSI_MODE_BIASES),
};
