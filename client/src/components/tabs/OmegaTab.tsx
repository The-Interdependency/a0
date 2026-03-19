import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Check, Plus, X, Zap } from "lucide-react";
import { type SliderOrientationProps } from "@/lib/console-config";

export function OmegaTab({ orientation, isVertical }: SliderOrientationProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [newGoal, setNewGoal] = useState("");
  const [newGoalPriority, setNewGoalPriority] = useState(5);

  const { data: omegaState, isLoading } = useQuery<any>({ queryKey: ["/api/v1/omega/state"], refetchInterval: 5000 });

  const modeMutation = useMutation({
    mutationFn: (mode: string) => apiRequest("POST", "/api/omega/mode", { mode }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/v1/omega/state"] }); toast({ title: "Autonomy mode updated" }); },
  });
  const biasMutation = useMutation({
    mutationFn: ({ dimension, bias }: { dimension: number; bias: number }) => apiRequest("POST", "/api/omega/bias", { dimension, bias }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/v1/omega/state"] }),
  });
  const goalMutation = useMutation({
    mutationFn: (data: { description: string; priority: number }) => apiRequest("POST", "/api/omega/goal", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/v1/omega/state"] }); setNewGoal(""); toast({ title: "Goal added" }); },
  });
  const completeGoalMutation = useMutation({
    mutationFn: (goalId: string) => apiRequest("POST", `/api/omega/goal/${goalId}/complete`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/v1/omega/state"] }); toast({ title: "Goal completed" }); },
  });
  const removeGoalMutation = useMutation({
    mutationFn: (goalId: string) => apiRequest("POST", `/api/omega/goal/${goalId}/remove`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/v1/omega/state"] }),
  });
  const solveMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/omega/solve"),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/v1/omega/state"] }); toast({ title: "Omega solve step executed" }); },
  });

  if (isLoading) return <div className="p-4"><Skeleton className="h-40" /></div>;

  const dims = omegaState?.dimensionEnergies || [];
  const labels = omegaState?.dimensionLabels || [];
  const thresholds = omegaState?.dimensionThresholds || [];
  const biases = omegaState?.dimensionBiases || [];
  const crossed = omegaState?.thresholdsCrossed || [];
  const goals = omegaState?.goals || [];
  const mode = omegaState?.mode || "active";
  const totalEnergy = omegaState?.totalEnergy || 0;
  const history = omegaState?.energyHistory || [];
  const activeGoals = goals.filter((g: any) => g.status === "active");
  const completedGoals = goals.filter((g: any) => g.status === "completed");
  const modeDescriptions: Record<string, string> = { active: "High initiative & exploration", passive: "Respond only, low initiative", economy: "Budget-conscious, minimal spend", research: "Deep exploration & learning" };
  const getEnergyColor = (e: number, t: number) => e >= t ? "bg-green-500" : e >= t * 0.7 ? "bg-yellow-500" : "bg-red-500/60";

  return (
    <div className="h-full w-full overflow-y-auto overflow-x-hidden">
      <div className="p-3 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold" data-testid="text-omega-title">PTCA-Ω Autonomy Tensor</h3>
            <p className="text-xs text-muted-foreground">53×10×8×7 = {omegaState?.config?.totalElements?.toLocaleString() || "29,680"} elements</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" data-testid="text-omega-energy">E: {totalEnergy.toFixed(4)}</Badge>
            <Button size="sm" variant="outline" onClick={() => solveMutation.mutate()} disabled={solveMutation.isPending} data-testid="button-omega-solve"><Zap className="w-3 h-3 mr-1" />Solve</Button>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className="text-xs font-medium flex-shrink-0">Mode:</span>
          <Select value={mode} onValueChange={v => modeMutation.mutate(v)}>
            <SelectTrigger className="w-28 h-7 text-xs flex-shrink-0" data-testid="select-omega-mode"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="passive">Passive</SelectItem>
              <SelectItem value="economy">Economy</SelectItem>
              <SelectItem value="research">Research</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground truncate">{modeDescriptions[mode]}</span>
        </div>

        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dimensions (A1-A10)</h4>
          {dims.map((energy: number, i: number) => (
            <div key={i} className="space-y-1" data-testid={`omega-dimension-${i}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-mono w-5">A{i + 1}</span>
                  <span className="text-xs truncate max-w-[120px]">{labels[i] || `Dim ${i}`}</span>
                  {crossed[i] && <Badge variant="default" className="text-[9px] h-4 px-1" data-testid={`badge-crossed-${i}`}>ACTIVE</Badge>}
                </div>
                <span className="text-[10px] font-mono text-muted-foreground tabular-nums">{energy.toFixed(3)}/{thresholds[i]?.toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden relative">
                  <div className={`h-full rounded-full transition-all ${getEnergyColor(energy, thresholds[i])}`} style={{ width: `${Math.min(100, energy * 100)}%` }} />
                  <div className="absolute top-0 h-full w-px bg-foreground/40" style={{ left: `${thresholds[i] * 100}%` }} />
                </div>
                <Slider className="w-16" min={-10} max={10} step={1} value={[Math.round((biases[i] || 0) * 10)]} onValueChange={([v]) => biasMutation.mutate({ dimension: i, bias: v / 10 })} data-testid={`slider-bias-${i}`} />
              </div>
            </div>
          ))}
        </div>

        {history.length > 1 && (
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Energy History</h4>
            <div className="flex items-end gap-px h-12 bg-muted/30 rounded p-1" data-testid="omega-energy-history">
              {history.map((e: number, i: number) => { const maxE = Math.max(...history, 0.001); return <div key={i} className="flex-1 bg-primary/70 rounded-t" style={{ height: `${Math.max(2, (e / maxE) * 100)}%` }} />; })}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Goals</h4>
          <div className="flex gap-2">
            <Input value={newGoal} onChange={e => setNewGoal(e.target.value)} placeholder="New goal description..." className="text-xs h-7 flex-1" data-testid="input-new-goal" />
            <Input type="number" value={newGoalPriority} onChange={e => setNewGoalPriority(parseInt(e.target.value) || 5)} className="text-xs h-7 w-14" min={1} max={10} data-testid="input-goal-priority" />
            <Button size="sm" variant="outline" className="h-7" onClick={() => { if (newGoal.trim()) goalMutation.mutate({ description: newGoal.trim(), priority: newGoalPriority }); }} disabled={goalMutation.isPending || !newGoal.trim()} data-testid="button-add-goal"><Plus className="w-3 h-3" /></Button>
          </div>

          {activeGoals.length > 0 && (
            <div className="space-y-1">
              {activeGoals.map((g: any) => (
                <div key={g.id} className="flex items-center justify-between bg-muted/40 rounded px-2 py-1" data-testid={`goal-active-${g.id}`}>
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <Badge variant="outline" className="text-[9px] h-4 px-1 shrink-0">P{g.priority}</Badge>
                    <span className="text-xs truncate">{g.description}</span>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => completeGoalMutation.mutate(g.id)} data-testid={`button-complete-goal-${g.id}`}><Check className="w-3 h-3 text-green-500" /></Button>
                    <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => removeGoalMutation.mutate(g.id)} data-testid={`button-remove-goal-${g.id}`}><X className="w-3 h-3 text-destructive" /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {completedGoals.length > 0 && (
            <div className="space-y-1">
              <span className="text-[10px] text-muted-foreground">Completed ({completedGoals.length})</span>
              {completedGoals.slice(0, 5).map((g: any) => (
                <div key={g.id} className="flex items-center gap-1.5 px-2 py-0.5 opacity-50" data-testid={`goal-completed-${g.id}`}>
                  <Check className="w-3 h-3 text-green-500 shrink-0" /><span className="text-xs truncate line-through">{g.description}</span>
                </div>
              ))}
            </div>
          )}
          {goals.length === 0 && <p className="text-xs text-muted-foreground">No goals set. Add a goal to energize the Goal Persistence dimension.</p>}
        </div>

        <div className="space-y-1">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cross-Coupling</h4>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-muted/30 rounded p-2"><span className="text-muted-foreground">PTCA↔Ω:</span><span className="ml-1 font-mono">{omegaState?.config?.crossCoupling || 0.05}</span></div>
            <div className="bg-muted/30 rounded p-2"><span className="text-muted-foreground">Sentinel Gate:</span><span className="ml-1 font-mono">{omegaState?.config?.sentinelThreshold || 120}</span></div>
            <div className="bg-muted/30 rounded p-2"><span className="text-muted-foreground">A1↔Seed8:</span><span className="ml-1">Goal↔Memory</span></div>
            <div className="bg-muted/30 rounded p-2"><span className="text-muted-foreground">A9↔Seed7:</span><span className="ml-1">Explore↔Research</span></div>
          </div>
        </div>

        <div className="space-y-1">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</h4>
          <div className="text-xs text-muted-foreground space-y-0.5" data-testid="text-omega-status">
            {crossed[1] && <p>High initiative — self-initiating research</p>}
            {crossed[7] && <p>Resource-aware — using economy mode</p>}
            {crossed[8] && <p>High exploration — expanding search breadth</p>}
            {crossed[6] && <p>Learning active — writing journal entries</p>}
            {crossed[0] && activeGoals.length > 0 && <p>Goal-driven — {activeGoals.length} active goal(s)</p>}
            {!crossed.some((c: boolean) => c) && <p>All dimensions below threshold — nominal operation</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
