import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Activity, Brain, RefreshCw, Target, Zap } from "lucide-react";
import { slotColor, type SliderOrientationProps } from "@/lib/console-config";

export function BanditTab({ orientation, isVertical }: SliderOrientationProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: statsData, isLoading } = useQuery<any>({ queryKey: ["/api/v1/bandit/stats"], refetchInterval: 8000 });
  const stats: any[] = statsData?.arms || [];
  const banditEnabled: boolean = statsData?.enabled ?? true;
  const totalPulls: number = statsData?.totalPulls ?? 0;
  const banditConfig: any = statsData?.config ?? {};

  const { data: correlationsData } = useQuery<any>({ queryKey: ["/api/v1/bandit/correlations"], refetchInterval: 10000 });
  const correlations: any[] = Array.isArray(correlationsData) ? correlationsData : [];

  const { data: directiveConfig } = useQuery<any>({ queryKey: ["/api/v1/edcm/directives"], refetchInterval: 10000 });
  const { data: edcmHistory } = useQuery<{ snapshots: any[]; directiveHistory: any[] }>({ queryKey: ["/api/v1/edcm/history"], refetchInterval: 10000 });

  const toggleArmMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) => apiRequest("POST", `/api/bandit/toggle/${id}`, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/v1/bandit/stats"] }),
  });
  const resetDomainMutation = useMutation({
    mutationFn: (domain: string) => apiRequest("POST", `/api/bandit/reset/${domain}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/v1/bandit/stats"] }); toast({ title: "Domain reset" }); },
  });
  const seedMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/bandit/seed", {}),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/v1/bandit/stats"] }); toast({ title: "Arms seeded" }); },
  });
  const globalToggleMutation = useMutation({
    mutationFn: (enabled: boolean) => apiRequest("PATCH", "/api/toggles/bandit", { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/v1/bandit/stats"] }),
  });
  const updateToggleMutation = useMutation({
    mutationFn: ({ subsystem, enabled, parameters }: { subsystem: string; enabled?: boolean; parameters?: any }) =>
      apiRequest("PATCH", `/api/toggles/${subsystem}`, { enabled, parameters }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/edcm/directives"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/toggles"] });
    },
  });

  if (isLoading) return <div className="p-4"><Skeleton className="h-40 w-full" /></div>;

  const armsByDomain: Record<string, any[]> = {};
  for (const arm of stats) {
    if (!armsByDomain[arm.domain]) armsByDomain[arm.domain] = [];
    armsByDomain[arm.domain].push(arm);
  }
  const domains = Object.keys(armsByDomain);

  const DIRECTIVE_TYPES = [
    { type: "CONSTRAINT_REFOCUS", metric: "CM", description: "Refocuses when constraint metric exceeds threshold" },
    { type: "DISSONANCE_HALT", metric: "DA", description: "Halts when dissonance metric exceeds threshold" },
    { type: "DRIFT_ANCHOR", metric: "DRIFT", description: "Anchors when drift metric exceeds threshold" },
    { type: "DIVERGENCE_COMMIT", metric: "DVG", description: "Commits when divergence metric exceeds threshold" },
    { type: "INTENSITY_CALM", metric: "INT", description: "Calms when intensity metric exceeds threshold" },
    { type: "BALANCE_CONCISE", metric: "TBF", description: "Concise when balance metric exceeds threshold" },
  ];
  const directives = DIRECTIVE_TYPES.map(d => ({
    ...d,
    enabled: directiveConfig?.directiveToggles?.[d.type] !== false,
    threshold: directiveConfig?.thresholds?.[d.type] ?? 0.8,
    fired: false,
  }));
  const edcmSnapshots = edcmHistory?.snapshots || [];

  return (
    <ScrollArea className="h-full px-3 py-3">
      <div className="space-y-4 pb-4">
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-orange-400" />
              <span className="text-sm font-semibold">Multi-Armed Bandit</span>
              <Badge variant="secondary" className="text-[9px] font-mono">{totalPulls} pulls</Badge>
              {banditConfig?.explorationParam != null && <Badge variant="outline" className="text-[9px] font-mono">c={banditConfig.explorationParam}</Badge>}
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending} data-testid="button-seed-bandit" className="text-[10px] h-7 px-2">
                <Zap className="w-3 h-3 mr-1" /> Seed
              </Button>
              <Switch checked={banditEnabled} onCheckedChange={(v) => globalToggleMutation.mutate(v)} data-testid="toggle-bandit-global" />
            </div>
          </div>
        </div>

        {domains.map((domain) => {
          const arms = armsByDomain[domain] || [];
          const maxReward = Math.max(0.001, ...arms.map((a: any) => a.avgReward || 0));
          const maxUcb = Math.max(0.001, ...arms.map((a: any) => a.ucbScore || 0));
          const winnerId = arms.reduce((best: any, a: any) => a.enabled && (a.ucbScore || 0) > (best?.ucbScore || -1) ? a : best, null)?.id;
          return (
            <div key={domain} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <Target className="w-4 h-4 text-orange-400" />
                  {domain.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                </h3>
                <Button size="sm" variant="outline" onClick={() => resetDomainMutation.mutate(domain)} disabled={resetDomainMutation.isPending} data-testid={`button-reset-${domain}`} className="h-7 text-[10px] px-2">
                  <RefreshCw className="w-3 h-3 mr-1" /> Reset
                </Button>
              </div>
              {arms.length === 0 ? <p className="text-xs text-muted-foreground">No arms configured.</p> : (
                <div className="space-y-2">
                  {arms.map((arm: any) => {
                    const isWinner = arm.id === winnerId;
                    const isModelDomain = domain === "model";
                    return (
                      <div key={arm.id} className={cn("rounded-md border p-2.5 space-y-1.5 transition-colors", isWinner ? "border-orange-500/40 bg-orange-500/5" : "border-border", !arm.enabled && "opacity-45")} data-testid={`bandit-arm-${arm.id}`}>
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <Switch checked={arm.enabled} onCheckedChange={(enabled) => toggleArmMutation.mutate({ id: arm.id, enabled })} data-testid={`toggle-arm-${arm.id}`} />
                            <span className={cn("text-xs font-mono font-bold truncate", isModelDomain && slotColor(arm.armName).split(" ").find(c => c.startsWith("text-")))} data-testid={`text-arm-name-${arm.id}`}>{arm.armName}</span>
                            {isWinner && <Badge className="text-[8px] bg-orange-500/20 text-orange-400 border-orange-500/30 px-1 py-0">SELECTED</Badge>}
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0 flex-wrap justify-end">
                            <span className="text-[9px] text-muted-foreground font-mono">{arm.pulls}p</span>
                            {arm.lastPulled && <span className="text-[9px] text-muted-foreground">{new Date(arm.lastPulled).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
                          </div>
                        </div>
                        {[
                          { label: "Avg", value: arm.avgReward || 0, max: maxReward, cls: "bg-primary" },
                          { label: "EMA", value: arm.emaReward || 0, max: maxReward, cls: "bg-emerald-500" },
                          { label: "UCB", value: arm.ucbScore || 0, max: maxUcb, cls: isWinner ? "bg-orange-400" : "bg-amber-500/60" },
                        ].map(({ label, value, max, cls }) => (
                          <div key={label} className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground w-8 flex-shrink-0">{label}</span>
                            <div className="flex-1 h-1.5 bg-background rounded-full overflow-hidden">
                              <div className={cn("h-full rounded-full transition-all", cls)} style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }} />
                            </div>
                            <span className="text-[10px] font-mono w-10 text-right tabular-nums">{value.toFixed(3)}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><Brain className="w-4 h-4 text-purple-400" /> EDCM Directives</h3>
          {directives.length === 0 ? <p className="text-xs text-muted-foreground">No directive configuration loaded.</p> : (
            <div className={cn(isVertical ? "grid grid-cols-2 gap-2" : "space-y-2")}>
              {directives.map((dir: any) => (
                <div key={dir.type} className="rounded-md border border-border p-2.5 space-y-1.5" data-testid={`directive-${dir.type}`}>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <Switch checked={dir.enabled !== false} onCheckedChange={(enabled) => {
                        const params = directiveConfig?.parameters || {};
                        const dirToggles = { ...(params.directiveToggles || {}) };
                        dirToggles[dir.type] = enabled;
                        updateToggleMutation.mutate({ subsystem: "edcm_directives", parameters: { ...params, directiveToggles: dirToggles } });
                      }} data-testid={`toggle-directive-${dir.type}`} />
                      <span className="text-xs font-mono font-bold">{dir.type}</span>
                    </div>
                    <Badge variant="secondary" className={cn("text-[9px]", dir.fired ? "bg-red-500/20 text-red-400" : "bg-muted text-muted-foreground")}>{dir.fired ? "FIRED" : "idle"}</Badge>
                  </div>
                  <div className={cn(isVertical ? "flex flex-col items-center gap-1" : "flex items-center gap-2")}>
                    <span className="text-[10px] text-muted-foreground flex-shrink-0">{isVertical ? "" : "Threshold"}</span>
                    <Slider value={[dir.threshold ?? 0.8]} onValueChange={([val]) => {
                      const params = directiveConfig?.parameters || {};
                      const thresholds = { ...(params.thresholds || {}) };
                      thresholds[dir.metric] = val;
                      updateToggleMutation.mutate({ subsystem: "edcm_directives", parameters: { ...params, thresholds } });
                    }} min={0} max={1} step={0.05} orientation={orientation} className={cn(isVertical ? "h-[120px]" : "flex-1")} data-testid={`slider-threshold-${dir.type}`} />
                    <span className="text-[10px] font-mono text-right">{(dir.threshold ?? 0.8).toFixed(2)}</span>
                  </div>
                  <p className="text-[9px] text-muted-foreground">{dir.description}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><Activity className="w-4 h-4 text-blue-400" /> EDCM History</h3>
          {edcmSnapshots.length === 0 ? <p className="text-xs text-muted-foreground">No EDCM history yet.</p> : (
            <div className="space-y-2">
              {["CM", "DA", "DRIFT", "DVG", "INT", "TBF"].map((metric) => {
                const keyMap: Record<string, string> = { CM: "cm", DA: "da", DRIFT: "drift", DVG: "dvg", INT: "intVal", TBF: "tbf" };
                const values = edcmSnapshots.slice(0, 20).reverse().map((s: any) => { const val = s[keyMap[metric]] ?? s[metric.toLowerCase()] ?? 0; return typeof val === "number" ? val : 0; });
                return (
                  <div key={metric} className="flex items-center gap-2" data-testid={`sparkline-${metric}`}>
                    <span className="text-[10px] font-mono w-10 flex-shrink-0">{metric}</span>
                    <div className="flex items-end gap-px flex-1 h-5">
                      {values.map((v: number, i: number) => (
                        <div key={i} className={cn("flex-1 rounded-t min-w-[2px]", v >= 0.8 ? "bg-red-500" : v <= 0.2 ? "bg-green-500" : "bg-amber-500")} style={{ height: `${Math.max(2, v * 100)}%` }} />
                      ))}
                    </div>
                    <span className="text-[9px] font-mono w-10 text-right text-muted-foreground">{values.length > 0 ? values[values.length - 1].toFixed(2) : "--"}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><Zap className="w-4 h-4 text-amber-400" /> Cross-Domain Correlations (Top 10)</h3>
          {correlations.length === 0 ? <p className="text-xs text-muted-foreground">No cross-domain correlations recorded yet.</p> : (
            <div className="space-y-1.5">
              {correlations.slice(0, 10).map((corr: any, i: number) => {
                const maxJoint = Math.max(0.001, ...correlations.slice(0, 10).map((c: any) => c.jointReward || 0));
                return (
                  <div key={corr.id || i} className="flex items-center gap-2 text-xs" data-testid={`correlation-${i}`}>
                    <span className="font-mono text-[9px] w-4 text-muted-foreground flex-shrink-0">{i + 1}</span>
                    <div className="flex items-center gap-1 flex-1 min-w-0 flex-wrap">
                      {[corr.toolArm, corr.modelArm, corr.ptcaArm, corr.pcnaArm].map((arm, ai) => <Badge key={ai} variant="secondary" className="text-[8px]">{arm}</Badge>)}
                    </div>
                    <div className="w-16 h-2 bg-background rounded-full overflow-hidden flex-shrink-0">
                      <div className="h-full bg-amber-500 rounded-full" style={{ width: `${(corr.jointReward / maxJoint) * 100}%` }} />
                    </div>
                    <span className="font-mono text-[9px] w-10 text-right flex-shrink-0">{(corr.jointReward || 0).toFixed(3)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </ScrollArea>
  );
}
