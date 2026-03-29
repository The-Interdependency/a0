import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Shield, Code2, ExternalLink, Save, RotateCcw, Download, Play, Square, Trash2, Cpu, GitMerge, Zap } from "lucide-react";
import { TAB_GROUPS } from "@/lib/console-config";

interface Props {
  activeTab?: string;
  onNavigate?: (tabId: string) => void;
}

const GROUP_COLORS = [
  { fill: "#3b82f6", stroke: "#1d4ed8", label: "Runtime" },
  { fill: "#a855f7", stroke: "#7e22ce", label: "Reasoning" },
  { fill: "#22c55e", stroke: "#15803d", label: "Memory" },
  { fill: "#f59e0b", stroke: "#b45309", label: "Tools" },
  { fill: "#f97316", stroke: "#c2410c", label: "System" },
  { fill: "#06b6d4", stroke: "#0e7490", label: "Research" },
];

const SENTINEL_GROUP_MAP = [
  [0, 1],
  [2, 3],
  [4, 5],
  [6, 7],
  [8, 9],
  [10],
];

function toRad(deg: number) { return (deg * Math.PI) / 180; }

function tabPosition(groupIndex: number, tabIndex: number, R: number) {
  const GAP_DEG = 6;
  const ARC_DEG = 60 - GAP_DEG;
  const startDeg = -90 + groupIndex * 60 + GAP_DEG / 2;
  const angle = tabIndex === 0 ? startDeg : startDeg + (tabIndex / 4) * ARC_DEG;
  const rad = toRad(angle);
  return { x: R * Math.cos(rad), y: R * Math.sin(rad), angle };
}

export function GuardianTab({ activeTab, onNavigate }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [hoveredTab, setHoveredTab] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [psiSliders, setPsiSliders] = useState<Record<number, number>>({});
  const [thrSliders, setThrSliders] = useState<Record<number, number>>({});
  const [editingThreshold, setEditingThreshold] = useState<number | null>(null);

  const { data: psiState, isLoading: psiLoading } = useQuery<any>({
    queryKey: ["/api/v1/psi/state"],
    refetchInterval: 8000,
  });

  const { data: omegaState } = useQuery<any>({
    queryKey: ["/api/v1/omega/state"],
    refetchInterval: 8000,
  });

  const { data: sourceData, isLoading: sourceLoading } = useQuery<{
    tabId: string; filename: string; code: string; lines: number; bytes: number; filePath: string;
  }>({
    queryKey: ["/api/v1/psi/source", selectedNode],
    enabled: !!selectedNode,
    staleTime: 5000,
  });

  const biasMutation = useMutation({
    mutationFn: ({ dimension, bias }: { dimension: number; bias: number }) =>
      apiRequest("POST", "/api/psi/bias", { dimension, bias }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/psi/state"] });
      toast({ title: "Ψ bias applied" });
    },
    onError: (e: any) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const thresholdMutation = useMutation({
    mutationFn: ({ dimension, threshold }: { dimension: number; threshold: number }) =>
      apiRequest("POST", "/api/psi/threshold", { dimension, threshold }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/psi/state"] });
      setEditingThreshold(null);
      toast({ title: "Ψ threshold updated" });
    },
    onError: (e: any) => toast({ title: "Threshold update failed", description: e.message, variant: "destructive" }),
  });

  const modeMutation = useMutation({
    mutationFn: (mode: string) => apiRequest("POST", "/api/omega/mode", { mode }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/omega/state"] });
      toast({ title: "Ω mode updated" });
    },
  });

  const saveMutation = useMutation({
    mutationFn: ({ tabId, code }: { tabId: string; code: string }) =>
      apiRequest("PUT", `/api/psi/source/${tabId}`, { code }),
    onSuccess: (_, { tabId }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/psi/source", tabId] });
      setEditingCode(null);
      toast({ title: "Source written to tensor node", description: `${tabId} — Vite HMR active` });
    },
    onError: (e: any) => toast({ title: "Write failed", description: e.message, variant: "destructive" }),
  });

  const dims: number[] = psiState?.dimensionEnergies || [];
  const labels: string[] = psiState?.labels || psiState?.dimensionLabels || [];
  const thresholds: number[] = psiState?.thresholds || psiState?.dimensionThresholds || [];
  const biases: number[] = psiState?.dimensionBiases || [];

  function groupEnergy(groupIndex: number): number {
    const sentinels = SENTINEL_GROUP_MAP[groupIndex];
    const vals = sentinels.map(s => dims[s] ?? 0);
    return vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
  }

  const CX = 160, CY = 160, R = 118, NODE_R = 9, INNER_R = 32;
  const overallEnergy = dims.length > 0 ? dims.reduce((a, b) => a + b, 0) / dims.length : 0;

  const omegaMode = omegaState?.mode || "active";
  const OMEGA_MODES = ["active", "passive", "economy", "research"];

  const psi3 = dims[3] ?? 0;
  const psi4 = dims[4] ?? 0;
  const psi5 = dims[5] ?? 0;
  const psi3t = thresholds[3] ?? 0.6;
  const psi4t = thresholds[4] ?? 0.5;
  const psi5t = thresholds[5] ?? 0.5;

  const gateColor = (e: number, t: number) =>
    e >= t ? "text-green-500" : e >= t * 0.7 ? "text-amber-500" : "text-red-500";
  const gateLabel = (e: number, t: number) => e >= t ? "Open" : "Restricted";

  const selectedTabDef = selectedNode
    ? TAB_GROUPS.flatMap(g => g.tabs).find(t => t.id === selectedNode)
    : null;
  const selectedGroupIdx = selectedNode
    ? TAB_GROUPS.findIndex(g => g.tabs.some(t => t.id === selectedNode))
    : -1;

  function handleNodeClick(tabId: string) {
    setSelectedNode(tabId);
    setEditingCode(null);
    onNavigate?.(tabId);
  }

  const displayCode = editingCode !== null ? editingCode : (sourceData?.code ?? "");

  return (
    <div className="h-full w-full overflow-y-auto overflow-x-hidden px-3 py-3 space-y-4">
      <div className="flex items-center gap-2">
        <Shield className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold" data-testid="text-guardian-title">Guardian — Tensor Map</h3>
        {hoveredTab && (
          <Badge variant="outline" className="ml-auto text-xs font-mono">{hoveredTab}</Badge>
        )}
      </div>

      {/* ── Tensor Ring ── */}
      <div className="rounded-lg border border-border bg-card p-2 flex flex-col items-center">
        <p className="text-xs text-muted-foreground mb-1">PTCA-Ψ Node Map — click a node to inspect its code</p>
        {psiLoading ? (
          <Skeleton className="w-[320px] h-[320px] rounded-full" />
        ) : (
          <svg
            viewBox="0 0 320 320"
            width="320"
            height="320"
            className="overflow-visible"
            data-testid="svg-tensor-ring"
          >
            <defs>
              {GROUP_COLORS.map((c, gi) => (
                <radialGradient key={gi} id={`grd-${gi}`} cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor={c.fill} stopOpacity="0.9" />
                  <stop offset="100%" stopColor={c.stroke} stopOpacity="0.6" />
                </radialGradient>
              ))}
              <radialGradient id="center-grd" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#6366f1" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#1e1b4b" stopOpacity="0.05" />
              </radialGradient>
              <filter id="glow">
                <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <circle cx={CX} cy={CY} r={R} fill="none" stroke="currentColor" strokeOpacity="0.07" strokeWidth="1" />

            <circle cx={CX} cy={CY} r={INNER_R} fill="url(#center-grd)" stroke="#6366f1" strokeOpacity="0.3" strokeWidth="1" />
            <text x={CX} y={CY - 6} textAnchor="middle" fill="#a5b4fc" fontSize="8" fontFamily="monospace">PTCA-Ψ</text>
            <text x={CX} y={CY + 5} textAnchor="middle" fill="#818cf8" fontSize="10" fontFamily="monospace" fontWeight="bold">
              {overallEnergy.toFixed(3)}
            </text>
            <text x={CX} y={CY + 16} textAnchor="middle" fill="#6366f1" fontSize="7" fontFamily="monospace">{dims.length}D</text>

            {TAB_GROUPS.map((group, gi) => {
              const gc = GROUP_COLORS[gi] || GROUP_COLORS[0];
              const energy = groupEnergy(gi);

              return group.tabs.map((tab, ti) => {
                const { x: nx, y: ny } = tabPosition(gi, ti, R);
                const px = CX + nx;
                const py = CY + ny;
                const isActive = activeTab === tab.id;
                const isSelected = selectedNode === tab.id;
                const isHovered = hoveredTab === tab.id;
                const tabEnergy = Math.min(1, energy * 0.75 + (dims[(SENTINEL_GROUP_MAP[gi][0] ?? 0) + ti] ?? 0) * 0.25);
                const nodeRadius = NODE_R + tabEnergy * 2;
                const opacity = 0.4 + tabEnergy * 0.6;

                return (
                  <g key={tab.id}>
                    <line
                      x1={CX + (nx * INNER_R) / R}
                      y1={CY + (ny * INNER_R) / R}
                      x2={px - (nx / R) * nodeRadius}
                      y2={py - (ny / R) * nodeRadius}
                      stroke={gc.fill}
                      strokeOpacity={isSelected ? 0.5 : 0.12 + tabEnergy * 0.15}
                      strokeWidth={isSelected ? 1 : 0.5}
                    />

                    {(isSelected || isActive || isHovered) && (
                      <circle
                        cx={px} cy={py}
                        r={nodeRadius + (isSelected ? 6 : 4)}
                        fill="none"
                        stroke={isSelected ? "#f0abfc" : isActive ? "#ffffff" : gc.fill}
                        strokeOpacity={isSelected ? 0.9 : isActive ? 0.7 : 0.5}
                        strokeWidth={isSelected ? 2 : isActive ? 1.5 : 1}
                        filter="url(#glow)"
                      />
                    )}

                    <circle
                      cx={px} cy={py}
                      r={nodeRadius}
                      fill={`url(#grd-${gi})`}
                      fillOpacity={opacity}
                      stroke={isSelected ? "#f0abfc" : isActive ? "#ffffff" : gc.stroke}
                      strokeWidth={isSelected ? 2 : isActive ? 1.5 : 0.8}
                      strokeOpacity={isSelected || isActive ? 1 : 0.6}
                      filter={(isSelected || tabEnergy > 0.7) ? "url(#glow)" : undefined}
                      style={{ cursor: "pointer", transition: "all 0.15s ease" }}
                      onClick={() => handleNodeClick(tab.id)}
                      onMouseEnter={() => setHoveredTab(tab.id)}
                      onMouseLeave={() => setHoveredTab(null)}
                      data-testid={`tensor-node-${tab.id}`}
                    />

                    <circle cx={px} cy={py} r={2}
                      fill="#ffffff"
                      fillOpacity={0.3 + tabEnergy * 0.5}
                      style={{ pointerEvents: "none" }}
                    />

                    {(isSelected || isActive || isHovered) && (
                      <text
                        x={px + (nx / R) * (nodeRadius + 10)}
                        y={py + (ny / R) * (nodeRadius + 10)}
                        textAnchor={nx > 10 ? "start" : nx < -10 ? "end" : "middle"}
                        dominantBaseline={ny > 10 ? "auto" : ny < -10 ? "hanging" : "middle"}
                        fill={isSelected ? "#f0abfc" : "#e2e8f0"}
                        fontSize="7"
                        fontFamily="monospace"
                        style={{ pointerEvents: "none" }}
                      >
                        {tab.label}
                      </text>
                    )}
                  </g>
                );
              });
            })}

            {TAB_GROUPS.map((group, gi) => {
              const GAP_DEG = 6;
              const ARC_DEG = 60 - GAP_DEG;
              const startDeg = -90 + gi * 60 + GAP_DEG / 2;
              const midAngle = startDeg + ARC_DEG / 2;
              const labelR = R + 20;
              const rad = toRad(midAngle);
              const lx = CX + labelR * Math.cos(rad);
              const ly = CY + labelR * Math.sin(rad);
              const gc = GROUP_COLORS[gi];
              return (
                <text key={group.id} x={lx} y={ly}
                  textAnchor="middle" dominantBaseline="middle"
                  fill={gc.fill} fontSize="6.5" fontFamily="monospace" fontWeight="bold" fillOpacity="0.8">
                  {group.label.toUpperCase()}
                </text>
              );
            })}
          </svg>
        )}

        <div className="flex flex-wrap justify-center gap-2 mt-1">
          {GROUP_COLORS.map((c, i) => (
            <div key={i} className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: c.fill }} />
              <span className="text-xs text-muted-foreground">{TAB_GROUPS[i]?.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Source Code Panel ── */}
      {selectedNode && (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30">
            <Code2 className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-mono font-medium flex-1">
              {sourceData?.filePath ?? selectedNode}
            </span>
            {sourceData && (
              <span className="text-xs text-muted-foreground font-mono">
                {sourceData.lines}L · {(sourceData.bytes / 1024).toFixed(1)}KB
              </span>
            )}
            <Button
              size="sm" variant="ghost" className="h-6 text-xs px-2 gap-1"
              onClick={() => onNavigate?.(selectedNode)}
              data-testid="button-go-to-tab"
            >
              <ExternalLink className="w-3 h-3" /> Go
            </Button>
          </div>

          {selectedGroupIdx >= 0 && (
            <div
              className="h-1"
              style={{ backgroundColor: GROUP_COLORS[selectedGroupIdx]?.fill, opacity: 0.6 }}
            />
          )}

          {sourceLoading ? (
            <div className="p-4 space-y-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
              <Skeleton className="h-3 w-3/5" />
            </div>
          ) : sourceData ? (
            <>
              <textarea
                className="w-full font-mono text-xs bg-background text-foreground p-3 resize-none outline-none leading-relaxed"
                style={{ minHeight: "240px", tabSize: 2 }}
                value={displayCode}
                onChange={e => setEditingCode(e.target.value)}
                spellCheck={false}
                data-testid="textarea-source-code"
              />
              {editingCode !== null && (
                <div className="flex items-center gap-2 px-3 py-2 border-t border-border bg-muted/20">
                  <span className="text-xs text-amber-500 flex-1">Unsaved changes — write to tensor node?</span>
                  <Button
                    size="sm" variant="ghost" className="h-6 text-xs px-2 gap-1"
                    onClick={() => setEditingCode(null)}
                    data-testid="button-discard-code"
                  >
                    <RotateCcw className="w-3 h-3" /> Discard
                  </Button>
                  <Button
                    size="sm" variant="default" className="h-6 text-xs px-2 gap-1"
                    onClick={() => saveMutation.mutate({ tabId: selectedNode, code: editingCode })}
                    disabled={saveMutation.isPending}
                    data-testid="button-save-code"
                  >
                    <Save className="w-3 h-3" /> Write
                  </Button>
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground px-3 py-4">No source mapping for this node.</p>
          )}
        </div>
      )}

      {/* ── Ψ Gate Controls ── */}
      <div className="rounded-lg border border-border bg-card p-3 space-y-3">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Ψ Gate Thresholds (Ψ3/4/5)</h4>
        {[
          { idx: 3, val: psi3, thr: psi3t, label: labels[3] || "Confidence (Ψ3)" },
          { idx: 4, val: psi4, thr: psi4t, label: labels[4] || "Clarity (Ψ4)" },
          { idx: 5, val: psi5, thr: psi5t, label: labels[5] || "Identity (Ψ5)" },
        ].map(({ idx, val, thr, label }) => {
          const biasVal = psiSliders[idx] ?? biases[idx] ?? 0;
          const thrVal = thrSliders[idx] ?? thr;
          const isEditingThr = editingThreshold === idx;
          return (
            <div key={idx} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs">{label}</span>
                <div className="flex items-center gap-1.5">
                  <span className={`text-xs font-mono ${gateColor(val, thr)}`}>{val.toFixed(3)}</span>
                  <Badge variant="outline" className={`text-xs ${gateColor(val, thr)}`} data-testid={`gate-psi${idx}`}>
                    {gateLabel(val, thr)}
                  </Badge>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground flex-1">
                  Thr: {thr.toFixed(2)} | Bias: {biasVal.toFixed(2)}
                </span>
                <Button size="sm" variant="ghost" className="h-5 text-xs px-1.5"
                  onClick={() => setEditingThreshold(isEditingThr ? null : idx)}
                  data-testid={`button-edit-threshold-psi${idx}`}>
                  {isEditingThr ? "↑ bias" : "edit thr"}
                </Button>
              </div>
              {isEditingThr ? (
                <>
                  <Slider min={0} max={1} step={0.05} value={[thrVal]}
                    onValueChange={([v]) => setThrSliders(prev => ({ ...prev, [idx]: v }))}
                    data-testid={`slider-threshold-psi${idx}`} />
                  <Button size="sm" variant="outline" className="h-6 text-xs"
                    onClick={() => thresholdMutation.mutate({ dimension: idx, threshold: thrVal })}
                    disabled={thresholdMutation.isPending}
                    data-testid={`button-apply-threshold-psi${idx}`}>
                    Set Ψ{idx} → {thrVal.toFixed(2)}
                  </Button>
                </>
              ) : (
                <>
                  <Slider min={-1} max={1} step={0.05} value={[biasVal]}
                    onValueChange={([v]) => setPsiSliders(prev => ({ ...prev, [idx]: v }))}
                    data-testid={`slider-psi${idx}`} />
                  <Button size="sm" variant="outline" className="h-6 text-xs"
                    onClick={() => biasMutation.mutate({ dimension: idx, bias: biasVal })}
                    disabled={biasMutation.isPending}
                    data-testid={`button-apply-psi${idx}`}>
                    Apply Ψ{idx} Bias
                  </Button>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Ω Mode ── */}
      <div className="rounded-lg border border-border bg-card p-3 space-y-2">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Ω Mode Control</h4>
        <div className="flex flex-wrap gap-2">
          {OMEGA_MODES.map(m => (
            <Button key={m} size="sm" variant={omegaMode === m ? "default" : "outline"}
              className="h-7 text-xs capitalize"
              onClick={() => modeMutation.mutate(m)}
              disabled={modeMutation.isPending}
              data-testid={`button-omega-mode-${m}`}>
              {m}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Current: <span className="font-medium capitalize">{omegaMode}</span></p>
      </div>

      {/* ── PCNA Six-Ring Engine ── */}
      <PCNAPanel />

      {/* ── Ollama Embedded Server ── */}
      <OllamaPanel />
    </div>
  );
}

// ── PCNA Ring definitions ────────────────────────────────────────────────────
const PCNA_RINGS = [
  { id: "phi",      label: "Φ",  n: 53, color: "#6366f1", desc: "Slot-A substrate" },
  { id: "psi",      label: "Ψ",  n: 53, color: "#a855f7", desc: "Self-model" },
  { id: "omega",    label: "Ω",  n: 53, color: "#22c55e", desc: "Autonomy" },
  { id: "guardian", label: "G",  n: 29, color: "#f59e0b", desc: "Microkernel" },
  { id: "memory_l", label: "ML", n: 19, color: "#06b6d4", desc: "Long-term" },
  { id: "memory_s", label: "MS", n: 17, color: "#f97316", desc: "Short-term" },
];

function PrimeRingMini({ label, n, color, coherence, active }: {
  label: string; n: number; color: string; coherence: number; active: boolean;
}) {
  const R = 28, cx = 36, cy = 36;
  const nodes = Array.from({ length: Math.min(n, 29) }, (_, i) => {
    const angle = (i / Math.min(n, 29)) * 2 * Math.PI - Math.PI / 2;
    return { x: cx + R * Math.cos(angle), y: cy + R * Math.sin(angle) };
  });
  const fillOpacity = 0.25 + coherence * 0.55;

  return (
    <svg viewBox="0 0 72 72" width="72" height="72" className="overflow-visible">
      <defs>
        <radialGradient id={`mini-${label}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={color} stopOpacity={fillOpacity} />
          <stop offset="100%" stopColor={color} stopOpacity="0.04" />
        </radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r={R} fill={`url(#mini-${label})`} stroke={color} strokeOpacity="0.25" strokeWidth="0.8" />
      {nodes.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={1.4} fill={color} fillOpacity={0.4 + coherence * 0.5} />
      ))}
      <circle cx={cx} cy={cy} r={10} fill={color} fillOpacity={0.12} stroke={color} strokeOpacity="0.4" strokeWidth="0.8" />
      <text x={cx} y={cy - 2} textAnchor="middle" fill={color} fontSize="9" fontFamily="monospace" fontWeight="bold">{label}</text>
      <text x={cx} y={cy + 8} textAnchor="middle" fill={color} fontSize="6" fontFamily="monospace">{coherence.toFixed(2)}</text>
      {active && <circle cx={cx} cy={cy} r={R + 3} fill="none" stroke={color} strokeOpacity="0.5" strokeWidth="1.2" strokeDasharray="3 2" />}
    </svg>
  );
}

function PCNAPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [inferText, setInferText] = useState("");
  const [lastResult, setLastResult] = useState<any>(null);

  const { data: pcnaState, isLoading } = useQuery<any>({
    queryKey: ["/api/pcna/state"],
    refetchInterval: 6000,
  });

  const { data: instances } = useQuery<any>({
    queryKey: ["/api/pcna/instances"],
    refetchInterval: 10000,
  });

  const inferMut = useMutation({
    mutationFn: (text: string) => apiRequest("POST", "/api/pcna/infer", { text }),
    onSuccess: (data: any) => {
      setLastResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/pcna/state"] });
      toast({ title: `PCNA infer → ${data?.winner ?? "?"}`, description: `coherence ${data?.coherence_score?.toFixed(3) ?? "?"}` });
    },
    onError: (e: any) => toast({ title: "Infer failed", description: e.message, variant: "destructive" }),
  });

  const rewardMut = useMutation({
    mutationFn: ({ winner, outcome }: { winner: string; outcome: number }) =>
      apiRequest("POST", "/api/pcna/reward", { winner, outcome }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/pcna/state"] });
      toast({ title: "Reward applied", description: data?.memory_flush ? "Memory-S flushed → L" : "Rings nudged" });
    },
    onError: (e: any) => toast({ title: "Reward failed", description: e.message, variant: "destructive" }),
  });

  const spawnMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/pcna/instances/spawn", {}),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/pcna/instances"] });
      toast({ title: "Instance spawned", description: data?.child_id?.slice(0, 12) + "..." });
    },
    onError: (e: any) => toast({ title: "Spawn failed", description: e.message, variant: "destructive" }),
  });

  const rings = pcnaState?.rings ?? {};
  const winner = lastResult?.winner ?? pcnaState?.last_winner ?? "phi";

  function ringCoherence(id: string): number {
    if (id === "phi") return rings.phi?.ring_coherence ?? 0.5;
    if (id === "guardian") return rings.guardian?.ring_coherence ?? 0.5;
    if (id === "memory_l") return rings.memory_l?.avg_hub ?? 0.5;
    if (id === "memory_s") return rings.memory_s?.avg_hub ?? 0.5;
    return 0.5;
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Cpu className="w-3.5 h-3.5 text-primary" />
        <h4 className="text-xs font-semibold" data-testid="text-pcna-title">PCNA — Six-Ring Engine</h4>
        {pcnaState && (
          <Badge variant="outline" className="ml-auto text-[9px] font-mono">
            infer×{pcnaState.infer_count} · rew×{pcnaState.reward_count}
          </Badge>
        )}
      </div>

      {/* Six ring mini panels */}
      {isLoading ? (
        <div className="flex gap-2 flex-wrap justify-center">
          {PCNA_RINGS.map(r => <Skeleton key={r.id} className="w-[72px] h-[72px] rounded-full" />)}
        </div>
      ) : (
        <div className="flex gap-2 flex-wrap justify-center" data-testid="pcna-ring-grid">
          {PCNA_RINGS.map(r => (
            <div key={r.id} className="flex flex-col items-center gap-0.5">
              <PrimeRingMini
                label={r.label}
                n={r.n}
                color={r.color}
                coherence={ringCoherence(r.id)}
                active={winner === r.id}
              />
              <span className="text-[8px] text-muted-foreground font-mono">{r.desc}</span>
              <span className="text-[8px] font-mono" style={{ color: r.color }}>N={r.n}</span>
            </div>
          ))}
        </div>
      )}

      {/* Last infer result */}
      {lastResult && (
        <div className="rounded border border-border bg-muted/20 p-2 space-y-1" data-testid="pcna-last-result">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className="text-[9px]" style={{ backgroundColor: PCNA_RINGS.find(r => r.id === lastResult.winner)?.color + "33" }}>
              winner: {lastResult.winner}
            </Badge>
            <span className="text-[9px] font-mono text-muted-foreground">coherence {lastResult.coherence_score?.toFixed(4)}</span>
            <span className="text-[9px] font-mono text-muted-foreground">conf {lastResult.confidence?.toFixed(3)}</span>
            <span className="text-[9px] font-mono text-muted-foreground">{lastResult.elapsed_ms}ms</span>
          </div>
          <div className="flex gap-1 flex-wrap">
            {(["phi", "psi", "omega"] as const).map(slot => (
              <Button key={slot} size="sm" variant="outline" className="h-5 text-[9px] px-1.5"
                onClick={() => rewardMut.mutate({ winner: slot, outcome: slot === lastResult.winner ? 0.7 : -0.3 })}
                disabled={rewardMut.isPending}
                data-testid={`button-reward-${slot}`}>
                +rew {slot}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Infer input */}
      <div className="flex gap-1.5">
        <Input
          value={inferText}
          onChange={e => setInferText(e.target.value)}
          onKeyDown={e => e.key === "Enter" && inferText.trim() && inferMut.mutate(inferText.trim())}
          placeholder="Run PCNA inference…"
          className="h-7 text-xs flex-1"
          data-testid="input-pcna-infer"
        />
        <Button size="sm" className="h-7 px-2 gap-1"
          onClick={() => inferMut.mutate(inferText.trim() || "ping")}
          disabled={inferMut.isPending}
          data-testid="button-pcna-infer">
          <Zap className="w-3 h-3" />
          {inferMut.isPending ? "…" : "Infer"}
        </Button>
      </div>

      {/* Instance mesh */}
      <div className="flex items-center gap-2 pt-1 border-t border-border/50">
        <GitMerge className="w-3 h-3 text-muted-foreground" />
        <span className="text-[10px] text-muted-foreground flex-1">
          Instances: {instances?.count ?? 1}
        </span>
        <Button size="sm" variant="outline" className="h-5 text-[9px] px-1.5"
          onClick={() => spawnMut.mutate()}
          disabled={spawnMut.isPending}
          data-testid="button-pcna-spawn">
          Fork
        </Button>
      </div>

      {/* Guardian encryption badge */}
      {pcnaState?.rings?.guardian?.encryption && (
        <p className="text-[8px] font-mono text-muted-foreground truncate" data-testid="text-guardian-crypto">
          🔐 {pcnaState.rings.guardian.encryption.algorithm} · {pcnaState.rings.guardian.encryption.kex}+{pcnaState.rings.guardian.encryption.signing} · key {pcnaState.rings.guardian.encryption.key_id?.slice(0, 10)}…
        </p>
      )}
    </div>
  );
}

function OllamaPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [pullModel, setPullModel] = useState("");
  const [pullLog, setPullLog] = useState("");
  const [pulling, setPulling] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const { data: status, isLoading } = useQuery<{
    running: boolean; processAlive: boolean; binaryInstalled: boolean; models: string[];
  }>({
    queryKey: ["/api/v1/ollama/status"],
    refetchInterval: 5000,
  });

  const installMutation = useMutation({
    mutationFn: async () => {
      setPullLog("Installing Ollama...\n");
      const r = await fetch("/api/v1/ollama/install", { method: "POST" });
      const reader = r.body!.getReader();
      const dec = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        setPullLog(prev => prev + dec.decode(value));
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/v1/ollama/status"] }); toast({ title: "Ollama installed" }); },
    onError: (e: any) => toast({ title: "Install failed", description: e.message, variant: "destructive" }),
  });

  const startMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/v1/ollama/start", {}),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/v1/ollama/status"] }); toast({ title: "Ollama started" }); },
    onError: (e: any) => toast({ title: "Start failed", description: e.message, variant: "destructive" }),
  });

  const stopMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/v1/ollama/stop", {}),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/v1/ollama/status"] }); toast({ title: "Ollama stopped" }); },
    onError: (e: any) => toast({ title: "Stop failed", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (name: string) => apiRequest("DELETE", `/api/v1/ollama/models/${encodeURIComponent(name)}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/v1/ollama/status", "/api/v1/ollama/models"] }),
    onError: (e: any) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const assignMutation = useMutation({
    mutationFn: ({ slotKey, model }: { slotKey: string; model: string }) =>
      apiRequest("PATCH", `/api/agent/slots/${slotKey}`, {
        provider: "ollama", model, baseUrl: "http://0.0.0.0:11434/v1", label: slotKey.toUpperCase(),
      }),
    onSuccess: (_, { slotKey, model }) => toast({ title: `Slot ${slotKey.toUpperCase()} → ${model}` }),
    onError: (e: any) => toast({ title: "Assign failed", description: e.message, variant: "destructive" }),
  });

  async function handlePull() {
    if (!pullModel.trim()) return;
    setPullLog("");
    setPulling(true);
    abortRef.current = new AbortController();
    try {
      const r = await fetch("/api/v1/ollama/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: pullModel.trim() }),
        signal: abortRef.current.signal,
      });
      const reader = r.body!.getReader();
      const dec = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        setPullLog(prev => prev + dec.decode(value));
      }
      queryClient.invalidateQueries({ queryKey: ["/api/v1/ollama/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/ollama/models"] });
      toast({ title: `Pulled ${pullModel.trim()}` });
    } catch (e: any) {
      if (e.name !== "AbortError") toast({ title: "Pull failed", description: e.message, variant: "destructive" });
    } finally {
      setPulling(false);
    }
  }

  const SLOT_COLORS: Record<string, string> = {
    a: "border-blue-400/50 text-blue-400 hover:bg-blue-500/10",
    b: "border-orange-400/50 text-orange-400 hover:bg-orange-500/10",
    c: "border-purple-400/50 text-purple-400 hover:bg-purple-500/10",
  };

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-3" data-testid="panel-ollama">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Ollama (Local Models)</h4>
        <div className="flex items-center gap-2">
          {isLoading ? (
            <Skeleton className="w-12 h-4" />
          ) : (
            <Badge
              variant="outline"
              className={cn("text-[9px]", status?.running ? "text-green-500 border-green-500/40" : "text-muted-foreground")}
              data-testid="badge-ollama-status"
            >
              {status?.running ? "running" : "stopped"}
            </Badge>
          )}
          {!status?.binaryInstalled ? (
            <Button size="sm" className="h-6 text-[10px] gap-1" onClick={() => installMutation.mutate()} disabled={installMutation.isPending} data-testid="button-ollama-install">
              <Download className="w-3 h-3" />{installMutation.isPending ? "Installing…" : "Install"}
            </Button>
          ) : status?.running ? (
            <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1 text-destructive border-destructive/30" onClick={() => stopMutation.mutate()} disabled={stopMutation.isPending} data-testid="button-ollama-stop">
              <Square className="w-3 h-3" />{stopMutation.isPending ? "…" : "Stop"}
            </Button>
          ) : (
            <Button size="sm" className="h-6 text-[10px] gap-1" onClick={() => startMutation.mutate()} disabled={startMutation.isPending} data-testid="button-ollama-start">
              <Play className="w-3 h-3" />{startMutation.isPending ? "Starting…" : "Start"}
            </Button>
          )}
        </div>
      </div>

      {/* Pull model */}
      {status?.binaryInstalled && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-muted-foreground">Pull model</p>
          <div className="flex gap-1.5">
            <Input
              value={pullModel}
              onChange={e => setPullModel(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !pulling && handlePull()}
              placeholder="e.g. llama3.2, mistral, phi3…"
              className="h-7 text-xs font-mono flex-1"
              data-testid="input-ollama-pull-model"
            />
            <Button size="sm" className="h-7 px-2 gap-1" onClick={handlePull} disabled={pulling || !pullModel.trim()} data-testid="button-ollama-pull">
              <Download className="w-3 h-3" />{pulling ? "Pulling…" : "Pull"}
            </Button>
          </div>
          {pullLog && (
            <pre className="text-[8px] font-mono bg-muted/30 rounded p-2 max-h-20 overflow-y-auto whitespace-pre-wrap" data-testid="pre-ollama-pull-log">
              {pullLog}
            </pre>
          )}
        </div>
      )}

      {/* Local models list */}
      {status?.running && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-muted-foreground">Local models ({(status?.models ?? []).length})</p>
          {(status?.models ?? []).length === 0 ? (
            <p className="text-[9px] text-muted-foreground">No models pulled yet. Pull one above.</p>
          ) : (
            <div className="space-y-1">
              {(status?.models ?? []).map(m => (
                <div key={m} className="flex items-center gap-1.5 rounded border border-border bg-background px-2 py-1.5">
                  <span className="font-mono text-[9px] flex-1 truncate">{m}</span>
                  <div className="flex gap-0.5">
                    {(["a", "b", "c"] as const).map(s => (
                      <button
                        key={s}
                        onClick={() => assignMutation.mutate({ slotKey: s, model: m })}
                        className={cn("w-5 h-5 rounded border text-[8px] font-bold transition-all", SLOT_COLORS[s])}
                        title={`Assign to slot ${s.toUpperCase()}`}
                        data-testid={`assign-ollama-${s}-${m}`}
                      >
                        {s.toUpperCase()}
                      </button>
                    ))}
                    <button
                      onClick={() => deleteMutation.mutate(m)}
                      className="w-5 h-5 rounded border border-destructive/40 text-destructive hover:bg-destructive/10 flex items-center justify-center"
                      title="Delete model"
                      data-testid={`delete-ollama-${m}`}
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Install log */}
      {installMutation.isPending && pullLog && (
        <pre className="text-[8px] font-mono bg-muted/30 rounded p-2 max-h-16 overflow-y-auto">{pullLog}</pre>
      )}
    </div>
  );
}
