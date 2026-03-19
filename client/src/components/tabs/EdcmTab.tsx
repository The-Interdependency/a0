import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { AlertTriangle, Brain, ChevronDown, ChevronRight, Cpu, Eye, FileText, Plus, Shield, Trash2, Upload, X, Zap } from "lucide-react";
import { usePersona } from "@/hooks/use-persona";
import { PERSONA_METRIC_LABELS, DEFAULT_METRIC_LABELS } from "@/lib/console-config";

const ALERT_NAMES: Record<string, string> = {
  CM: "ALERT_CM_HIGH", DA: "ALERT_DA_RISING", DVG: "ALERT_DVG_SPLIT",
  INT: "ALERT_INT_SPIKE", TBF: "ALERT_TBF_SKEW", DRIFT: "ALERT_DRIFT_AWAY",
};

function alertColor(value: number): { bg: string; text: string; label: string } {
  if (value >= 0.80) return { bg: "bg-red-500/20", text: "text-red-400", label: "HIGH" };
  if (value <= 0.20) return { bg: "bg-green-500/20", text: "text-green-400", label: "LOW" };
  return { bg: "bg-amber-500/20", text: "text-amber-400", label: "HYSTERESIS" };
}

function MetricRow({ metricKey, value, evidence }: { metricKey: string; value: number; evidence: string[] }) {
  const { persona } = usePersona();
  const labels = PERSONA_METRIC_LABELS[persona] ?? DEFAULT_METRIC_LABELS;
  const info = labels[metricKey] || { label: metricKey, desc: "" };
  const alert = alertColor(value);
  const pct = Math.round(value * 100);
  return (
    <div className="space-y-1" data-testid={`metric-row-${metricKey}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="font-mono text-xs font-bold w-10 flex-shrink-0">{metricKey}</span>
          <span className="text-[10px] text-muted-foreground truncate">{info.label}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="font-mono text-xs font-bold" data-testid={`text-metric-value-${metricKey}`}>{value.toFixed(3)}</span>
          <Badge variant="secondary" className={cn("text-[9px] font-mono", alert.bg, alert.text)} data-testid={`badge-alert-${metricKey}`}>{alert.label}</Badge>
        </div>
      </div>
      <div className="w-full h-1.5 bg-background rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", value >= 0.80 ? "bg-red-500" : value <= 0.20 ? "bg-green-500" : "bg-amber-500")} style={{ width: `${pct}%` }} />
      </div>
      {evidence.length > 0 && <div className="flex flex-wrap gap-1">{evidence.map((e, i) => <span key={i} className="text-[9px] font-mono text-muted-foreground">{e}</span>)}</div>}
    </div>
  );
}

function OperatorBar({ vec, color }: { vec: any; color: string }) {
  if (!vec) return null;
  const classes = ["P", "K", "Q", "T", "S"] as const;
  const colorMap: Record<string, string> = { emerald: "bg-emerald-500", blue: "bg-blue-500", purple: "bg-purple-500" };
  return (
    <div className="flex gap-1 items-end h-8">
      {classes.map((c) => {
        const val = Math.abs(vec[c] || 0);
        const pct = Math.max(val * 100, 2);
        return (
          <div key={c} className="flex-1 flex flex-col items-center gap-0.5">
            <div className={cn("w-full rounded-t", colorMap[color] || "bg-primary")} style={{ height: `${pct}%` }} />
            <span className="text-[9px] text-muted-foreground">{c}</span>
          </div>
        );
      })}
    </div>
  );
}

const METRIC_COLORS: Record<string, string> = {
  CM: "text-yellow-400", DA: "text-red-400", DRIFT: "text-blue-400",
  DVG: "text-purple-400", INT: "text-orange-400", TBF: "text-green-400",
};

function TranscriptSourcesSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const [expandedReport, setExpandedReport] = useState<string | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const { data: sources = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/v1/transcripts/sources"], refetchInterval: 15000 });

  const createMutation = useMutation({
    mutationFn: (displayName: string) => apiRequest("POST", "/api/transcripts/sources", { displayName }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/v1/transcripts/sources"] }); setNewName(""); setCreating(false); toast({ title: "Source created" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const deleteMutation = useMutation({
    mutationFn: (slug: string) => apiRequest("DELETE", `/api/transcripts/sources/${slug}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/v1/transcripts/sources"] }); toast({ title: "Source deleted" }); },
  });
  const scanMutation = useMutation({
    mutationFn: (slug: string) => apiRequest("POST", `/api/transcripts/sources/${slug}/scan`),
    onSuccess: (_, slug) => { queryClient.invalidateQueries({ queryKey: ["/api/v1/transcripts/sources"] }); setExpandedReport(slug); toast({ title: "Scan complete" }); },
    onError: (e: any) => toast({ title: "Scan failed", description: (e as any).message, variant: "destructive" }),
  });

  const uploadFiles = async (slug: string, files: FileList) => {
    const formData = new FormData();
    for (const f of Array.from(files)) formData.append("files", f);
    try {
      const res = await fetch(`/api/transcripts/sources/${slug}/upload`, { method: "POST", body: formData });
      if (!res.ok) throw new Error(await res.text());
      queryClient.invalidateQueries({ queryKey: ["/api/v1/transcripts/sources"] });
      toast({ title: `Uploaded ${files.length} file(s)` });
    } catch (e: any) { toast({ title: "Upload failed", description: e.message, variant: "destructive" }); }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="font-semibold text-sm flex items-center gap-2"><FileText className="w-4 h-4 text-blue-400" /> Transcript Sources</h3>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setCreating(v => !v)} data-testid="button-new-source"><Plus className="w-3 h-3 mr-1" /> New Source</Button>
      </div>
      {creating && (
        <div className="flex gap-2 items-center">
          <Input className="h-7 text-xs" placeholder="Source name (e.g. ChatGPT)" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && newName.trim()) createMutation.mutate(newName.trim()); }} autoFocus data-testid="input-new-source-name" />
          <Button size="sm" className="h-7 text-xs" onClick={() => newName.trim() && createMutation.mutate(newName.trim())} disabled={createMutation.isPending} data-testid="button-create-source">Create</Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setCreating(false)}><X className="w-3 h-3" /></Button>
        </div>
      )}
      {isLoading && <Skeleton className="h-12 w-full" />}
      {!isLoading && sources.length === 0 && <p className="text-xs text-muted-foreground">No transcript sources yet. Create one to upload and scan external conversation files.</p>}
      <div className="space-y-2">
        {sources.map((src: any) => {
          const report = src.latestReport;
          const isExpanded = expandedSlug === src.slug;
          const showReport = expandedReport === src.slug && report;
          return (
            <div key={src.slug} className="rounded border border-border bg-background p-3 space-y-2" data-testid={`card-source-${src.slug}`}>
              <div className="flex items-center gap-2 flex-wrap">
                <button className="flex items-center gap-1.5 flex-1 min-w-0 text-left" onClick={() => setExpandedSlug(isExpanded ? null : src.slug)} data-testid={`button-expand-source-${src.slug}`}>
                  {isExpanded ? <ChevronDown className="w-3 h-3 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
                  <span className="font-medium text-xs truncate">{src.displayName}</span>
                  <Badge variant="secondary" className="text-[9px] ml-1">{src.fileCount} file{src.fileCount !== 1 ? "s" : ""}</Badge>
                  {src.lastScannedAt && <Badge variant="outline" className="text-[9px]">scanned</Badge>}
                </button>
                <div className="flex gap-1 flex-shrink-0">
                  <input type="file" multiple accept=".json,.jsonl,.txt,.csv" ref={el => { fileRefs.current[src.slug] = el; }} className="hidden" onChange={e => { if (e.target.files?.length) uploadFiles(src.slug, e.target.files); e.target.value = ""; }} data-testid={`input-upload-${src.slug}`} />
                  <Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={() => fileRefs.current[src.slug]?.click()} data-testid={`button-upload-${src.slug}`}><Upload className="w-3 h-3 mr-1" /> Upload</Button>
                  <Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={() => scanMutation.mutate(src.slug)} disabled={scanMutation.isPending || src.fileCount === 0} data-testid={`button-scan-${src.slug}`}><Cpu className="w-3 h-3 mr-1" /> {scanMutation.isPending ? "Scanning…" : "Scan"}</Button>
                  {report && <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px]" onClick={() => setExpandedReport(showReport ? null : src.slug)} data-testid={`button-report-${src.slug}`}><Eye className="w-3 h-3 mr-1" /> Report</Button>}
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px] text-destructive" onClick={() => deleteMutation.mutate(src.slug)} data-testid={`button-delete-source-${src.slug}`}><Trash2 className="w-3 h-3" /></Button>
                </div>
              </div>
              {showReport && report && (
                <div className="border-t border-border pt-2 space-y-2">
                  <div className="flex gap-2 items-center flex-wrap">
                    <span className="text-[10px] text-muted-foreground">{report.messageCount} messages scanned</span>
                    {report.peakMetricName && <Badge variant="outline" className={`text-[9px] ${METRIC_COLORS[report.peakMetricName] || ""}`}>peak: {report.peakMetricName} {(report.peakMetric * 100).toFixed(0)}%</Badge>}
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[{ key: "CM", val: report.avgCm }, { key: "DA", val: report.avgDa }, { key: "DRIFT", val: report.avgDrift }, { key: "DVG", val: report.avgDvg }, { key: "INT", val: report.avgInt }, { key: "TBF", val: report.avgTbf }].map(({ key, val }) => (
                      <div key={key} className="text-center p-1.5 rounded bg-card border border-border">
                        <p className={`font-mono font-bold text-[10px] ${METRIC_COLORS[key]}`}>{key}</p>
                        <p className="font-mono text-xs">{((val || 0) * 100).toFixed(1)}%</p>
                        <div className="w-full bg-muted rounded-full h-1 mt-1"><div className="bg-primary rounded-full h-1" style={{ width: `${(val || 0) * 100}%` }} /></div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {isExpanded && !showReport && <p className="text-[10px] text-muted-foreground">{src.fileCount === 0 ? "Upload files to begin." : report ? "Scan complete. Click Report to view results." : "Files ready. Click Scan to generate EDCM report."}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function EdcmTab() {
  const { persona } = usePersona();
  const METRIC_LABELS = PERSONA_METRIC_LABELS[persona] ?? DEFAULT_METRIC_LABELS;
  const { data: snapshots = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/v1/edcm/snapshots"], refetchInterval: 10000 });
  const latest = snapshots[0];
  const ptca = latest?.ptcaState as any;

  const { data: engineReport } = useQuery<any>({
    queryKey: ["/api/v1/a0p/events"],
    refetchInterval: 10000,
    select: (data: any[]) => { if (!data || data.length === 0) return null; return data[0]?.payload; },
  });
  const reportMetrics = engineReport?.edcmMetrics;
  const liveSentinelCtx = engineReport?.sentinelContext || engineReport?.sentinel_context;

  const mv = (key: string) => {
    const m = reportMetrics?.[key];
    if (m == null) return "0.000";
    return (typeof m === "object" ? (m as any).value : m).toFixed(3);
  };

  return (
    <ScrollArea className="h-full px-3 py-3">
      <div className="space-y-4 pb-4">
        <TranscriptSourcesSection />

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
            <h3 className="font-semibold text-sm flex items-center gap-2"><Brain className="w-4 h-4 text-purple-400" /> EDCM Metric Families</h3>
            <Badge variant="secondary" className="text-[9px] font-mono" data-testid="badge-build-version">v1.1.0-M1</Badge>
          </div>
          {!latest && !reportMetrics ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">No EDCM evaluations yet. Run a process through the engine to generate metrics.</p>
              <div className="grid grid-cols-3 gap-2 text-xs">
                {Object.entries(METRIC_LABELS).map(([key, info]) => (
                  <div key={key} className="text-center p-2 rounded bg-background">
                    <p className="font-mono font-bold text-muted-foreground">{key}</p>
                    <p className="text-[9px] text-muted-foreground">{info.label}</p>
                    <p className="font-mono text-muted-foreground">--</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {reportMetrics ? (
                Object.entries(reportMetrics as Record<string, number>).map(([key, val]) => {
                  const metricVal = typeof val === "object" ? (val as any).value ?? val : val;
                  const evidence = typeof val === "object" ? ((val as any).evidence || []) : [];
                  return <MetricRow key={key} metricKey={key} value={typeof metricVal === "number" ? metricVal : 0} evidence={evidence} />;
                })
              ) : (
                Object.entries(METRIC_LABELS).map(([key]) => <MetricRow key={key} metricKey={key} value={0} evidence={[]} />)
              )}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-400" /> 80/20 Alert Status</h3>
          <div className="text-[10px] text-muted-foreground mb-3">TRIGGER (HIGH) at ≥0.80 | CLEAR (LOW) at ≤0.20 | Hysteresis band (0.20, 0.80)</div>
          <div className="space-y-1.5">
            {Object.entries(ALERT_NAMES).map(([metric, alertName]) => {
              const val = reportMetrics ? (typeof reportMetrics[metric] === "object" ? (reportMetrics[metric] as any).value : reportMetrics[metric]) : null;
              const numVal = typeof val === "number" ? val : 0;
              const alert = alertColor(val != null ? numVal : 0.5);
              return (
                <div key={metric} className="flex items-center justify-between gap-2 text-xs" data-testid={`alert-row-${metric}`}>
                  <div className="flex items-center gap-2">
                    <span className={cn("w-2 h-2 rounded-full flex-shrink-0", val == null ? "bg-muted-foreground" : numVal >= 0.80 ? "bg-red-500" : numVal <= 0.20 ? "bg-green-500" : "bg-amber-500")} />
                    <span className="font-mono text-[10px]">{alertName}</span>
                  </div>
                  <span className={cn("font-mono text-[10px]", val != null ? alert.text : "text-muted-foreground")}>{val != null ? `${numVal.toFixed(3)} → ${alert.label}` : "no data"}</span>
                </div>
              );
            })}
          </div>
        </div>

        {latest && (
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><Brain className="w-4 h-4 text-purple-400" /> Disposition & Operators</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div><span className="text-muted-foreground">Decision</span><p className="font-mono font-bold" data-testid="text-edcm-decision">{latest.decision}</p></div>
                <div><span className="text-muted-foreground">BONE Delta</span><p className="font-mono" data-testid="text-bone-delta">{latest.deltaBone?.toFixed(4)}</p></div>
              </div>
              <div className="space-y-2">
                <h4 className="text-xs font-medium text-muted-foreground">Grok Operator Vector</h4>
                <OperatorBar vec={latest.operatorGrok} color="emerald" />
                <h4 className="text-xs font-medium text-muted-foreground">Gemini Operator Vector</h4>
                <OperatorBar vec={latest.operatorGemini} color="blue" />
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="text-center p-2 rounded bg-background"><p className="text-muted-foreground">Grok Align</p><p className={cn("font-mono font-bold", (latest.deltaAlignGrok || 0) > 0.25 ? "text-red-400" : "text-green-400")}>{latest.deltaAlignGrok?.toFixed(4)}</p></div>
                <div className="text-center p-2 rounded bg-background"><p className="text-muted-foreground">Gemini Align</p><p className={cn("font-mono font-bold", (latest.deltaAlignGemini || 0) > 0.25 ? "text-red-400" : "text-green-400")}>{latest.deltaAlignGemini?.toFixed(4)}</p></div>
                <div className="text-center p-2 rounded bg-background"><p className="text-muted-foreground">PTCA Energy</p><p className="font-mono font-bold" data-testid="text-ptca-energy">{ptca?.energy?.toFixed(4) || "--"}</p></div>
              </div>
            </div>
          </div>
        )}

        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><Zap className="w-4 h-4 text-yellow-400" /> PTCA Tensor</h3>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div><span className="text-muted-foreground">Axes</span><p className="font-mono" data-testid="text-ptca-axes">53 × 11 × 8 × 7</p></div>
            <div><span className="text-muted-foreground">Geometry</span><p className="font-mono">Heptagram 6+1</p></div>
            <div><span className="text-muted-foreground">prime_node</span><p className="font-mono text-[10px]">53 seeds (first 53 primes)</p></div>
            <div><span className="text-muted-foreground">sentinel</span><p className="font-mono text-[10px]">9 channels (S1-S9)</p></div>
          </div>
          {ptca && (
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="text-center p-2 rounded bg-background"><p className="text-muted-foreground">Heptagram Energy</p><p className="font-mono font-bold" data-testid="text-heptagram-energy">{ptca.heptagramEnergy?.toFixed(4) || "--"}</p></div>
              <div className="text-center p-2 rounded bg-background"><p className="text-muted-foreground">Total Energy</p><p className="font-mono font-bold" data-testid="text-total-energy">{ptca.energy?.toFixed(4) || "--"}</p></div>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><Shield className="w-4 h-4 text-blue-400" /> Sentinel Context</h3>
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between gap-2"><span className="text-muted-foreground">S4 Window</span><span className="font-mono" data-testid="text-s4-window">{liveSentinelCtx?.S4_context ? `${liveSentinelCtx.S4_context.window?.type || "turns"} / W=${liveSentinelCtx.S4_context.window?.W || 32}` : "turns / W=32"}</span></div>
            <div className="flex items-center justify-between gap-2"><span className="text-muted-foreground">S7 Risk</span><span className="font-mono" data-testid="text-s7-risk">{liveSentinelCtx?.S7_risk ? `score=${liveSentinelCtx.S7_risk.score}` : "score=0.12"}</span></div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold text-sm mb-3">EDCMBONE Report</h3>
          <div className="bg-background rounded p-3 font-mono text-[9px] text-muted-foreground whitespace-pre-wrap max-h-48 overflow-auto" data-testid="text-edcmbone-report">
{`{
  "edcmbone": {
    "thread_id": "${latest?.taskId || "thr_..."}",
    "metrics": {
      "CM":    {"value": ${mv("CM")}},
      "DA":    {"value": ${mv("DA")}},
      "DRIFT": {"value": ${mv("DRIFT")}},
      "DVG":   {"value": ${mv("DVG")}},
      "INT":   {"value": ${mv("INT")}},
      "TBF":   {"value": ${mv("TBF")}}
    },
    "provenance": {"build":"v1.1.0-M1"}
  }
}`}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold text-sm mb-3">EDCM History</h3>
          <div className="space-y-2">
            {isLoading ? <Skeleton className="h-20 w-full" /> : snapshots.length === 0 ? <p className="text-xs text-muted-foreground">No history</p> : (
              snapshots.slice(0, 15).map((s: any) => (
                <div key={s.id} className="flex items-center justify-between text-xs border-b border-border pb-1 last:border-0">
                  <div className="flex items-center gap-2"><Badge variant="secondary" className="text-[10px]">{s.decision}</Badge><span className="font-mono">d={s.deltaBone?.toFixed(3)}</span></div>
                  <span className="text-muted-foreground text-[10px]">{new Date(s.createdAt).toLocaleTimeString()}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}
