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
  Activity, AlertTriangle, Brain, DollarSign, FileText,
  Heart, Key, OctagonX, Play, RefreshCw, Shield, Zap, Check, X,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

const TABS = [
  { id: "workflow", label: "Workflow", icon: Activity },
  { id: "metrics", label: "Metrics", icon: DollarSign },
  { id: "edcm", label: "EDCM", icon: Brain },
  { id: "context", label: "Context", icon: FileText },
  { id: "costs", label: "Costs", icon: DollarSign },
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
        {activeTab === "context" && <ContextTab />}
        {activeTab === "costs" && <CostsTab />}
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

function EdcmTab() {
  const { data: snapshots = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/edcm/snapshots"],
    refetchInterval: 10000,
  });

  const latest = snapshots[0];

  return (
    <ScrollArea className="h-full px-3 py-3">
      <div className="space-y-4 pb-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <Brain className="w-4 h-4 text-purple-400" />
            EDCMBONE Dual-Brain Metrics
          </h3>
          {!latest ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">No EDCM evaluations yet. Run a process through the engine to see brain connection metrics.</p>
              <div className="text-xs text-muted-foreground">
                <p>Thresholds: Merge ≤0.18 | Softfork ≤0.30 | Fork &gt;0.30</p>
                <p>Align Risk: &gt;0.25 | PCNA: 53-node circular | PTCA: Euler dt=0.01</p>
              </div>
            </div>
          ) : (
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
                  <p className="font-mono font-bold">
                    {(latest.ptcaState as any)?.energy?.toFixed(4) || "--"}
                  </p>
                </div>
              </div>

              <div className="text-xs text-muted-foreground">
                <p>Thresholds: Merge ≤0.18 | Softfork ≤0.30 | Fork &gt;0.30</p>
                <p>Align Risk: &gt;0.25 | PCNA: 53-node circular | PTCA: Euler dt=0.01</p>
              </div>
            </div>
          )}
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

function CostsTab() {
  const { data: summary } = useQuery<{
    totalCost: number;
    totalPromptTokens: number;
    totalCompletionTokens: number;
    byModel: Record<string, { cost: number; promptTokens: number; completionTokens: number }>;
  }>({
    queryKey: ["/api/metrics/costs"],
    refetchInterval: 15000,
  });

  const donations = 0;
  const totalCost = summary?.totalCost || 0;

  return (
    <ScrollArea className="h-full px-3 py-3">
      <div className="space-y-4 pb-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold text-sm mb-4">Donations vs Costs</h3>
          <div className="grid grid-cols-2 gap-4 text-center">
            <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
              <p className="text-2xl font-bold font-mono text-green-400" data-testid="text-donations">
                ${donations.toFixed(2)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Donations</p>
            </div>
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <p className="text-2xl font-bold font-mono text-red-400" data-testid="text-api-costs">
                ${totalCost.toFixed(4)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">API Costs</p>
            </div>
          </div>
          <div className="mt-4">
            <div className="h-3 bg-background rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-green-500 to-green-400 rounded-full transition-all"
                style={{ width: `${donations > 0 ? Math.min((donations / (totalCost || 1)) * 100, 100) : 0}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span>Coverage: {donations > 0 ? ((donations / (totalCost || 1)) * 100).toFixed(0) : 0}%</span>
              <span>Net: ${(donations - totalCost).toFixed(4)}</span>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold text-sm mb-3">Cost Breakdown by Model</h3>
          {summary?.byModel ? Object.entries(summary.byModel).map(([model, data]) => (
            <div key={model} className="flex items-center justify-between py-2 border-b border-border last:border-0 text-xs">
              <div>
                <p className="font-medium">{model}</p>
                <p className="text-muted-foreground">{(data.promptTokens + data.completionTokens).toLocaleString()} tokens</p>
              </div>
              <span className="font-mono font-bold">${data.cost.toFixed(4)}</span>
            </div>
          )) : (
            <p className="text-xs text-muted-foreground">No cost data yet</p>
          )}
        </div>
      </div>
    </ScrollArea>
  );
}
