import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, Filter, RefreshCw, ScrollText } from "lucide-react";

type LogSource = "all" | "events" | "heartbeat" | "edcm" | "commands" | "costs" | "ai-transcripts" | "omega" | "psi";

const LOG_SOURCES: { id: LogSource; label: string; color: string }[] = [
  { id: "all", label: "All", color: "text-foreground" },
  { id: "events", label: "Events", color: "text-blue-400" },
  { id: "heartbeat", label: "Heartbeat", color: "text-red-400" },
  { id: "edcm", label: "EDCM", color: "text-purple-400" },
  { id: "commands", label: "Commands", color: "text-emerald-400" },
  { id: "costs", label: "Costs", color: "text-amber-400" },
  { id: "ai-transcripts", label: "AI Transcripts", color: "text-cyan-400" },
  { id: "omega", label: "Omega", color: "text-orange-400" },
  { id: "psi", label: "Psi", color: "text-pink-400" },
];

interface UnifiedLogEntry {
  id: string;
  source: LogSource;
  ts: Date;
  summary: string;
  status?: string;
  detail: any;
}

function LogDetail({ entry }: { entry: UnifiedLogEntry }) {
  const d = entry.detail;

  if (entry.source === "events") {
    const p = d.payload || {};
    return (
      <div className="space-y-2 pt-2">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div><span className="text-muted-foreground">Event ID</span><p className="font-mono text-[10px]">{p.event_id || `#${d.id}`}</p></div>
          <div><span className="text-muted-foreground">Thread</span><p className="font-mono text-[10px]">{p.thread_id || p.taskId || "--"}</p></div>
          <div><span className="text-muted-foreground">Actor</span><p className="font-mono text-[10px]">{p.actor_id || "system"}</p></div>
          <div><span className="text-muted-foreground">Action</span><p className="font-mono text-[10px]">{p.action || d.eventType || "--"}</p></div>
        </div>
        {p.edcm && (
          <div className="rounded bg-background p-2">
            <span className="text-[10px] text-muted-foreground font-medium">EDCM Disposition</span>
            <div className="grid grid-cols-3 gap-2 mt-1 text-[10px] font-mono">
              <div>decision: {p.edcm.decision}</div><div>delta: {p.edcm.delta?.toFixed(4)}</div><div>dom: {p.edcm.dominantOp}</div>
            </div>
          </div>
        )}
        {p.edcmMetrics && (
          <div className="rounded bg-background p-2">
            <span className="text-[10px] text-muted-foreground font-medium">EDCM Metrics</span>
            <div className="grid grid-cols-3 gap-1 mt-1 text-[10px] font-mono">
              {Object.entries(p.edcmMetrics).map(([k, v]) => (
                <div key={k} className={cn(typeof v === "number" && v >= 0.80 ? "text-red-400" : typeof v === "number" && v <= 0.20 ? "text-green-400" : "")}>
                  {k}: {typeof v === "number" ? (v as number).toFixed(3) : String(v)}
                </div>
              ))}
            </div>
          </div>
        )}
        {p.sentinelContext && (
          <div className="rounded bg-background p-2">
            <span className="text-[10px] text-muted-foreground font-medium">Sentinel Context</span>
            <div className="text-[10px] font-mono mt-1 space-y-0.5">
              <div>S4: {p.sentinelContext.S4_context?.window?.type || "turns"}/W={p.sentinelContext.S4_context?.window?.W || 32}</div>
              <div>S7 risk: {p.sentinelContext.S7_risk?.score}</div>
              <div>S8 audit: {p.sentinelContext.S8_audit?.evidence_events?.length || 0} events</div>
            </div>
          </div>
        )}
        <div className="rounded bg-background p-2 max-h-40 overflow-auto">
          <span className="text-[10px] text-muted-foreground font-medium">Raw Payload</span>
          <pre className="text-[9px] font-mono text-muted-foreground mt-1 whitespace-pre-wrap">{JSON.stringify(p, null, 2)}</pre>
        </div>
      </div>
    );
  }

  if (entry.source === "heartbeat") {
    const det = d.details || {};
    return (
      <div className="space-y-2 pt-2">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div><span className="text-muted-foreground">Status</span><p className={cn("font-mono", d.hashChainValid ? "text-green-400" : "text-red-400")}>{d.status}</p></div>
          <div><span className="text-muted-foreground">Chain Valid</span><p className="font-mono">{d.hashChainValid ? "YES" : "NO"}</p></div>
          <div><span className="text-muted-foreground">Chain Length</span><p className="font-mono">{det.chainLength || 0}</p></div>
          <div><span className="text-muted-foreground">Build</span><p className="font-mono">{det.build || "--"}</p></div>
        </div>
        {det.errors?.length > 0 && (
          <div className="rounded bg-red-500/10 p-2">
            <span className="text-[10px] text-red-400 font-medium">Errors</span>
            {det.errors.map((e: string, i: number) => <p key={i} className="text-[10px] font-mono text-red-400 mt-1">{e}</p>)}
          </div>
        )}
      </div>
    );
  }

  if (entry.source === "edcm") {
    return (
      <div className="space-y-2 pt-2">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div><span className="text-muted-foreground">Decision</span><p className="font-mono font-bold">{d.decision}</p></div>
          <div><span className="text-muted-foreground">BONE Delta</span><p className="font-mono">{d.deltaBone?.toFixed(4)}</p></div>
          <div><span className="text-muted-foreground">Grok Align</span><p className={cn("font-mono", d.deltaAlignGrok > 0.25 ? "text-red-400" : "text-green-400")}>{d.deltaAlignGrok?.toFixed(4)}</p></div>
          <div><span className="text-muted-foreground">Gemini Align</span><p className={cn("font-mono", d.deltaAlignGemini > 0.25 ? "text-red-400" : "text-green-400")}>{d.deltaAlignGemini?.toFixed(4)}</p></div>
        </div>
        {d.ptcaState && (
          <div className="rounded bg-background p-2">
            <span className="text-[10px] text-muted-foreground font-medium">PTCA State</span>
            <div className="grid grid-cols-2 gap-2 mt-1 text-[10px] font-mono">
              <div>Energy: {d.ptcaState.energy?.toFixed(4)}</div><div>Hept: {d.ptcaState.heptagramEnergy?.toFixed(4) || "--"}</div>
              {d.ptcaState.coupling && <div className="col-span-2">Coupling: α={d.ptcaState.coupling.alpha} β={d.ptcaState.coupling.beta} γ={d.ptcaState.coupling.gamma}</div>}
            </div>
          </div>
        )}
        {d.operatorGrok && (
          <div className="rounded bg-background p-2">
            <span className="text-[10px] text-muted-foreground font-medium">Operator Vectors</span>
            <div className="text-[10px] font-mono mt-1">
              <div>Grok: P={d.operatorGrok.P?.toFixed(2)} K={d.operatorGrok.K?.toFixed(2)} Q={d.operatorGrok.Q?.toFixed(2)} T={d.operatorGrok.T?.toFixed(2)} S={d.operatorGrok.S?.toFixed(2)}</div>
              <div>Gemini: P={d.operatorGemini.P?.toFixed(2)} K={d.operatorGemini.K?.toFixed(2)} Q={d.operatorGemini.Q?.toFixed(2)} T={d.operatorGemini.T?.toFixed(2)} S={d.operatorGemini.S?.toFixed(2)}</div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (entry.source === "commands") {
    return (
      <div className="space-y-2 pt-2">
        <div><span className="text-[10px] text-muted-foreground font-medium">Command</span><pre className="text-xs font-mono bg-background rounded p-2 mt-1">$ {d.command}</pre></div>
        <div><span className="text-[10px] text-muted-foreground font-medium">Output</span><pre className="text-[10px] font-mono bg-background rounded p-2 mt-1 max-h-48 overflow-auto whitespace-pre-wrap">{d.output || "(no output)"}</pre></div>
        <div className="flex items-center gap-4 text-xs"><span className="text-muted-foreground">Exit code: <span className={cn("font-mono", d.exitCode === 0 ? "text-green-400" : "text-red-400")}>{d.exitCode ?? "--"}</span></span></div>
      </div>
    );
  }

  if (entry.source === "costs") {
    return (
      <div className="space-y-2 pt-2">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div><span className="text-muted-foreground">Model</span><p className="font-mono">{d.model}</p></div>
          <div><span className="text-muted-foreground">Est. Cost</span><p className="font-mono">${d.estimatedCost?.toFixed(6)}</p></div>
          <div><span className="text-muted-foreground">Prompt Tokens</span><p className="font-mono">{d.promptTokens?.toLocaleString()}</p></div>
          <div><span className="text-muted-foreground">Completion Tokens</span><p className="font-mono">{d.completionTokens?.toLocaleString()}</p></div>
        </div>
      </div>
    );
  }

  if (entry.source === "ai-transcripts") {
    return (
      <div className="space-y-2 pt-2">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div><span className="text-muted-foreground">Model</span><p className="font-mono" data-testid="text-ait-model">{d.model}</p></div>
          <div><span className="text-muted-foreground">Status</span><p className={cn("font-mono", d.status === "success" ? "text-green-400" : "text-red-400")} data-testid="text-ait-status">{d.status}</p></div>
          <div><span className="text-muted-foreground">Latency</span><p className="font-mono">{d.latencyMs ? `${(d.latencyMs / 1000).toFixed(2)}s` : "--"}</p></div>
          <div><span className="text-muted-foreground">Total Tokens</span><p className="font-mono">{d.tokens?.total?.toLocaleString() || 0}</p></div>
          {d.error && <div className="col-span-2"><span className="text-muted-foreground">Error</span><p className="font-mono text-red-400 text-[10px]">{d.error}</p></div>}
        </div>
        <div className="rounded bg-background p-2"><span className="text-[10px] text-muted-foreground font-medium">Request</span><pre className="text-[9px] font-mono text-muted-foreground mt-1 whitespace-pre-wrap max-h-40 overflow-auto">{typeof d.request === "string" ? d.request : JSON.stringify(d.request, null, 2)}</pre></div>
        <div className="rounded bg-background p-2"><span className="text-[10px] text-muted-foreground font-medium">Response</span><pre className="text-[9px] font-mono text-muted-foreground mt-1 whitespace-pre-wrap max-h-60 overflow-auto">{d.response || "(empty)"}</pre></div>
      </div>
    );
  }

  return <div className="pt-2"><pre className="text-[9px] font-mono text-muted-foreground whitespace-pre-wrap max-h-40 overflow-auto">{JSON.stringify(d, null, 2)}</pre></div>;
}

export function LogsTab() {
  const [filter, setFilter] = useState<LogSource>("all");
  const [search, setSearch] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  const { data: events = [] } = useQuery<any[]>({ queryKey: ["/api/v1/a0p/events"], refetchInterval: 10000 });
  const { data: heartbeats = [] } = useQuery<any[]>({ queryKey: ["/api/v1/a0p/heartbeat"], refetchInterval: 15000 });
  const { data: snapshots = [] } = useQuery<any[]>({ queryKey: ["/api/v1/edcm/snapshots"], refetchInterval: 10000 });
  const { data: commands = [] } = useQuery<any[]>({ queryKey: ["/api/v1/terminal/history"], refetchInterval: 10000 });
  const { data: costHistory = [] } = useQuery<any[]>({ queryKey: ["/api/v1/metrics/costs/history"], refetchInterval: 15000 });
  const { data: aiTranscriptsData } = useQuery<{ entries: any[]; total: number }>({ queryKey: ["/api/v1/ai-transcripts"], refetchInterval: 10000 });
  const aiTranscripts = aiTranscriptsData?.entries || [];
  const { data: omegaLogsData } = useQuery<{ entries: any[]; total: number }>({ queryKey: ["/api/v1/logs/omega", { limit: 100 }], refetchInterval: 10000 });
  const omegaLogs = omegaLogsData?.entries || [];
  const { data: psiLogsData } = useQuery<{ entries: any[]; total: number }>({ queryKey: ["/api/v1/logs/psi", { limit: 100 }], refetchInterval: 10000 });
  const psiLogs = psiLogsData?.entries || [];

  const unified: UnifiedLogEntry[] = [];
  for (const ev of events) { const p = ev.payload || {}; const metrics = p.edcmMetrics; const metricsStr = metrics ? ` CM=${metrics.CM?.toFixed?.(2) || metrics.CM} DA=${metrics.DA?.toFixed?.(2) || metrics.DA}` : ""; unified.push({ id: `evt-${ev.id}`, source: "events", ts: new Date(ev.createdAt), summary: `[${p.action || ev.eventType || "event"}] ${p.taskId || ev.taskId || ""}${metricsStr}`, status: p.edcm?.decision, detail: ev }); }
  for (const hb of heartbeats) { const d = hb.details || {}; unified.push({ id: `hb-${hb.id}`, source: "heartbeat", ts: new Date(hb.createdAt), summary: `${hb.status} — chain: ${hb.hashChainValid ? "valid" : "BROKEN"}, events: ${d.chainLength || 0}`, status: hb.status, detail: hb }); }
  for (const snap of snapshots) { unified.push({ id: `edcm-${snap.id}`, source: "edcm", ts: new Date(snap.createdAt), summary: `${snap.decision} — delta=${snap.deltaBone?.toFixed(4)} task=${snap.taskId}`, status: snap.decision, detail: snap }); }
  for (const cmd of commands) { unified.push({ id: `cmd-${cmd.id}`, source: "commands", ts: new Date(cmd.createdAt), summary: `$ ${cmd.command}${cmd.exitCode != null ? ` (exit ${cmd.exitCode})` : ""}`, status: cmd.exitCode === 0 ? "OK" : cmd.exitCode != null ? "ERROR" : undefined, detail: cmd }); }
  for (const cost of costHistory) { unified.push({ id: `cost-${cost.id}`, source: "costs", ts: new Date(cost.createdAt), summary: `${cost.model} — $${cost.estimatedCost?.toFixed(4)} (${(cost.promptTokens + cost.completionTokens).toLocaleString()} tok)`, detail: cost }); }
  for (const t of aiTranscripts) { unified.push({ id: `ait-${t.timestamp}-${t.model}`, source: "ai-transcripts", ts: new Date(t.timestamp), summary: `${t.model} — ${t.status}${t.latencyMs ? ` ${(t.latencyMs / 1000).toFixed(1)}s` : ""} (${t.tokens?.total?.toLocaleString() || 0} tok)`, status: t.status === "success" ? "OK" : "ERROR", detail: t }); }
  for (const ol of omegaLogs) { const d = ol.data || {}; unified.push({ id: `omega-${ol.timestamp}-${ol.seq || Math.random()}`, source: "omega", ts: new Date(ol.timestamp), summary: `[${d.event || ol.event || "omega"}] ${d.driver || d.dimension || d.mode || d.goalId || ""}${d.totalEnergy != null ? ` E=${d.totalEnergy.toFixed?.(4) || d.totalEnergy}` : ""}`, detail: ol }); }
  for (const pl of psiLogs) { const d = pl.data || {}; unified.push({ id: `psi-${pl.timestamp}-${pl.seq || Math.random()}`, source: "psi", ts: new Date(pl.timestamp), summary: `[${d.event || pl.event || "psi"}] ${d.dimension !== undefined ? `dim=${d.dimension}` : ""}${d.mode || ""}${d.totalEnergy != null ? ` E=${d.totalEnergy.toFixed?.(4) || d.totalEnergy}` : ""}`, detail: pl }); }
  unified.sort((a, b) => b.ts.getTime() - a.ts.getTime());

  const filtered = unified.filter(entry => {
    if (filter !== "all" && entry.source !== filter) return false;
    if (search) { const q = search.toLowerCase(); return entry.summary.toLowerCase().includes(q) || JSON.stringify(entry.detail).toLowerCase().includes(q); }
    return true;
  });

  function toggleExpand(id: string) { setExpandedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  function refreshAll() {
    queryClient.invalidateQueries({ queryKey: ["/api/v1/a0p/events"] });
    queryClient.invalidateQueries({ queryKey: ["/api/v1/a0p/heartbeat"] });
    queryClient.invalidateQueries({ queryKey: ["/api/v1/edcm/snapshots"] });
    queryClient.invalidateQueries({ queryKey: ["/api/v1/terminal/history"] });
    queryClient.invalidateQueries({ queryKey: ["/api/v1/metrics/costs/history"] });
    queryClient.invalidateQueries({ queryKey: ["/api/v1/ai-transcripts"] });
  }

  const sourceColor = (s: LogSource) => LOG_SOURCES.find(l => l.id === s)?.color || "text-foreground";
  function statusBadge(status?: string) {
    if (!status) return null;
    const isOk = status === "OK" || status === "MERGE";
    const isWarn = status.includes("SOFTFORK") || status === "HYSTERESIS";
    const isErr = status.includes("ERROR") || status.includes("FORK") || status.includes("BROKEN");
    return <Badge variant="secondary" className={cn("text-[9px] font-mono", isOk && "bg-green-500/20 text-green-400", isWarn && "bg-amber-500/20 text-amber-400", isErr && "bg-red-500/20 text-red-400")} data-testid="badge-log-status">{status}</Badge>;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 px-3 py-2 space-y-2 border-b border-border bg-card">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Filter className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input placeholder="Search logs..." value={search} onChange={e => setSearch(e.target.value)} className="h-8 text-xs pl-8 font-mono" data-testid="input-log-search" />
          </div>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={refreshAll} data-testid="button-refresh-logs"><RefreshCw className="w-3.5 h-3.5" /></Button>
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {LOG_SOURCES.map(src => (
            <button key={src.id} onClick={() => setFilter(src.id)} className={cn("px-2 py-1 text-[10px] font-medium rounded-full whitespace-nowrap transition-colors", filter === src.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80")} data-testid={`filter-${src.id}`}>
              {src.label}{src.id !== "all" && <span className="ml-1 opacity-70">{unified.filter(e => e.source === src.id).length}</span>}
            </button>
          ))}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="px-3 py-2 space-y-1">
          {filtered.length === 0 ? (
            <div className="text-center py-8">
              <ScrollText className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No log entries{search ? ` matching "${search}"` : ""}</p>
              <p className="text-xs text-muted-foreground mt-1">Run tasks through the engine to generate logs.</p>
            </div>
          ) : (
            <>
              <p className="text-[10px] text-muted-foreground mb-2" data-testid="text-log-count">{filtered.length} entries{filter !== "all" ? ` (${filter})` : ""}{search ? ` matching "${search}"` : ""}</p>
              {filtered.map(entry => {
                const isExpanded = expandedIds.has(entry.id);
                return (
                  <div key={entry.id} className="rounded border border-border bg-card overflow-hidden" data-testid={`log-entry-${entry.id}`}>
                    <button className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-muted/30 transition-colors" onClick={() => toggleExpand(entry.id)} data-testid={`button-expand-${entry.id}`}>
                      {isExpanded ? <ChevronDown className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-muted-foreground" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={cn("text-[10px] font-bold uppercase", sourceColor(entry.source))}>{entry.source}</span>
                          <span className="text-[10px] text-muted-foreground">{entry.ts.toLocaleTimeString()}</span>
                          {statusBadge(entry.status)}
                        </div>
                        <p className="text-xs font-mono truncate mt-0.5">{entry.summary}</p>
                      </div>
                    </button>
                    {isExpanded && <div className="px-3 pb-3 border-t border-border"><LogDetail entry={entry} /></div>}
                  </div>
                );
              })}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
