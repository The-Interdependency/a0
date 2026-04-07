import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { AlertTriangle, Brain, Check, Download, FileText, RefreshCw, Shield, Trash2, Upload, X, Zap } from "lucide-react";
import { type SliderOrientationProps } from "@/lib/console-config";

const S17_PRIMES = [2,3,5,7,11,13,17,19,23,29,31,37,41,43,47,53,59];
const S17_DEPTH = 7;
const S17_ANOMALY_THRESHOLD = 2.0;
const SVG_SIZE = 190;
const SVG_CX = SVG_SIZE / 2;
const SVG_CY = SVG_SIZE / 2;
const SVG_RING_R = 72;
const SVG_NODE_R = 11;

function s17NodePos(i: number) {
  const angle = (i / 17) * 2 * Math.PI - Math.PI / 2;
  return { x: SVG_CX + SVG_RING_R * Math.cos(angle), y: SVG_CY + SVG_RING_R * Math.sin(angle) };
}
function s17SeedMagnitude(deltas: number[][] | undefined, i: number): number {
  if (!deltas?.[i]) return 0;
  return Math.sqrt(deltas[i].reduce((s, v) => s + v * v, 0));
}
function s17SeedActivation(pattern: number[] | undefined, i: number): number {
  if (!pattern) return 0;
  const slice = pattern.slice(i * S17_DEPTH, i * S17_DEPTH + S17_DEPTH);
  return Math.max(...slice.map(Math.abs));
}
function s17ActivationColor(a: number): string {
  const t = Math.min(a / 3, 1);
  if (t >= 0.8) return "#f87171";
  if (t >= 0.5) return "#fbbf24";
  if (t >= 0.2) return "#34d399";
  return "#475569";
}
function s17CohColor(c: number): string {
  if (c >= 0.8) return "text-green-400";
  if (c >= 0.5) return "text-amber-400";
  return "text-red-400";
}

export function MemoryTab({ orientation, isVertical }: SliderOrientationProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = { current: null as HTMLInputElement | null };
  const [editingSeed, setEditingSeed] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [importSeedIndex, setImportSeedIndex] = useState<number | null>(null);
  const [importText, setImportText] = useState("");

  const { data: s17State, refetch: refetchS17 } = useQuery<any>({ queryKey: ["/api/v1/subcore/state"], refetchInterval: 30000 });

  const s17Auditory = s17State?.auditory;
  const s17Visual = s17State?.visual;
  const s17Anomalies: Set<number> = new Set(s17Auditory?.anomalies?.map((a: any) => a.seedIndex as number) ?? []);
  const s17AudioCoh = s17Auditory?.coherence ?? 0;
  const s17VisCoh = s17Visual?.coherence ?? 0;

  const { data: memoryState, isLoading } = useQuery<{
    seeds: Array<{ seedIndex: number; label: string; summary: string; pinned: boolean; enabled: boolean; weight: number; ptcaValues: number[]; sentinelPassCount: number; sentinelFailCount: number; lastSentinelStatus: string | null }>;
    projectionIn: number[][] | null;
    projectionOut: number[][] | null;
    requestCount: number;
  }>({ queryKey: ["/api/v1/memory/state"], refetchInterval: 10000 });

  const { data: driftResults = [] } = useQuery<any[]>({ queryKey: ["/api/v1/memory/drift"], refetchInterval: 30000 });
  const { data: memoryHistory = [] } = useQuery<any[]>({ queryKey: ["/api/v1/memory/history"], refetchInterval: 15000 });

  const updateSeedMutation = useMutation({
    mutationFn: ({ index, updates }: { index: number; updates: any }) => apiRequest("PATCH", `/api/v1/memory/seeds/${index}`, updates),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/v1/memory/state"] }); setEditingSeed(null); },
  });
  const clearSeedMutation = useMutation({
    mutationFn: (index: number) => apiRequest("POST", `/api/v1/memory/seeds/${index}/clear`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/v1/memory/state"] }); toast({ title: "Seed cleared" }); },
  });
  const importSeedMutation = useMutation({
    mutationFn: ({ index, text }: { index: number; text: string }) => apiRequest("POST", `/api/v1/memory/seeds/${index}/import`, { text }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/v1/memory/state"] }); setImportSeedIndex(null); setImportText(""); toast({ title: "Seed text imported" }); },
  });
  const exportMutation = useMutation({
    mutationFn: async () => { const resp = await fetch("/api/v1/memory/export"); if (!resp.ok) throw new Error("Export failed"); return resp.json(); },
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `a0p-memory-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.json`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
      toast({ title: "Memory identity exported" });
    },
    onError: (e: any) => toast({ title: "Export failed", description: e.message, variant: "destructive" }),
  });
  const importMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/v1/memory/import", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/v1/memory/state"] }); toast({ title: "Memory identity imported" }); },
    onError: (e: any) => toast({ title: "Import failed", description: e.message, variant: "destructive" }),
  });

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (!data.seeds || !Array.isArray(data.seeds)) { toast({ title: "Invalid file", variant: "destructive" }); return; }
        importMutation.mutate(data);
      } catch { toast({ title: "Invalid JSON", variant: "destructive" }); }
    };
    reader.readAsText(file); e.target.value = "";
  }

  if (isLoading) return <div className="p-4"><Skeleton className="h-40 w-full" /></div>;

  const seeds = memoryState?.seeds || [];
  const driftWarnings = Array.isArray(driftResults) ? driftResults.filter((d: any) => d.driftScore > 0.6) : [];

  return (
    <ScrollArea className="h-full px-3 py-3">
      <div className="space-y-4 pb-4">
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <div className="flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-primary" />
              <span className="text-sm font-semibold">S17 Sub-Core</span>
              {s17State && <span className="text-[10px] font-mono text-muted-foreground">♥ {s17State.heartbeat}</span>}
            </div>
            <div className="flex items-center gap-2">
              {s17Anomalies.size > 0 && <Badge variant="destructive" className="text-[9px] px-1.5 py-0">⚠ {s17Anomalies.size} break{s17Anomalies.size > 1 ? "s" : ""}</Badge>}
              <div className="flex items-center gap-1.5 text-[10px] font-mono">
                <span className={s17CohColor(s17AudioCoh)}>T {(s17AudioCoh * 100).toFixed(0)}%</span>
                <span className="text-muted-foreground">·</span>
                <span className={s17CohColor(s17VisCoh)}>S {(s17VisCoh * 100).toFixed(0)}%</span>
              </div>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => refetchS17()} data-testid="button-s17-refresh-memory"><RefreshCw className="w-3 h-3" /></Button>
            </div>
          </div>
          <div className={cn("flex gap-3 p-3", isVertical ? "flex-col items-center" : "items-start")}>
            <div className="flex-shrink-0">
              <svg width={SVG_SIZE} height={SVG_SIZE}>
                <circle cx={SVG_CX} cy={SVG_CY} r={SVG_RING_R} fill="none" stroke="#1e293b" strokeWidth="1" />
                {S17_PRIMES.map((_, i) => { const pos = s17NodePos(i); return <line key={i} x1={SVG_CX} y1={SVG_CY} x2={pos.x} y2={pos.y} stroke="#1e293b" strokeWidth="0.5" />; })}
                <text x={SVG_CX} y={SVG_CY - 5} textAnchor="middle" fontSize="7" fill="#64748b" fontFamily="monospace">S17</text>
                <text x={SVG_CX} y={SVG_CY + 9} textAnchor="middle" fontSize="12" fontFamily="monospace" fill="#e2e8f0" fontWeight="bold">{(s17VisCoh * 100).toFixed(0)}%</text>
                {S17_PRIMES.map((prime, i) => {
                  const pos = s17NodePos(i);
                  const activation = s17SeedActivation(s17Visual?.pattern, i);
                  const color = s17ActivationColor(activation);
                  const isAnomaly = s17Anomalies.has(i);
                  return (
                    <g key={i}>
                      {isAnomaly && <circle cx={pos.x} cy={pos.y} r={SVG_NODE_R + 3} fill="none" stroke="#f87171" strokeWidth="1" strokeDasharray="2 2" />}
                      <circle cx={pos.x} cy={pos.y} r={SVG_NODE_R} fill={color} fillOpacity="0.18" stroke={color} strokeWidth="1.5" />
                      <text x={pos.x} y={pos.y + 0.5} textAnchor="middle" dominantBaseline="middle" fontSize="7" fontFamily="monospace" fill={color} fontWeight="bold">{i}</text>
                      <text x={pos.x} y={pos.y + SVG_NODE_R + 5} textAnchor="middle" fontSize="5.5" fontFamily="monospace" fill="#64748b">{prime}</text>
                    </g>
                  );
                })}
              </svg>
            </div>
            <div className="flex-1 min-w-0 space-y-1 pt-1">
              <div className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider mb-1.5">Δ Temporal · seed activity</div>
              {S17_PRIMES.map((_, i) => {
                const mag = s17SeedMagnitude(s17Auditory?.deltas, i);
                const barW = Math.min((mag / S17_ANOMALY_THRESHOLD) * 100, 100);
                const isAnomaly = s17Anomalies.has(i);
                return (
                  <div key={i} className="flex items-center gap-1.5">
                    <span className="font-mono text-[9px] text-muted-foreground w-4 flex-shrink-0 text-right">{i}</span>
                    <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden"><div className={cn("h-full rounded-full transition-all", isAnomaly ? "bg-red-400" : "bg-primary/60")} style={{ width: `${barW}%` }} /></div>
                    <span className="font-mono text-[8px] text-muted-foreground w-8 text-right flex-shrink-0">{mag.toFixed(2)}</span>
                    {isAnomaly && <span className="text-[8px] text-red-400 flex-shrink-0">!</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="font-semibold text-sm flex items-center gap-2"><Brain className="w-4 h-4 text-purple-400" /> Memory Identity</h3>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => exportMutation.mutate()} disabled={exportMutation.isPending} data-testid="button-export-memory"><Download className="w-3.5 h-3.5 mr-1" />{exportMutation.isPending ? "Exporting..." : "Export"}</Button>
            <input type="file" accept=".json" className="hidden" onChange={handleImportFile} ref={node => { if (node) fileInputRef.current = node; }} data-testid="input-import-file" />
            <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importMutation.isPending} data-testid="button-import-memory"><Upload className="w-3.5 h-3.5 mr-1" />{importMutation.isPending ? "Importing..." : "Import"}</Button>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
            <h4 className="font-semibold text-sm">11 External Memory Seeds</h4>
            <Badge variant="secondary" className="text-[9px] font-mono" data-testid="badge-request-count">{memoryState?.requestCount ?? 0} requests</Badge>
          </div>
          {seeds.length === 0 ? <p className="text-xs text-muted-foreground">No memory seeds initialized yet.</p> : (
            <div className="space-y-2">
              {seeds.map((seed) => {
                const totalChecks = seed.sentinelPassCount + seed.sentinelFailCount;
                const passRate = totalChecks > 0 ? (seed.sentinelPassCount / totalChecks * 100).toFixed(0) : "--";
                const ptcaMagnitude = seed.ptcaValues.length > 0 ? Math.sqrt(seed.ptcaValues.reduce((s, v) => s + v * v, 0)).toFixed(2) : "0.00";
                const hasDrift = driftWarnings.some((d: any) => d.seedIndex === seed.seedIndex);
                const isEditing = editingSeed === seed.seedIndex;
                const isImporting = importSeedIndex === seed.seedIndex;
                return (
                  <div key={seed.seedIndex} className={cn("rounded-md border p-2.5 space-y-1.5", !seed.enabled && "opacity-50", hasDrift ? "border-amber-500/50" : "border-border")} data-testid={`card-seed-${seed.seedIndex}`}>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Badge variant="secondary" className="text-[9px] font-mono flex-shrink-0">{seed.seedIndex}</Badge>
                        {isEditing ? <Input value={editLabel} onChange={e => setEditLabel(e.target.value)} className="text-xs h-7 flex-1" data-testid={`input-edit-label-${seed.seedIndex}`} />
                          : <span className="text-xs font-medium truncate" data-testid={`text-seed-label-${seed.seedIndex}`}>{seed.label}</span>}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0 flex-wrap">
                        {hasDrift && <Badge variant="secondary" className="text-[9px] bg-amber-500/20 text-amber-400">DRIFT</Badge>}
                        <Switch checked={seed.pinned} onCheckedChange={(pinned) => updateSeedMutation.mutate({ index: seed.seedIndex, updates: { pinned } })} data-testid={`toggle-pin-${seed.seedIndex}`} />
                        <span className="text-[9px] text-muted-foreground">Pin</span>
                        <Switch checked={seed.enabled} onCheckedChange={(enabled) => updateSeedMutation.mutate({ index: seed.seedIndex, updates: { enabled } })} data-testid={`toggle-enable-${seed.seedIndex}`} />
                      </div>
                    </div>
                    {isEditing ? (
                      <div className="space-y-1.5">
                        <Textarea value={editSummary} onChange={e => setEditSummary(e.target.value.slice(0, 500))} className="text-[10px] font-mono min-h-[60px]" data-testid={`input-edit-summary-${seed.seedIndex}`} />
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[9px] text-muted-foreground">{editSummary.length}/500</span>
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" onClick={() => setEditingSeed(null)} data-testid={`button-cancel-edit-${seed.seedIndex}`}><X className="w-3 h-3 mr-1" />Cancel</Button>
                            <Button size="sm" onClick={() => updateSeedMutation.mutate({ index: seed.seedIndex, updates: { label: editLabel, summary: editSummary } })} disabled={updateSeedMutation.isPending} data-testid={`button-save-edit-${seed.seedIndex}`}><Check className="w-3 h-3 mr-1" />Save</Button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[10px] text-muted-foreground cursor-pointer" onClick={() => { setEditingSeed(seed.seedIndex); setEditLabel(seed.label); setEditSummary(seed.summary || ""); }} data-testid={`text-seed-summary-${seed.seedIndex}`}>
                        {seed.summary || "(empty — click to edit)"}
                      </p>
                    )}
                    <div className={cn(isVertical ? "flex flex-col items-center gap-1" : "flex items-center gap-2")}>
                      <span className="text-[10px] text-muted-foreground flex-shrink-0">Weight</span>
                      <Slider value={[seed.weight]} onValueChange={([val]) => updateSeedMutation.mutate({ index: seed.seedIndex, updates: { weight: val } })} min={0} max={2} step={0.1} orientation={orientation} className={cn(isVertical ? "h-[120px]" : "flex-1")} data-testid={`slider-weight-${seed.seedIndex}`} />
                      <span className="text-[10px] font-mono">{seed.weight.toFixed(1)}</span>
                    </div>
                    <div className="w-full h-1.5 bg-background rounded-full overflow-hidden"><div className="h-full bg-purple-500/60 rounded-full transition-all" style={{ width: `${Math.min(100, parseFloat(ptcaMagnitude) * 10)}%` }} /></div>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-3 text-[9px] text-muted-foreground font-mono flex-wrap">
                        <span>mag={ptcaMagnitude}</span><span>sentinel={passRate}%</span>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button size="sm" variant="ghost" onClick={() => { setEditingSeed(seed.seedIndex); setEditLabel(seed.label); setEditSummary(seed.summary || ""); }} data-testid={`button-edit-seed-${seed.seedIndex}`}><FileText className="w-3 h-3" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => { setImportSeedIndex(seed.seedIndex); setImportText(""); }} data-testid={`button-import-seed-${seed.seedIndex}`}><Upload className="w-3 h-3" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => clearSeedMutation.mutate(seed.seedIndex)} disabled={clearSeedMutation.isPending} data-testid={`button-clear-seed-${seed.seedIndex}`}><Trash2 className="w-3 h-3" /></Button>
                      </div>
                    </div>
                    {isImporting && (
                      <div className="space-y-1.5 pt-1 border-t border-border">
                        <Textarea value={importText} onChange={e => setImportText(e.target.value)} placeholder="Paste text to import..." className="text-[10px] font-mono min-h-[60px]" data-testid={`input-import-text-${seed.seedIndex}`} />
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="outline" onClick={() => setImportSeedIndex(null)}>Cancel</Button>
                          <Button size="sm" onClick={() => importSeedMutation.mutate({ index: seed.seedIndex, text: importText })} disabled={importSeedMutation.isPending || !importText.trim()} data-testid={`button-confirm-import-${seed.seedIndex}`}>Import</Button>
                        </div>
                      </div>
                    )}
                    {hasDrift && (
                      <div className="flex items-center gap-2 pt-1 border-t border-amber-500/30">
                        <AlertTriangle className="w-3 h-3 text-amber-400 flex-shrink-0" />
                        <span className="text-[9px] text-amber-400 flex-1">Semantic drift detected</span>
                        <Button size="sm" variant="outline" onClick={() => updateSeedMutation.mutate({ index: seed.seedIndex, updates: { pinned: true } })} data-testid={`button-repin-${seed.seedIndex}`}>Re-pin</Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h4 className="font-semibold text-sm mb-2 flex items-center gap-2"><Shield className="w-4 h-4 text-blue-400" /> Sentinel Audit</h4>
          {seeds.length === 0 ? <p className="text-xs text-muted-foreground">No sentinel data.</p> : (
            <div className="space-y-1.5">
              {seeds.map((seed) => {
                const total = seed.sentinelPassCount + seed.sentinelFailCount;
                const pRate = total > 0 ? (seed.sentinelPassCount / total) * 100 : 100;
                return (
                  <div key={seed.seedIndex} className="flex items-center gap-2 text-xs" data-testid={`sentinel-audit-${seed.seedIndex}`}>
                    <span className="font-mono w-4 text-muted-foreground flex-shrink-0">{seed.seedIndex}</span>
                    <span className="w-24 truncate text-muted-foreground">{seed.label}</span>
                    <div className="flex-1 h-2 bg-background rounded-full overflow-hidden"><div className={cn("h-full rounded-full transition-all", pRate > 90 ? "bg-green-500" : pRate > 70 ? "bg-amber-500" : "bg-red-500")} style={{ width: `${pRate}%` }} /></div>
                    <span className="font-mono text-[9px] w-12 text-right">{pRate.toFixed(0)}%</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {driftWarnings.length > 0 && (
          <div className="rounded-lg border border-amber-500/50 bg-card p-4">
            <h4 className="font-semibold text-sm mb-2 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-400" /> Drift Warnings</h4>
            <div className="space-y-1.5">
              {driftWarnings.map((d: any) => (
                <div key={d.seedIndex} className="flex items-center justify-between gap-2 text-xs" data-testid={`drift-warning-${d.seedIndex}`}>
                  <div className="flex items-center gap-2 min-w-0"><Badge variant="secondary" className="text-[9px] bg-amber-500/20 text-amber-400">{d.seedIndex}</Badge><span className="truncate text-muted-foreground">{d.label || `Seed ${d.seedIndex}`}</span></div>
                  <span className="font-mono text-amber-400 flex-shrink-0">DRIFT={d.driftScore?.toFixed(3)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-lg border border-border bg-card p-4">
          <h4 className="font-semibold text-sm mb-2">Memory Snapshot History</h4>
          {memoryHistory.length === 0 ? <p className="text-xs text-muted-foreground">No snapshots yet.</p> : (
            <div className="space-y-1.5">
              {memoryHistory.slice(0, 10).map((snap: any) => (
                <div key={snap.id} className="flex items-center justify-between gap-2 text-xs" data-testid={`snapshot-${snap.id}`}>
                  <span className="font-mono text-muted-foreground">#{snap.id}</span>
                  <span className="font-mono">req={snap.requestCount}</span>
                  <span className="text-muted-foreground text-[10px]">{new Date(snap.createdAt).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ScrollArea>
  );
}
