import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Shield } from "lucide-react";
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
  const angle = tabIndex === 0 ? startDeg
    : startDeg + (tabIndex / 4) * ARC_DEG;
  const rad = toRad(angle);
  return { x: R * Math.cos(rad), y: R * Math.sin(rad), angle };
}

export function GuardianTab({ activeTab, onNavigate }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [hoveredTab, setHoveredTab] = useState<string | null>(null);
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

  const dims: number[] = psiState?.dimensionEnergies || [];
  const labels: string[] = psiState?.labels || psiState?.dimensionLabels || [];
  const thresholds: number[] = psiState?.thresholds || psiState?.dimensionThresholds || [];
  const biases: number[] = psiState?.dimensionBiases || [];

  function groupEnergy(groupIndex: number): number {
    const sentinels = SENTINEL_GROUP_MAP[groupIndex];
    const vals = sentinels.map(s => dims[s] ?? 0);
    return vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
  }

  const CX = 160;
  const CY = 160;
  const R = 118;
  const NODE_R = 9;
  const INNER_R = 32;

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

  const overallEnergy = dims.length > 0 ? dims.reduce((a, b) => a + b, 0) / dims.length : 0;

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
        <p className="text-xs text-muted-foreground mb-1">PTCA-Ψ Node Map — click any circle to navigate</p>
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

            {/* Outer guide ring */}
            <circle cx={CX} cy={CY} r={R} fill="none" stroke="currentColor" strokeOpacity="0.07" strokeWidth="1" />

            {/* Center core */}
            <circle cx={CX} cy={CY} r={INNER_R} fill="url(#center-grd)" stroke="#6366f1" strokeOpacity="0.3" strokeWidth="1" />
            <text x={CX} y={CY - 6} textAnchor="middle" fill="#a5b4fc" fontSize="8" fontFamily="monospace">PTCA-Ψ</text>
            <text x={CX} y={CY + 5} textAnchor="middle" fill="#818cf8" fontSize="10" fontFamily="monospace" fontWeight="bold">
              {overallEnergy.toFixed(3)}
            </text>
            <text x={CX} y={CY + 16} textAnchor="middle" fill="#6366f1" fontSize="7" fontFamily="monospace">{dims.length}D</text>

            {/* Group arcs and tab nodes */}
            {TAB_GROUPS.map((group, gi) => {
              const gc = GROUP_COLORS[gi] || GROUP_COLORS[0];
              const energy = groupEnergy(gi);

              return group.tabs.map((tab, ti) => {
                const { x: nx, y: ny } = tabPosition(gi, ti, R);
                const px = CX + nx;
                const py = CY + ny;
                const isActive = activeTab === tab.id;
                const isHovered = hoveredTab === tab.id;
                const tabEnergy = Math.min(1, energy * 0.75 + (dims[(SENTINEL_GROUP_MAP[gi][0] ?? 0) + ti] ?? 0) * 0.25);
                const nodeRadius = NODE_R + tabEnergy * 2;
                const opacity = 0.4 + tabEnergy * 0.6;

                return (
                  <g key={tab.id}>
                    {/* Spoke line from center */}
                    <line
                      x1={CX + (nx * INNER_R) / R}
                      y1={CY + (ny * INNER_R) / R}
                      x2={px - (nx / R) * nodeRadius}
                      y2={py - (ny / R) * nodeRadius}
                      stroke={gc.fill}
                      strokeOpacity={0.12 + tabEnergy * 0.15}
                      strokeWidth="0.5"
                    />

                    {/* Active/hover glow ring */}
                    {(isActive || isHovered) && (
                      <circle
                        cx={px}
                        cy={py}
                        r={nodeRadius + 4}
                        fill="none"
                        stroke={isActive ? "#ffffff" : gc.fill}
                        strokeOpacity={isActive ? 0.7 : 0.5}
                        strokeWidth={isActive ? 1.5 : 1}
                        filter="url(#glow)"
                      />
                    )}

                    {/* Main node */}
                    <circle
                      cx={px}
                      cy={py}
                      r={nodeRadius}
                      fill={`url(#grd-${gi})`}
                      fillOpacity={opacity}
                      stroke={isActive ? "#ffffff" : gc.stroke}
                      strokeWidth={isActive ? 1.5 : 0.8}
                      strokeOpacity={isActive ? 1 : 0.6}
                      filter={tabEnergy > 0.7 ? "url(#glow)" : undefined}
                      style={{ cursor: "pointer", transition: "all 0.15s ease" }}
                      onClick={() => onNavigate?.(tab.id)}
                      onMouseEnter={() => setHoveredTab(tab.id)}
                      onMouseLeave={() => setHoveredTab(null)}
                      data-testid={`tensor-node-${tab.id}`}
                    />

                    {/* Energy dot in center of node */}
                    <circle
                      cx={px}
                      cy={py}
                      r={2}
                      fill="#ffffff"
                      fillOpacity={0.3 + tabEnergy * 0.5}
                      style={{ pointerEvents: "none" }}
                    />

                    {/* Label (visible on hover or if active) */}
                    {(isActive || isHovered) && (
                      <text
                        x={px + (nx / R) * (nodeRadius + 10)}
                        y={py + (ny / R) * (nodeRadius + 10)}
                        textAnchor={nx > 10 ? "start" : nx < -10 ? "end" : "middle"}
                        dominantBaseline={ny > 10 ? "auto" : ny < -10 ? "hanging" : "middle"}
                        fill="#e2e8f0"
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

            {/* Group labels around the ring */}
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
                <text
                  key={group.id}
                  x={lx}
                  y={ly}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={gc.fill}
                  fontSize="6.5"
                  fontFamily="monospace"
                  fontWeight="bold"
                  fillOpacity="0.8"
                >
                  {group.label.toUpperCase()}
                </text>
              );
            })}
          </svg>
        )}

        {/* Group legend */}
        <div className="flex flex-wrap justify-center gap-2 mt-1">
          {GROUP_COLORS.map((c, i) => (
            <div key={i} className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: c.fill }} />
              <span className="text-xs text-muted-foreground">{TAB_GROUPS[i]?.label}</span>
            </div>
          ))}
        </div>
      </div>

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
                <Button
                  size="sm" variant="ghost" className="h-5 text-xs px-1.5"
                  onClick={() => setEditingThreshold(isEditingThr ? null : idx)}
                  data-testid={`button-edit-threshold-psi${idx}`}
                >
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
    </div>
  );
}
