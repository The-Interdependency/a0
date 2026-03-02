import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Activity, AlertTriangle, Brain, ChevronDown, ChevronRight, DollarSign, FileText, Filter,
  Heart, Key, OctagonX, Play, RefreshCw, ScrollText, Shield, Zap, Check, X,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

const TABS = [
  { id: "workflow", label: "Workflow", icon: Activity },
  { id: "metrics", label: "Metrics", icon: DollarSign },
  { id: "edcm", label: "EDCM", icon: Brain },
  { id: "logs", label: "Logs", icon: ScrollText },
  { id: "context", label: "Context", icon: FileText },
] as const;

type TabId = typeof TABS[number]["id"];

export default function ConsolePage() {
  const [activeTab, setActiveTab] = useState<TabId>("workflow");

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card flex-shrink-0">
        <Shield className="w-4 h-4 text-primary flex-shrink-0" />
        <span className="font-semibold text-sm flex-1">a0p Console</span>
      </header>

      <div className="flex border-b border-border bg-card overflow-x-auto flex-shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors",
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground"
            )}
            data-testid={`tab-${tab.id}`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-hidden">
        {activeTab === "workflow" && <WorkflowTab />}
        {activeTab === "metrics" && <MetricsTab />}
        {activeTab === "edcm" && <EdcmTab />}
        {activeTab === "logs" && <LogsTab />}
        {activeTab === "context" && <ContextTab />}
      </div>
    </div>
  );
}

function WorkflowTab() {
  const { toast } = useToast();
  const [stopDialogOpen, setStopDialogOpen] = useState(false);

  const { data: status, isLoading } = useQuery<{
    isRunning: boolean;
    emergencyStop: boolean;
    uptime: number;
  }>({
    queryKey: ["/api/a0p/status"],
    refetchInterval: 5000,
  });

  const { data: heartbeats = [] } = useQuery<any[]>({
    queryKey: ["/api/a0p/heartbeat"],
    refetchInterval: 30000,
  });

  const { data: chainStatus } = useQuery<{
    valid: boolean;
    length: number;
    errors: string[];
  }>({
    queryKey: ["/api/a0p/chain/verify"],
    refetchInterval: 60000,
  });

  const stopMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/a0p/emergency-stop"),
    onSuccess: () => {
      toast({ title: "Engine stopped" });
      setStopDialogOpen(false);
    },
  });

  const resumeMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/a0p/resume"),
    onSuccess: () => toast({ title: "Engine resumed" }),
  });

  function handleStopKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      stopMutation.mutate();
    }
  }

  const uptimeStr = status?.uptime
    ? `${Math.floor(status.uptime / 3600)}h ${Math.floor((status.uptime % 3600) / 60)}m`
    : "--";

  return (
    <ScrollArea className="h-full px-3 py-3">
      <div className="space-y-4 pb-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">Engine Status</h3>
            <Badge
              variant={status?.isRunning ? "default" : "destructive"}
              data-testid="status-engine"
            >
              {status?.emergencyStop ? "STOPPED" : status?.isRunning ? "RUNNING" : "OFFLINE"}
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-muted-foreground">Uptime</span>
              <p className="font-mono" data-testid="text-uptime">{uptimeStr}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Heartbeat</span>
              <p className="font-mono">1h interval</p>
            </div>
            <div>
              <span className="text-muted-foreground">Hash Chain</span>
              <p className={cn("font-mono", chainStatus?.valid ? "text-green-400" : "text-red-400")} data-testid="text-chain-status">
                {chainStatus ? `${chainStatus.valid ? "VALID" : "BROKEN"} (${chainStatus.length} events)` : "..."}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Sentinels</span>
              <p className="font-mono">9/9 active</p>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          {status?.isRunning ? (
            <Button
              variant="destructive"
              className="flex-1 gap-2"
              onClick={() => setStopDialogOpen(true)}
              data-testid="button-emergency-stop"
            >
              <OctagonX className="w-4 h-4" />
              Emergency Stop
            </Button>
          ) : (
            <Button
              className="flex-1 gap-2"
              onClick={() => resumeMutation.mutate()}
              disabled={resumeMutation.isPending}
              data-testid="button-resume"
            >
              <Play className="w-4 h-4" />
              Resume Engine
            </Button>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <Heart className="w-4 h-4 text-red-400" />
            Heartbeat Log
          </h3>
          <div className="space-y-2">
            {heartbeats.length === 0 ? (
              <p className="text-xs text-muted-foreground">No heartbeats yet. First one fires 5s after startup, then hourly.</p>
            ) : (
              heartbeats.slice(0, 10).map((hb: any) => (
                <div key={hb.id} className="flex items-center gap-2 text-xs">
                  <span className={cn("w-2 h-2 rounded-full", hb.status === "OK" ? "bg-green-400" : "bg-red-400")} />
                  <span className="font-mono flex-1">{hb.status}</span>
                  <span className="text-muted-foreground">
                    {new Date(hb.createdAt).toLocaleTimeString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <Dialog open={stopDialogOpen} onOpenChange={setStopDialogOpen}>
        <DialogContent className="w-[90vw] max-w-sm" onKeyDown={handleStopKeyDown}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Emergency Stop
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will immediately halt the a0p engine, stop the heartbeat, and prevent all operations.
            Are you sure?
          </p>
          <p className="text-xs text-muted-foreground mt-1">Press Enter to confirm.</p>
          <DialogFooter className="gap-2">
            <Button variant="secondary" onClick={() => setStopDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => stopMutation.mutate()}
              disabled={stopMutation.isPending}
              data-testid="button-confirm-stop"
            >
              <OctagonX className="w-4 h-4 mr-1" />
              Stop Engine
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScrollArea>
  );
}

function MetricsTab() {
  const [costLimit, setCostLimit] = useState([50]);
  const [limitsEnabled, setLimitsEnabled] = useState(false);

  const { data: summary, isLoading } = useQuery<{
    totalCost: number;
    totalPromptTokens: number;
    totalCompletionTokens: number;
    byModel: Record<string, { cost: number; promptTokens: number; completionTokens: number }>;
  }>({
    queryKey: ["/api/metrics/costs"],
    refetchInterval: 15000,
  });

  if (isLoading) return <div className="p-4"><Skeleton className="h-40 w-full" /></div>;

  const totalTokens = (summary?.totalPromptTokens || 0) + (summary?.totalCompletionTokens || 0);

  return (
    <ScrollArea className="h-full px-3 py-3">
      <div className="space-y-4 pb-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold text-sm mb-3">Token Usage</h3>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-2xl font-bold font-mono" data-testid="text-total-tokens">
                {totalTokens.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">Total Tokens</p>
            </div>
            <div>
              <p className="text-2xl font-bold font-mono text-blue-400">
                {(summary?.totalPromptTokens || 0).toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">Prompt</p>
            </div>
            <div>
              <p className="text-2xl font-bold font-mono text-emerald-400">
                {(summary?.totalCompletionTokens || 0).toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">Completion</p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold text-sm mb-3">Cost Estimate</h3>
          <p className="text-3xl font-bold font-mono" data-testid="text-total-cost">
            ${(summary?.totalCost || 0).toFixed(4)}
          </p>
          <div className="mt-3 space-y-2">
            {summary?.byModel && Object.entries(summary.byModel).map(([model, data]) => (
              <div key={model} className="flex items-center justify-between text-xs">
                <Badge variant="secondary">{model}</Badge>
                <span className="font-mono">${data.cost.toFixed(4)} ({(data.promptTokens + data.completionTokens).toLocaleString()} tok)</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">Spend Limits</h3>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Enabled</span>
              <Switch
                checked={limitsEnabled}
                onCheckedChange={setLimitsEnabled}
                data-testid="toggle-limits"
              />
            </div>
          </div>
          <div className={cn(!limitsEnabled && "opacity-40 pointer-events-none")}>
            <div className="flex items-center justify-between text-xs mb-2">
              <span>Monthly limit</span>
              <span className="font-mono font-bold">${costLimit[0]}</span>
            </div>
            <Slider
              value={costLimit}
              onValueChange={setCostLimit}
              min={1}
              max={200}
              step={1}
              data-testid="slider-cost-limit"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span>$1</span>
              <span>$200</span>
            </div>
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}

const METRIC_LABELS: Record<string, { label: string; desc: string }> = {
  CM: { label: "Constraint Mismatch", desc: "1 - Jaccard(C_declared, C_observed)" },
  DA: { label: "Dissonance Accum.", desc: "sigmoid(w·contradictions + retractions + repeats)" },
  DRIFT: { label: "Drift", desc: "1 - cosine_similarity(x_t, goal)" },
  DVG: { label: "Divergence", desc: "entropy(topic_distribution) normalized" },
  INT: { label: "Intensity", desc: "clamp01(caps + punct + lex + tempo)" },
  TBF: { label: "Turn-Balance", desc: "Gini coefficient on actor token shares" },
};

const ALERT_NAMES: Record<string, string> = {
  CM: "ALERT_CM_HIGH",
  DA: "ALERT_DA_RISING",
  DVG: "ALERT_DVG_SPLIT",
  INT: "ALERT_INT_SPIKE",
  TBF: "ALERT_TBF_SKEW",
  DRIFT: "ALERT_DRIFT_AWAY",
};

function alertColor(value: number): { bg: string; text: string; label: string } {
  if (value >= 0.80) return { bg: "bg-red-500/20", text: "text-red-400", label: "HIGH" };
  if (value <= 0.20) return { bg: "bg-green-500/20", text: "text-green-400", label: "LOW" };
  return { bg: "bg-amber-500/20", text: "text-amber-400", label: "HYSTERESIS" };
}

function MetricRow({ metricKey, value, evidence }: { metricKey: string; value: number; evidence: string[] }) {
  const info = METRIC_LABELS[metricKey] || { label: metricKey, desc: "" };
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
          <span className="font-mono text-xs font-bold" data-testid={`text-metric-value-${metricKey}`}>
            {value.toFixed(3)}
          </span>
          <Badge
            variant="secondary"
            className={cn("text-[9px] font-mono", alert.bg, alert.text)}
            data-testid={`badge-alert-${metricKey}`}
          >
            {alert.label}
          </Badge>
        </div>
      </div>
      <div className="w-full h-1.5 bg-background rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", value >= 0.80 ? "bg-red-500" : value <= 0.20 ? "bg-green-500" : "bg-amber-500")}
          style={{ width: `${pct}%` }}
        />
      </div>
      {evidence.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {evidence.map((e, i) => (
            <span key={i} className="text-[9px] font-mono text-muted-foreground">{e}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function EdcmTab() {
  const { data: snapshots = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/edcm/snapshots"],
    refetchInterval: 10000,
  });

  const latest = snapshots[0];
  const ptca = latest?.ptcaState as any;

  const { data: engineReport } = useQuery<any>({
    queryKey: ["/api/a0p/events"],
    refetchInterval: 10000,
    select: (data: any[]) => {
      if (!data || data.length === 0) return null;
      const last = data[0];
      return last?.payload;
    },
  });

  const reportMetrics = engineReport?.edcmMetrics;
  const reportAlerts = engineReport?.alerts;
  const liveSentinelCtx = engineReport?.sentinelContext || engineReport?.sentinel_context;

  return (
    <ScrollArea className="h-full px-3 py-3">
      <div className="space-y-4 pb-4">

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Brain className="w-4 h-4 text-purple-400" />
              EDCM Metric Families
            </h3>
            <Badge variant="secondary" className="text-[9px] font-mono" data-testid="badge-build-version">
              {`v1.0.2-S9`}
            </Badge>
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
                  return (
                    <MetricRow
                      key={key}
                      metricKey={key}
                      value={typeof metricVal === "number" ? metricVal : 0}
                      evidence={[]}
                    />
                  );
                })
              ) : (
                Object.entries(METRIC_LABELS).map(([key]) => (
                  <MetricRow key={key} metricKey={key} value={0} evidence={[]} />
                ))
              )}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            80/20 Alert Status
          </h3>
          <div className="text-[10px] text-muted-foreground mb-3">
            TRIGGER (HIGH) at ≥0.80 | CLEAR (LOW) at ≤0.20 | Hysteresis band (0.20, 0.80)
          </div>
          <div className="space-y-1.5">
            {Object.entries(ALERT_NAMES).map(([metric, alertName]) => {
              const val = reportMetrics ? (typeof reportMetrics[metric] === "object" ? (reportMetrics[metric] as any).value : reportMetrics[metric]) : null;
              const numVal = typeof val === "number" ? val : 0;
              const alert = alertColor(val != null ? numVal : 0.5);
              return (
                <div key={metric} className="flex items-center justify-between gap-2 text-xs" data-testid={`alert-row-${metric}`}>
                  <div className="flex items-center gap-2">
                    <span className={cn("w-2 h-2 rounded-full flex-shrink-0",
                      val == null ? "bg-muted-foreground" : numVal >= 0.80 ? "bg-red-500" : numVal <= 0.20 ? "bg-green-500" : "bg-amber-500"
                    )} />
                    <span className="font-mono text-[10px]">{alertName}</span>
                  </div>
                  <span className={cn("font-mono text-[10px]", val != null ? alert.text : "text-muted-foreground")}>
                    {val != null ? `${numVal.toFixed(3)} → ${alert.label}` : "no data"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {latest && (
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <Brain className="w-4 h-4 text-purple-400" />
              Disposition & Operators
            </h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-muted-foreground">Decision</span>
                  <p className="font-mono font-bold" data-testid="text-edcm-decision">
                    {latest.decision}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">BONE Delta</span>
                  <p className="font-mono" data-testid="text-bone-delta">
                    {latest.deltaBone?.toFixed(4)}
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <h4 className="text-xs font-medium text-muted-foreground">Grok Operator Vector</h4>
                <OperatorBar vec={latest.operatorGrok} color="emerald" />
                <h4 className="text-xs font-medium text-muted-foreground">Gemini Operator Vector</h4>
                <OperatorBar vec={latest.operatorGemini} color="blue" />
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="text-center p-2 rounded bg-background">
                  <p className="text-muted-foreground">Grok Align</p>
                  <p className={cn("font-mono font-bold", (latest.deltaAlignGrok || 0) > 0.25 ? "text-red-400" : "text-green-400")}>
                    {latest.deltaAlignGrok?.toFixed(4)}
                  </p>
                </div>
                <div className="text-center p-2 rounded bg-background">
                  <p className="text-muted-foreground">Gemini Align</p>
                  <p className={cn("font-mono font-bold", (latest.deltaAlignGemini || 0) > 0.25 ? "text-red-400" : "text-green-400")}>
                    {latest.deltaAlignGemini?.toFixed(4)}
                  </p>
                </div>
                <div className="text-center p-2 rounded bg-background">
                  <p className="text-muted-foreground">PTCA Energy</p>
                  <p className="font-mono font-bold" data-testid="text-ptca-energy">
                    {ptca?.energy?.toFixed(4) || "--"}
                  </p>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                <p>Thresholds: Merge ≤0.18 | Softfork ≤0.30 | Fork &gt;0.30</p>
                <p>Align Risk: &gt;0.25 | PCNA: 53-node circular | PTCA: Euler dt=0.01</p>
              </div>
            </div>
          </div>
        )}

        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <Zap className="w-4 h-4 text-yellow-400" />
            PTCA Tensor
          </h3>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-muted-foreground">Axes</span>
              <p className="font-mono" data-testid="text-ptca-axes">53 × 9 × 8 × 7</p>
            </div>
            <div>
              <span className="text-muted-foreground">Geometry</span>
              <p className="font-mono">Heptagram 6+1</p>
            </div>
            <div>
              <span className="text-muted-foreground">prime_node</span>
              <p className="font-mono text-[10px]">53 seeds (first 53 primes)</p>
            </div>
            <div>
              <span className="text-muted-foreground">sentinel</span>
              <p className="font-mono text-[10px]">9 channels (S1-S9)</p>
            </div>
            <div>
              <span className="text-muted-foreground">phase</span>
              <p className="font-mono text-[10px]">8 (reserved v2 inter-group)</p>
            </div>
            <div>
              <span className="text-muted-foreground">hept</span>
              <p className="font-mono text-[10px]">7 (6 ring + 1 Z hub)</p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            <div className="text-center p-2 rounded bg-background">
              <p className="text-muted-foreground">α (alpha)</p>
              <p className="font-mono font-bold">0.10</p>
            </div>
            <div className="text-center p-2 rounded bg-background">
              <p className="text-muted-foreground">β (beta)</p>
              <p className="font-mono font-bold">0.20</p>
            </div>
            <div className="text-center p-2 rounded bg-background">
              <p className="text-muted-foreground">γ (gamma)</p>
              <p className="font-mono font-bold">0.10</p>
            </div>
          </div>
          {ptca && (
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="text-center p-2 rounded bg-background">
                <p className="text-muted-foreground">Heptagram Energy</p>
                <p className="font-mono font-bold" data-testid="text-heptagram-energy">
                  {ptca.heptagramEnergy?.toFixed(4) || "--"}
                </p>
              </div>
              <div className="text-center p-2 rounded bg-background">
                <p className="text-muted-foreground">Total Energy</p>
                <p className="font-mono font-bold" data-testid="text-total-energy">
                  {ptca.energy?.toFixed(4) || "--"}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-400" />
            Sentinel Context
          </h3>
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">S5 Window</span>
              <span className="font-mono" data-testid="text-s5-window">
                {liveSentinelCtx?.S5_context ? `${liveSentinelCtx.S5_context.window?.type || "turns"} / W=${liveSentinelCtx.S5_context.window?.W || 32}` : "turns / W=32"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">S5 Retrieval</span>
              <span className="font-mono">{liveSentinelCtx?.S5_context?.retrieval_mode || "none"}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">S5 Hygiene</span>
              <span className="font-mono">strip_secrets=true, redact_keys=true</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">S6 Identity</span>
              <span className="font-mono">
                {liveSentinelCtx?.S6_identity ? `actor_map ${liveSentinelCtx.S6_identity.actor_map_version} (conf: ${liveSentinelCtx.S6_identity.confidence})` : "actor_map v1 (conf: 0.98)"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">S7 Memory</span>
              <span className="font-mono">
                {liveSentinelCtx?.S7_memory ? `store=${liveSentinelCtx.S7_memory.store_allowed}, retention=${liveSentinelCtx.S7_memory.retention}` : "store=false, retention=session"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">S8 Risk</span>
              <span className="font-mono" data-testid="text-s8-risk">
                {liveSentinelCtx?.S8_risk ? `score=${liveSentinelCtx.S8_risk.score}, flags=[${(liveSentinelCtx.S8_risk.flags || []).join(",")}]` : "score=0.12, flags=[]"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">S9 Audit</span>
              <span className="font-mono">
                {liveSentinelCtx?.S9_audit ? `${liveSentinelCtx.S9_audit.evidence_events?.length || 0} events logged` : "evidence logged"}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4 text-green-400" />
            EDCMBONE Report
          </h3>
          <div className="text-[10px] text-muted-foreground mb-2">
            Minimal canonical skeleton for EDCM evaluation + reporting (v1.0.2-S9 frozen format)
          </div>
          <div className="bg-background rounded p-3 font-mono text-[9px] text-muted-foreground whitespace-pre-wrap max-h-48 overflow-auto" data-testid="text-edcmbone-report">
{(() => {
  const mv = (key: string) => {
    const m = reportMetrics?.[key];
    if (m == null) return "0.000";
    return (typeof m === "object" ? (m as any).value : m).toFixed(3);
  };
  return `{
  "edcmbone": {
    "thread_id": "${latest?.taskId || "thr_..."}",
    "used_context": {
      "window": {"type":"turns","W":32},
      "retrieval": {"mode":"none","sources":[],"top_k":0},
      "hygiene": {"strip_secrets":true,"redact_keys":true}
    },
    "metrics": {
      "CM":    {"value": ${mv("CM")}},
      "DA":    {"value": ${mv("DA")}},
      "DRIFT": {"value": ${mv("DRIFT")}},
      "DVG":   {"value": ${mv("DVG")}},
      "INT":   {"value": ${mv("INT")}},
      "TBF":   {"value": ${mv("TBF")}}
    },
    "alerts": [],
    "recommendations": [],
    "snapshot_id": "snap_...",
    "provenance": {"build":"v1.0.2-S9"}
  }
}`;
})()}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold text-sm mb-3">EDCM History</h3>
          <div className="space-y-2">
            {isLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : snapshots.length === 0 ? (
              <p className="text-xs text-muted-foreground">No history</p>
            ) : (
              snapshots.slice(0, 15).map((s: any) => (
                <div key={s.id} className="flex items-center justify-between text-xs border-b border-border pb-1 last:border-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-[10px]">
                      {s.decision}
                    </Badge>
                    <span className="font-mono">d={s.deltaBone?.toFixed(3)}</span>
                  </div>
                  <span className="text-muted-foreground text-[10px]">
                    {new Date(s.createdAt).toLocaleTimeString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}

function OperatorBar({ vec, color }: { vec: any; color: string }) {
  if (!vec) return null;
  const classes = ["P", "K", "Q", "T", "S"] as const;
  const colorMap: Record<string, string> = {
    emerald: "bg-emerald-500",
    blue: "bg-blue-500",
    purple: "bg-purple-500",
  };
  return (
    <div className="flex gap-1 items-end h-8">
      {classes.map((c) => {
        const val = Math.abs(vec[c] || 0);
        const pct = Math.max(val * 100, 2);
        return (
          <div key={c} className="flex-1 flex flex-col items-center gap-0.5">
            <div
              className={cn("w-full rounded-t", colorMap[color] || "bg-primary")}
              style={{ height: `${pct}%` }}
            />
            <span className="text-[9px] text-muted-foreground">{c}</span>
          </div>
        );
      })}
    </div>
  );
}

const AI_PROVIDERS = [
  { id: "openai", label: "OpenAI", placeholder: "sk-..." },
  { id: "anthropic", label: "Anthropic", placeholder: "sk-ant-..." },
  { id: "mistral", label: "Mistral", placeholder: "..." },
  { id: "cohere", label: "Cohere", placeholder: "..." },
  { id: "perplexity", label: "Perplexity", placeholder: "pplx-..." },
] as const;

function ContextTab() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: serverCtx } = useQuery<{ systemPrompt: string; contextPrefix: string }>({
    queryKey: ["/api/context"],
  });

  const { data: savedKeys = {} } = useQuery<Record<string, string>>({
    queryKey: ["/api/keys"],
  });

  const [systemPrompt, setSystemPrompt] = useState("");
  const [contextPrefix, setContextPrefix] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    if (serverCtx && !loaded) {
      setSystemPrompt(serverCtx.systemPrompt);
      setContextPrefix(serverCtx.contextPrefix);
      setLoaded(true);
    }
  }, [serverCtx, loaded]);

  const saveMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/context", { systemPrompt, contextPrefix }),
    onSuccess: () => toast({ title: "Context saved and active" }),
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const saveKeyMutation = useMutation({
    mutationFn: async ({ provider, key }: { provider: string; key: string }) => {
      await apiRequest("POST", "/api/keys", { provider, key });
    },
    onSuccess: (_, { provider, key }) => {
      qc.invalidateQueries({ queryKey: ["/api/keys"] });
      setKeyInputs((prev) => ({ ...prev, [provider]: "" }));
      toast({ title: key ? `${provider} key saved` : `${provider} key removed` });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <ScrollArea className="h-full px-3 py-3">
      <div className="space-y-4 pb-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold text-sm mb-2">System Prompt</h3>
          <p className="text-[10px] text-muted-foreground mb-2">Editable. This is prepended to every AI request.</p>
          <Textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            className="min-h-[120px] font-mono text-xs resize-none"
            data-testid="textarea-system-prompt"
          />
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold text-sm mb-2">Context Prefix</h3>
          <p className="text-[10px] text-muted-foreground mb-2">Additional context injected with each prompt.</p>
          <Textarea
            value={contextPrefix}
            onChange={(e) => setContextPrefix(e.target.value)}
            className="min-h-[100px] font-mono text-xs resize-none"
            data-testid="textarea-context-prefix"
          />
        </div>

        <Button
          className="w-full"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          data-testid="button-save-context"
        >
          <Check className="w-4 h-4 mr-1" />
          {saveMutation.isPending ? "Saving..." : "Save Context"}
        </Button>

        <div className="rounded-lg border border-primary/20 bg-card p-4">
          <h3 className="font-semibold text-sm mb-1 flex items-center gap-2">
            <Key className="w-4 h-4 text-primary" />
            BYO API Keys
          </h3>
          <p className="text-[10px] text-muted-foreground mb-3">
            Bring your own keys for additional AI providers. Gemini and Grok are built-in.
          </p>
          <div className="space-y-3">
            {AI_PROVIDERS.map((p) => {
              const existing = savedKeys[p.id];
              return (
                <div key={p.id} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">{p.label}</span>
                    {existing && (
                      <div className="flex items-center gap-1">
                        <Badge variant="secondary" className="text-[9px] font-mono">{existing}</Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0"
                          onClick={() => saveKeyMutation.mutate({ provider: p.id, key: "" })}
                          data-testid={`button-remove-key-${p.id}`}
                        >
                          <X className="w-3 h-3 text-destructive" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      type="password"
                      placeholder={p.placeholder}
                      value={keyInputs[p.id] || ""}
                      onChange={(e) => setKeyInputs((prev) => ({ ...prev, [p.id]: e.target.value }))}
                      className="h-8 text-xs font-mono"
                      data-testid={`input-key-${p.id}`}
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-8 px-3"
                      disabled={!keyInputs[p.id]?.trim() || saveKeyMutation.isPending}
                      onClick={() => saveKeyMutation.mutate({ provider: p.id, key: keyInputs[p.id]!.trim() })}
                      data-testid={`button-save-key-${p.id}`}
                    >
                      Save
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 rounded bg-background p-2">
            <p className="text-[9px] text-muted-foreground">
              Built-in: Gemini 2.5 Flash, Grok-3 Mini. BYO keys enable future model routing.
              Keys are stored server-side per session — never sent to third parties until you select a model.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold text-sm mb-2">Full Prompt Preview</h3>
          <div className="bg-background rounded p-3 font-mono text-[10px] text-muted-foreground whitespace-pre-wrap max-h-48 overflow-auto" data-testid="text-prompt-preview">
            [SYSTEM]{"\n"}{systemPrompt}{"\n\n"}[CONTEXT]{"\n"}{contextPrefix}{"\n\n"}[USER MESSAGE]{"\n"}{"<user input here>"}
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}

type LogSource = "all" | "events" | "heartbeat" | "edcm" | "commands" | "costs";

const LOG_SOURCES: { id: LogSource; label: string; color: string }[] = [
  { id: "all", label: "All", color: "text-foreground" },
  { id: "events", label: "Events", color: "text-blue-400" },
  { id: "heartbeat", label: "Heartbeat", color: "text-red-400" },
  { id: "edcm", label: "EDCM", color: "text-purple-400" },
  { id: "commands", label: "Commands", color: "text-emerald-400" },
  { id: "costs", label: "Costs", color: "text-amber-400" },
];

interface UnifiedLogEntry {
  id: string;
  source: LogSource;
  ts: Date;
  summary: string;
  status?: string;
  detail: any;
}

function LogsTab() {
  const [filter, setFilter] = useState<LogSource>("all");
  const [search, setSearch] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  const { data: events = [] } = useQuery<any[]>({
    queryKey: ["/api/a0p/events"],
    refetchInterval: 10000,
  });

  const { data: heartbeats = [] } = useQuery<any[]>({
    queryKey: ["/api/a0p/heartbeat"],
    refetchInterval: 15000,
  });

  const { data: snapshots = [] } = useQuery<any[]>({
    queryKey: ["/api/edcm/snapshots"],
    refetchInterval: 10000,
  });

  const { data: commands = [] } = useQuery<any[]>({
    queryKey: ["/api/terminal/history"],
    refetchInterval: 10000,
  });

  const { data: costHistory = [] } = useQuery<any[]>({
    queryKey: ["/api/metrics/costs/history"],
    refetchInterval: 15000,
  });

  const unified: UnifiedLogEntry[] = [];

  for (const ev of events) {
    const p = ev.payload || {};
    const metrics = p.edcmMetrics;
    const metricsStr = metrics ? ` CM=${metrics.CM?.toFixed?.(2) || metrics.CM} DA=${metrics.DA?.toFixed?.(2) || metrics.DA}` : "";
    unified.push({
      id: `evt-${ev.id}`,
      source: "events",
      ts: new Date(ev.createdAt),
      summary: `[${p.action || ev.eventType || "event"}] ${p.taskId || ev.taskId || ""}${metricsStr}`,
      status: p.edcm?.decision,
      detail: ev,
    });
  }

  for (const hb of heartbeats) {
    const d = hb.details || {};
    unified.push({
      id: `hb-${hb.id}`,
      source: "heartbeat",
      ts: new Date(hb.createdAt),
      summary: `${hb.status} — chain: ${hb.hashChainValid ? "valid" : "BROKEN"}, events: ${d.chainLength || 0}`,
      status: hb.status,
      detail: hb,
    });
  }

  for (const snap of snapshots) {
    unified.push({
      id: `edcm-${snap.id}`,
      source: "edcm",
      ts: new Date(snap.createdAt),
      summary: `${snap.decision} — delta=${snap.deltaBone?.toFixed(4)} task=${snap.taskId}`,
      status: snap.decision,
      detail: snap,
    });
  }

  for (const cmd of commands) {
    unified.push({
      id: `cmd-${cmd.id}`,
      source: "commands",
      ts: new Date(cmd.createdAt),
      summary: `$ ${cmd.command}${cmd.exitCode != null ? ` (exit ${cmd.exitCode})` : ""}`,
      status: cmd.exitCode === 0 ? "OK" : cmd.exitCode != null ? "ERROR" : undefined,
      detail: cmd,
    });
  }

  for (const cost of costHistory) {
    unified.push({
      id: `cost-${cost.id}`,
      source: "costs",
      ts: new Date(cost.createdAt),
      summary: `${cost.model} — $${cost.estimatedCost?.toFixed(4)} (${(cost.promptTokens + cost.completionTokens).toLocaleString()} tok)`,
      detail: cost,
    });
  }

  unified.sort((a, b) => b.ts.getTime() - a.ts.getTime());

  const filtered = unified.filter((entry) => {
    if (filter !== "all" && entry.source !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return entry.summary.toLowerCase().includes(q) || JSON.stringify(entry.detail).toLowerCase().includes(q);
    }
    return true;
  });

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/a0p/events"] });
    queryClient.invalidateQueries({ queryKey: ["/api/a0p/heartbeat"] });
    queryClient.invalidateQueries({ queryKey: ["/api/edcm/snapshots"] });
    queryClient.invalidateQueries({ queryKey: ["/api/terminal/history"] });
    queryClient.invalidateQueries({ queryKey: ["/api/metrics/costs/history"] });
  };

  const sourceColor = (s: LogSource) => LOG_SOURCES.find((l) => l.id === s)?.color || "text-foreground";
  const statusBadge = (status?: string) => {
    if (!status) return null;
    const isOk = status === "OK" || status === "MERGE";
    const isWarn = status.includes("SOFTFORK") || status === "HYSTERESIS";
    const isErr = status.includes("ERROR") || status.includes("FORK") || status.includes("BROKEN");
    return (
      <Badge
        variant="secondary"
        className={cn(
          "text-[9px] font-mono",
          isOk && "bg-green-500/20 text-green-400",
          isWarn && "bg-amber-500/20 text-amber-400",
          isErr && "bg-red-500/20 text-red-400",
          !isOk && !isWarn && !isErr && "bg-muted text-muted-foreground"
        )}
        data-testid={`badge-log-status`}
      >
        {status}
      </Badge>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 px-3 py-2 space-y-2 border-b border-border bg-card">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Filter className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Search logs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-xs pl-8 font-mono"
              data-testid="input-log-search"
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={refreshAll}
            data-testid="button-refresh-logs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>

        <div className="flex gap-1 overflow-x-auto">
          {LOG_SOURCES.map((src) => (
            <button
              key={src.id}
              onClick={() => setFilter(src.id)}
              className={cn(
                "px-2 py-1 text-[10px] font-medium rounded-full whitespace-nowrap transition-colors",
                filter === src.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
              data-testid={`filter-${src.id}`}
            >
              {src.label}
              {src.id !== "all" && (
                <span className="ml-1 opacity-70">
                  {unified.filter((e) => e.source === src.id).length}
                </span>
              )}
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
              <p className="text-[10px] text-muted-foreground mb-2" data-testid="text-log-count">
                {filtered.length} entries{filter !== "all" ? ` (${filter})` : ""}{search ? ` matching "${search}"` : ""}
              </p>
              {filtered.map((entry) => {
                const isExpanded = expandedIds.has(entry.id);
                return (
                  <div key={entry.id} className="rounded border border-border bg-card overflow-hidden" data-testid={`log-entry-${entry.id}`}>
                    <button
                      className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-muted/30 transition-colors"
                      onClick={() => toggleExpand(entry.id)}
                      data-testid={`button-expand-${entry.id}`}
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-muted-foreground" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={cn("text-[10px] font-bold uppercase", sourceColor(entry.source))}>
                            {entry.source}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {entry.ts.toLocaleTimeString()}
                          </span>
                          {statusBadge(entry.status)}
                        </div>
                        <p className="text-xs font-mono truncate mt-0.5">{entry.summary}</p>
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="px-3 pb-3 border-t border-border">
                        <LogDetail entry={entry} />
                      </div>
                    )}
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

function LogDetail({ entry }: { entry: UnifiedLogEntry }) {
  const d = entry.detail;

  if (entry.source === "events") {
    const p = d.payload || {};
    return (
      <div className="space-y-2 pt-2">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-muted-foreground">Event ID</span>
            <p className="font-mono text-[10px]">{p.event_id || `#${d.id}`}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Thread</span>
            <p className="font-mono text-[10px]">{p.thread_id || p.taskId || "--"}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Actor</span>
            <p className="font-mono text-[10px]">{p.actor_id || "system"}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Action</span>
            <p className="font-mono text-[10px]">{p.action || d.eventType || "--"}</p>
          </div>
        </div>
        {p.edcm && (
          <div className="rounded bg-background p-2">
            <span className="text-[10px] text-muted-foreground font-medium">EDCM Disposition</span>
            <div className="grid grid-cols-3 gap-2 mt-1 text-[10px] font-mono">
              <div>decision: {p.edcm.decision}</div>
              <div>delta: {p.edcm.delta?.toFixed(4)}</div>
              <div>dom: {p.edcm.dominantOp}</div>
            </div>
          </div>
        )}
        {p.edcmMetrics && (
          <div className="rounded bg-background p-2">
            <span className="text-[10px] text-muted-foreground font-medium">EDCM Metrics</span>
            <div className="grid grid-cols-3 gap-1 mt-1 text-[10px] font-mono">
              {Object.entries(p.edcmMetrics).map(([k, v]) => (
                <div key={k} className={cn(
                  typeof v === "number" && v >= 0.80 ? "text-red-400" : typeof v === "number" && v <= 0.20 ? "text-green-400" : ""
                )}>
                  {k}: {typeof v === "number" ? v.toFixed(3) : String(v)}
                </div>
              ))}
            </div>
          </div>
        )}
        {p.sentinelContext && (
          <div className="rounded bg-background p-2">
            <span className="text-[10px] text-muted-foreground font-medium">Sentinel Context</span>
            <div className="text-[10px] font-mono mt-1 space-y-0.5">
              <div>S5: {p.sentinelContext.S5_context?.window?.type || "turns"}/W={p.sentinelContext.S5_context?.window?.W || 32}, retrieval={p.sentinelContext.S5_context?.retrieval_mode || "none"}</div>
              <div>S8 risk: {p.sentinelContext.S8_risk?.score}</div>
              <div>S9 audit: {p.sentinelContext.S9_audit?.evidence_events?.length || 0} events</div>
            </div>
          </div>
        )}
        {p.provenance && (
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span>Build: {p.provenance.build}</span>
            <span>Hash: {d.hash?.slice(0, 16)}...</span>
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
          <div>
            <span className="text-muted-foreground">Status</span>
            <p className={cn("font-mono", d.hashChainValid ? "text-green-400" : "text-red-400")}>{d.status}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Chain Valid</span>
            <p className="font-mono">{d.hashChainValid ? "YES" : "NO"}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Chain Length</span>
            <p className="font-mono">{det.chainLength || 0}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Build</span>
            <p className="font-mono">{det.build || "--"}</p>
          </div>
        </div>
        {det.errors?.length > 0 && (
          <div className="rounded bg-red-500/10 p-2">
            <span className="text-[10px] text-red-400 font-medium">Errors</span>
            {det.errors.map((e: string, i: number) => (
              <p key={i} className="text-[10px] font-mono text-red-400 mt-1">{e}</p>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (entry.source === "edcm") {
    return (
      <div className="space-y-2 pt-2">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-muted-foreground">Decision</span>
            <p className="font-mono font-bold">{d.decision}</p>
          </div>
          <div>
            <span className="text-muted-foreground">BONE Delta</span>
            <p className="font-mono">{d.deltaBone?.toFixed(4)}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Grok Align</span>
            <p className={cn("font-mono", d.deltaAlignGrok > 0.25 ? "text-red-400" : "text-green-400")}>{d.deltaAlignGrok?.toFixed(4)}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Gemini Align</span>
            <p className={cn("font-mono", d.deltaAlignGemini > 0.25 ? "text-red-400" : "text-green-400")}>{d.deltaAlignGemini?.toFixed(4)}</p>
          </div>
        </div>
        {d.ptcaState && (
          <div className="rounded bg-background p-2">
            <span className="text-[10px] text-muted-foreground font-medium">PTCA State</span>
            <div className="grid grid-cols-2 gap-2 mt-1 text-[10px] font-mono">
              <div>Energy: {d.ptcaState.energy?.toFixed(4)}</div>
              <div>Hept: {d.ptcaState.heptagramEnergy?.toFixed(4) || "--"}</div>
              {d.ptcaState.coupling && (
                <div className="col-span-2">Coupling: α={d.ptcaState.coupling.alpha} β={d.ptcaState.coupling.beta} γ={d.ptcaState.coupling.gamma}</div>
              )}
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
        <div>
          <span className="text-[10px] text-muted-foreground font-medium">Command</span>
          <pre className="text-xs font-mono bg-background rounded p-2 mt-1">$ {d.command}</pre>
        </div>
        <div>
          <span className="text-[10px] text-muted-foreground font-medium">Output</span>
          <pre className="text-[10px] font-mono bg-background rounded p-2 mt-1 max-h-48 overflow-auto whitespace-pre-wrap">{d.output || "(no output)"}</pre>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="text-muted-foreground">Exit code: <span className={cn("font-mono", d.exitCode === 0 ? "text-green-400" : "text-red-400")}>{d.exitCode ?? "--"}</span></span>
        </div>
      </div>
    );
  }

  if (entry.source === "costs") {
    return (
      <div className="space-y-2 pt-2">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-muted-foreground">Model</span>
            <p className="font-mono">{d.model}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Est. Cost</span>
            <p className="font-mono">${d.estimatedCost?.toFixed(6)}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Prompt Tokens</span>
            <p className="font-mono">{d.promptTokens?.toLocaleString()}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Completion Tokens</span>
            <p className="font-mono">{d.completionTokens?.toLocaleString()}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-2">
      <pre className="text-[9px] font-mono text-muted-foreground whitespace-pre-wrap max-h-40 overflow-auto">{JSON.stringify(d, null, 2)}</pre>
    </div>
  );
}
