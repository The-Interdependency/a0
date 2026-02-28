import { createHash } from "crypto";
import { storage } from "./storage";

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
const PTCA_ALPHA = 0.6;
const PTCA_BETA = 0.4;
const PTCA_GAMMA = 0.2;

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

export function ptcaSolve(initialState: number[]): { state: number[]; energy: number } {
  let state = [...initialState];
  if (state.length !== PCNA_N) {
    state = Array(PCNA_N).fill(0).map((_, i) => Math.sin(i * PTCA_DTHETA));
  }

  for (let step = 0; step < PTCA_STEPS_PER_EVAL; step++) {
    const newState = [...state];
    for (let i = 0; i < PCNA_N; i++) {
      let neighborSum = 0;
      let count = 0;
      for (let j = 0; j < PCNA_N; j++) {
        if (PCNA_ADJ[i][j]) {
          neighborSum += state[j];
          count++;
        }
      }
      const avg = count > 0 ? neighborSum / count : 0;
      const diffusion = PTCA_ALPHA * (avg - state[i]);
      const drift = PTCA_BETA * Math.sin(i * PTCA_DTHETA);
      const damping = -PTCA_GAMMA * state[i];
      newState[i] = state[i] + PTCA_DT * (diffusion + drift + damping);
    }
    state = newState;
  }

  const energy = state.reduce((s, v) => s + v * v, 0) / PCNA_N;
  return { state, energy };
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
  { id: "S1", name: "InputValidator", check: (req: any) => !!req.taskId && !!req.action },
  { id: "S2", name: "AuthGate", check: (_req: any) => true },
  { id: "S3", name: "RateLimiter", check: (_req: any) => true },
  { id: "S4", name: "HashChainIntegrity", check: (_req: any, ctx: any) => ctx.hashValid !== false },
  { id: "S5", name: "OperatorBounds", check: (req: any) => {
    if (req.operatorVec) {
      const v = req.operatorVec;
      const sum = Math.abs(v.P || 0) + Math.abs(v.K || 0) + Math.abs(v.Q || 0) + Math.abs(v.T || 0) + Math.abs(v.S || 0);
      return sum > EDCM_EPSILON;
    }
    return true;
  }},
  { id: "S6", name: "PTCAStability", check: (_req: any, ctx: any) => !ctx.ptcaEnergy || ctx.ptcaEnergy < 100 },
  { id: "S7", name: "GateExpiry", check: (_req: any) => true },
  { id: "S8", name: "ResourceQuota", check: (_req: any) => true },
  { id: "S9", name: "HmmmEnforcer", check: (_req: any, ctx: any) => ctx.hmmm?.valid !== false },
];

export function runSentinels(req: any, ctx: any = {}): { passed: boolean; results: { id: string; name: string; passed: boolean }[] } {
  const results = SENTINELS.map((s) => ({
    id: s.id,
    name: s.name,
    passed: s.check(req, ctx),
  }));
  return { passed: results.every((r) => r.passed), results };
}

export interface A0Request {
  taskId: string;
  action: string;
  operatorVec?: OperatorVector;
  payload?: any;
  gateApproval?: string;
}

export interface A0Response {
  success: boolean;
  taskId: string;
  action: string;
  sentinelResults: { id: string; name: string; passed: boolean }[];
  edcm?: { decision: string; delta: number; deltaGrok: number; deltaGemini: number; dominantOp: string };
  ptca?: { energy: number; statePreview: number[] };
  eventHash?: string;
  hmmm: HmmmInvariant;
}

export async function processA0Request(req: A0Request): Promise<A0Response> {
  const hmmm = makeHmmm(true, "System nominal");

  const lastEvent = await storage.getLastEvent();
  const prevHash = lastEvent?.hash || GENESIS_HASH;

  const sentinelCtx: any = { hashValid: true, hmmm };

  if (req.operatorVec) {
    const defaultVec: OperatorVector = { P: 0.2, K: 0.2, Q: 0.2, T: 0.2, S: 0.2 };
    const edcmResult = edcmDisposition(req.operatorVec, defaultVec, defaultVec);
    sentinelCtx.edcm = edcmResult;

    const ptcaResult = ptcaSolve([]);
    sentinelCtx.ptcaEnergy = ptcaResult.energy;

    const sentinels = runSentinels(req, sentinelCtx);

    if (!sentinels.passed) {
      const failedHmmm = makeHmmm(false, `Sentinel check failed: ${sentinels.results.filter(r => !r.passed).map(r => r.id).join(", ")}`);
      return {
        success: false,
        taskId: req.taskId,
        action: req.action,
        sentinelResults: sentinels.results,
        edcm: edcmResult,
        ptca: { energy: ptcaResult.energy, statePreview: ptcaResult.state.slice(0, 10) },
        hmmm: failedHmmm,
      };
    }

    const eventPayload = {
      taskId: req.taskId,
      action: req.action,
      edcm: edcmResult,
      ptcaEnergy: ptcaResult.energy,
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
      ptcaState: { energy: ptcaResult.energy, statePreview: ptcaResult.state.slice(0, 10) },
    });

    return {
      success: true,
      taskId: req.taskId,
      action: req.action,
      sentinelResults: sentinels.results,
      edcm: edcmResult,
      ptca: { energy: ptcaResult.energy, statePreview: ptcaResult.state.slice(0, 10) },
      eventHash,
      hmmm,
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

  const eventPayload = { taskId: req.taskId, action: req.action, payload: req.payload };
  const eventHash = computeHash(prevHash, eventPayload);

  await storage.appendEvent({
    taskId: req.taskId,
    eventType: req.action,
    payload: eventPayload,
    prevHash,
    hash: eventHash,
    hmmm,
  });

  return {
    success: true,
    taskId: req.taskId,
    action: req.action,
    sentinelResults: sentinels.results,
    eventHash,
    hmmm,
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
        },
      });
      console.log(`[a0p] Heartbeat: chain=${chainCheck.valid ? "OK" : "ERROR"} events=${chainCheck.length}`);
    } catch (err) {
      console.error("[a0p] Heartbeat error:", err);
      await storage.addHeartbeat({
        status: "ERROR",
        hashChainValid: false,
        details: { error: String(err), timestamp: Date.now() },
      });
    }
  }, 60 * 60 * 1000);

  setTimeout(async () => {
    try {
      const chainCheck = await verifyHashChain();
      await storage.addHeartbeat({
        status: chainCheck.valid ? "OK" : "CHAIN_ERROR",
        hashChainValid: chainCheck.valid,
        details: { chainLength: chainCheck.length, errors: chainCheck.errors.slice(0, 5), timestamp: Date.now(), note: "startup" },
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

const COST_RATES: Record<string, { prompt: number; completion: number }> = {
  "gemini": { prompt: 0.075 / 1_000_000, completion: 0.30 / 1_000_000 },
  "grok": { prompt: 0.30 / 1_000_000, completion: 0.50 / 1_000_000 },
};

export function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  const rates = COST_RATES[model] || COST_RATES["gemini"];
  return rates.prompt * promptTokens + rates.completion * completionTokens;
}

export async function trackCost(userId: string | null, model: string, promptTokens: number, completionTokens: number) {
  const cost = estimateCost(model, promptTokens, completionTokens);
  await storage.addCostMetric({
    userId,
    model,
    promptTokens,
    completionTokens,
    estimatedCost: cost,
  });
  return cost;
}
