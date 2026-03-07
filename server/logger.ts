import { appendFile, readFile, mkdir, readdir, stat } from "fs/promises";
import path from "path";
import { createHash } from "crypto";

const LOGS_DIR = path.resolve("logs");
const TRANSCRIPTS_DIR = path.join(LOGS_DIR, "transcripts");
const AI_TRANSCRIPTS_DIR = path.join(LOGS_DIR, "ai-transcripts");

const LOG_STREAMS = {
  master: "a0p-master.jsonl",
  edcm: "edcm-metrics.jsonl",
  memory: "memory-tensor.jsonl",
  sentinel: "sentinel-memory.jsonl",
  interference: "memory-interference.jsonl",
  attribution: "memory-attribution.jsonl",
} as const;

export type LogStream = keyof typeof LOG_STREAMS;

interface LogEntry {
  timestamp: string;
  stream: string;
  subsystem: string;
  event: string;
  data: Record<string, any>;
}

let loggingEnabled = true;
let streamToggles: Record<string, boolean> = {
  master: true,
  edcm: true,
  memory: true,
  sentinel: true,
  interference: true,
  attribution: true,
  transcripts: true,
  "ai-transcripts": true,
};

let initialized = false;

async function ensureDirs() {
  if (initialized) return;
  await mkdir(LOGS_DIR, { recursive: true });
  await mkdir(TRANSCRIPTS_DIR, { recursive: true });
  await mkdir(AI_TRANSCRIPTS_DIR, { recursive: true });
  initialized = true;
}

function buildEntry(stream: string, subsystem: string, event: string, data: Record<string, any>): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    stream,
    subsystem,
    event,
    data,
  };
}

async function appendToFile(filePath: string, entry: LogEntry): Promise<void> {
  await ensureDirs();
  await appendFile(filePath, JSON.stringify(entry) + "\n", "utf-8");
}

function getStreamPath(stream: LogStream): string {
  return path.join(LOGS_DIR, LOG_STREAMS[stream]);
}

export function setLoggingEnabled(enabled: boolean): void {
  loggingEnabled = enabled;
}

export function setStreamToggle(stream: string, enabled: boolean): void {
  streamToggles[stream] = enabled;
}

export function getStreamToggles(): Record<string, boolean> {
  return { ...streamToggles };
}

export function isStreamEnabled(stream: string): boolean {
  return loggingEnabled && (streamToggles[stream] !== false);
}

export function updateTogglesFromSystem(params: Record<string, any> | null | undefined): void {
  if (!params) return;
  if (typeof params.enabled === "boolean") {
    loggingEnabled = params.enabled;
  }
  if (params.streams && typeof params.streams === "object") {
    for (const [k, v] of Object.entries(params.streams)) {
      if (typeof v === "boolean") {
        streamToggles[k] = v;
      }
    }
  }
}

export async function logMaster(subsystem: string, event: string, data: Record<string, any>): Promise<void> {
  if (!isStreamEnabled("master")) return;
  const entry = buildEntry("master", subsystem, event, data);
  try {
    await appendToFile(getStreamPath("master"), entry);
  } catch (e) {
    console.error("Logger master write error:", e);
  }
}

export async function logEdcm(event: string, data: Record<string, any>): Promise<void> {
  if (!isStreamEnabled("edcm")) return;
  const entry = buildEntry("edcm", "edcm", event, data);
  try {
    await appendToFile(getStreamPath("edcm"), entry);
    if (isStreamEnabled("master")) {
      await appendToFile(getStreamPath("master"), entry);
    }
  } catch (e) {
    console.error("Logger edcm write error:", e);
  }
}

export async function logMemory(event: string, data: Record<string, any>): Promise<void> {
  if (!isStreamEnabled("memory")) return;
  const entry = buildEntry("memory", "memory_tensor", event, data);
  try {
    await appendToFile(getStreamPath("memory"), entry);
    if (isStreamEnabled("master")) {
      await appendToFile(getStreamPath("master"), entry);
    }
  } catch (e) {
    console.error("Logger memory write error:", e);
  }
}

export async function logSentinel(event: string, data: Record<string, any>): Promise<void> {
  if (!isStreamEnabled("sentinel")) return;
  const entry = buildEntry("sentinel", "sentinel", event, data);
  try {
    await appendToFile(getStreamPath("sentinel"), entry);
    if (isStreamEnabled("master")) {
      await appendToFile(getStreamPath("master"), entry);
    }
  } catch (e) {
    console.error("Logger sentinel write error:", e);
  }
}

export async function logInterference(event: string, data: Record<string, any>): Promise<void> {
  if (!isStreamEnabled("interference")) return;
  const entry = buildEntry("interference", "memory_interference", event, data);
  try {
    await appendToFile(getStreamPath("interference"), entry);
    if (isStreamEnabled("master")) {
      await appendToFile(getStreamPath("master"), entry);
    }
  } catch (e) {
    console.error("Logger interference write error:", e);
  }
}

export async function logAttribution(event: string, data: Record<string, any>): Promise<void> {
  if (!isStreamEnabled("attribution")) return;
  const entry = buildEntry("attribution", "memory_attribution", event, data);
  try {
    await appendToFile(getStreamPath("attribution"), entry);
    if (isStreamEnabled("master")) {
      await appendToFile(getStreamPath("master"), entry);
    }
  } catch (e) {
    console.error("Logger attribution write error:", e);
  }
}

export async function logTranscript(transcriptHash: string, event: string, data: Record<string, any>): Promise<void> {
  if (!isStreamEnabled("transcripts")) return;
  const timestamp = Date.now();
  const hash = transcriptHash || createHash("sha256").update(String(timestamp)).digest("hex").slice(0, 12);
  const filename = `transcript-${timestamp}-${hash}.jsonl`;
  const filePath = path.join(TRANSCRIPTS_DIR, filename);
  const entry = buildEntry("transcript", "transcript", event, { ...data, transcriptHash: hash });
  try {
    await appendToFile(filePath, entry);
    if (isStreamEnabled("master")) {
      await appendToFile(getStreamPath("master"), { ...entry, data: { ...entry.data, transcriptFile: filename } });
    }
  } catch (e) {
    console.error("Logger transcript write error:", e);
  }
  return;
}

export async function appendToTranscript(filename: string, event: string, data: Record<string, any>): Promise<void> {
  if (!isStreamEnabled("transcripts")) return;
  const filePath = path.join(TRANSCRIPTS_DIR, filename);
  const entry = buildEntry("transcript", "transcript", event, data);
  try {
    await appendToFile(filePath, entry);
  } catch (e) {
    console.error("Logger transcript append error:", e);
  }
}

export async function readLogStream(stream: LogStream, options: { offset?: number; limit?: number } = {}): Promise<{ entries: LogEntry[]; total: number }> {
  const filePath = getStreamPath(stream);
  try {
    const content = await readFile(filePath, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    const total = lines.length;
    const offset = options.offset || 0;
    const limit = options.limit || 100;
    const startIdx = Math.max(0, total - offset - limit);
    const endIdx = total - offset;
    const slice = lines.slice(Math.max(0, startIdx), Math.max(0, endIdx));
    const entries = slice.map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { raw: line };
      }
    }).reverse();
    return { entries, total };
  } catch (e: any) {
    if (e.code === "ENOENT") return { entries: [], total: 0 };
    throw e;
  }
}

export async function readTranscriptLog(filename: string): Promise<LogEntry[]> {
  const filePath = path.join(TRANSCRIPTS_DIR, filename);
  try {
    const content = await readFile(filePath, "utf-8");
    return content.trim().split("\n").filter(Boolean).map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { raw: line } as any;
      }
    });
  } catch (e: any) {
    if (e.code === "ENOENT") return [];
    throw e;
  }
}

export async function listTranscripts(): Promise<{ filename: string; size: number; created: string }[]> {
  await ensureDirs();
  try {
    const files = await readdir(TRANSCRIPTS_DIR);
    const transcriptFiles = files.filter((f) => f.endsWith(".jsonl")).sort().reverse();
    const results = [];
    for (const f of transcriptFiles) {
      const filePath = path.join(TRANSCRIPTS_DIR, f);
      const s = await stat(filePath);
      results.push({ filename: f, size: s.size, created: s.birthtime.toISOString() });
    }
    return results;
  } catch {
    return [];
  }
}

export async function getLogStats(): Promise<Record<string, { size: number; lines: number }>> {
  await ensureDirs();
  const stats: Record<string, { size: number; lines: number }> = {};
  for (const [stream, filename] of Object.entries(LOG_STREAMS)) {
    const filePath = path.join(LOGS_DIR, filename);
    try {
      const s = await stat(filePath);
      const content = await readFile(filePath, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean).length;
      stats[stream] = { size: s.size, lines };
    } catch {
      stats[stream] = { size: 0, lines: 0 };
    }
  }
  return stats;
}

export interface AiTranscriptEntry {
  timestamp: string;
  conversationId?: number;
  messageId?: number;
  model: string;
  request: any;
  response: string;
  tokens: { prompt: number; completion: number; total: number };
  latencyMs: number;
  status: "success" | "error";
  error?: string;
}

function getAiTranscriptFilePath(): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  return path.join(AI_TRANSCRIPTS_DIR, `ai-transcript-${dateStr}.jsonl`);
}

export async function logAiTranscript(entry: AiTranscriptEntry): Promise<void> {
  if (!isStreamEnabled("ai-transcripts")) return;
  await ensureDirs();
  const filePath = getAiTranscriptFilePath();
  try {
    await appendFile(filePath, JSON.stringify(entry) + "\n", "utf-8");
  } catch (e) {
    console.error("Logger ai-transcript write error:", e);
  }
}

export async function readAiTranscripts(options: {
  date?: string;
  model?: string;
  offset?: number;
  limit?: number;
} = {}): Promise<{ entries: AiTranscriptEntry[]; total: number }> {
  await ensureDirs();
  try {
    let files: string[];
    if (options.date) {
      files = [`ai-transcript-${options.date}.jsonl`];
    } else {
      const allFiles = await readdir(AI_TRANSCRIPTS_DIR);
      files = allFiles.filter(f => f.startsWith("ai-transcript-") && f.endsWith(".jsonl")).sort().reverse();
    }

    let allEntries: AiTranscriptEntry[] = [];
    for (const file of files) {
      const filePath = path.join(AI_TRANSCRIPTS_DIR, file);
      try {
        const content = await readFile(filePath, "utf-8");
        const lines = content.trim().split("\n").filter(Boolean);
        for (const line of lines) {
          try {
            const entry = JSON.parse(line) as AiTranscriptEntry;
            if (options.model && entry.model !== options.model) continue;
            allEntries.push(entry);
          } catch {}
        }
      } catch (e: any) {
        if (e.code !== "ENOENT") throw e;
      }
    }

    allEntries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const total = allEntries.length;
    const offset = options.offset || 0;
    const limit = options.limit || 50;
    const slice = allEntries.slice(offset, offset + limit);
    return { entries: slice, total };
  } catch (e: any) {
    if (e.code === "ENOENT") return { entries: [], total: 0 };
    throw e;
  }
}

export async function listAiTranscriptFiles(): Promise<{ filename: string; size: number; date: string }[]> {
  await ensureDirs();
  try {
    const files = await readdir(AI_TRANSCRIPTS_DIR);
    const transcriptFiles = files.filter(f => f.startsWith("ai-transcript-") && f.endsWith(".jsonl")).sort().reverse();
    const results = [];
    for (const f of transcriptFiles) {
      const filePath = path.join(AI_TRANSCRIPTS_DIR, f);
      const s = await stat(filePath);
      const dateMatch = f.match(/ai-transcript-(\d{4}-\d{2}-\d{2})\.jsonl/);
      results.push({ filename: f, size: s.size, date: dateMatch ? dateMatch[1] : "" });
    }
    return results;
  } catch {
    return [];
  }
}
