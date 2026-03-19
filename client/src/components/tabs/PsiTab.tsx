import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Eye, Zap } from "lucide-react";

export function PsiTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: psiState, isLoading } = useQuery<any>({ queryKey: ["/api/v1/psi/state"], refetchInterval: 5000 });
  const { data: triadState } = useQuery<any>({ queryKey: ["/api/v1/triad/state"], refetchInterval: 5000 });

  const solveMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/psi/solve"),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/v1/psi/state"] }); queryClient.invalidateQueries({ queryKey: ["/api/v1/triad/state"] }); toast({ title: "Ψ solve step executed" }); },
  });
  const modeMutation = useMutation({
    mutationFn: (mode: string) => apiRequest("POST", "/api/psi/mode", { mode }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/v1/psi/state"] }); toast({ title: "Self-model mode updated" }); },
  });
  const boostMutation = useMutation({
    mutationFn: ({ dimension, amount }: { dimension: number; amount: number }) => apiRequest("POST", "/api/psi/boost", { dimension, amount }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/v1/psi/state"] }),
  });
  const biasMutation = useMutation({
    mutationFn: ({ dimension, bias }: { dimension: number; bias: number }) => apiRequest("POST", "/api/psi/bias", { dimension, bias }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/v1/psi/state"] }),
  });

  if (isLoading) return <div className="p-4"><Skeleton className="h-64 w-full" /></div>;

  const labels = psiState?.labels || [];
  const thresholds = psiState?.thresholds || [];
  const energies = psiState?.dimensionEnergies || [];
  const biases = psiState?.dimensionBiases || [];
  const mode = psiState?.mode || "operational";
  const history = psiState?.energyHistory || [];
  const omegaPairings = psiState?.omegaPairings || [];

  const modeDescriptions: Record<string, string> = {
    reflective: "Heightened Integrity, Coherence, Self-Awareness — introspective focus",
    operational: "Balanced — no biases applied",
    transparent: "Heightened Agency, Identity, Confidence — open communication",
    guarded: "Heightened Vigilance, Compliance, Prudence — cautious posture",
  };

  const aboveThreshold = energies.filter((e: number, i: number) => e >= (thresholds[i] || 0)).length;
  const statusText = aboveThreshold >= 9 ? "Self-model fully coherent — all dimensions healthy"
    : aboveThreshold >= 6 ? "Self-model stable — most dimensions above threshold"
    : aboveThreshold >= 3 ? "Self-model degraded — multiple dimensions below threshold"
    : "Self-model critical — most dimensions below threshold";

  return (
    <ScrollArea className="h-full">
      <div className="p-3 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-pink-400" />
            <span className="font-semibold text-sm" data-testid="text-psi-header">PTCA-Ψ Self-Model Tensor</span>
            <Badge variant="secondary" className="text-[10px]" data-testid="badge-psi-energy">E = {(psiState?.totalEnergy || 0).toFixed(6)}</Badge>
          </div>
          <Button size="sm" variant="outline" onClick={() => solveMutation.mutate()} disabled={solveMutation.isPending} data-testid="button-psi-solve"><Zap className="w-3 h-3 mr-1" />Solve</Button>
        </div>

        <div className="rounded border border-border p-3 space-y-2">
          <span className="text-xs font-medium text-muted-foreground">Self-Model Mode</span>
          <div className="flex gap-2 flex-wrap">
            {["reflective", "operational", "transparent", "guarded"].map(m => (
              <Button key={m} size="sm" variant={mode === m ? "default" : "outline"} onClick={() => modeMutation.mutate(m)} disabled={modeMutation.isPending} className="text-xs capitalize" data-testid={`button-psi-mode-${m}`}>{m}</Button>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground" data-testid="text-psi-mode-desc">{modeDescriptions[mode] || ""}</p>
        </div>

        <div className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Sentinel → Ψ → Ω Bridge</span>
          {labels.map((label: string, i: number) => {
            const energy = energies[i] || 0;
            const threshold = thresholds[i] || 0;
            const bias = biases[i] || 0;
            const omega = omegaPairings[i];
            const pct = Math.min(100, Math.max(0, energy * 100));
            const threshPct = threshold * 100;
            const isAbove = energy >= threshold;
            return (
              <div key={i} className="flex items-center gap-2 py-1 border-b border-border/50 last:border-0" data-testid={`row-psi-dim-${i}`}>
                <Badge variant="outline" className={cn("text-[9px] w-8 justify-center flex-shrink-0", isAbove ? "text-green-400 border-green-400/30" : "text-red-400 border-red-400/30")} data-testid={`badge-sentinel-${i}`}>S{i}</Badge>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[10px] font-medium" data-testid={`text-psi-label-${i}`}>Ψ{i} {label}</span>
                    <span className="text-[9px] text-muted-foreground" data-testid={`text-psi-energy-${i}`}>{energy.toFixed(4)}/{threshold}</span>
                  </div>
                  <div className="relative h-2 bg-muted rounded-full overflow-hidden">
                    <div className={cn("h-full rounded-full transition-all", isAbove ? "bg-pink-400" : "bg-pink-400/40")} style={{ width: `${pct}%` }} />
                    <div className="absolute top-0 h-full w-0.5 bg-white/60" style={{ left: `${threshPct}%` }} />
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-[8px] text-muted-foreground">bias:</span>
                    <input type="range" min="-100" max="100" value={Math.round(bias * 100)} onChange={e => biasMutation.mutate({ dimension: i, bias: parseInt(e.target.value) / 100 })} className="h-1 w-16 accent-pink-400" data-testid={`slider-psi-bias-${i}`} />
                    <span className="text-[8px] text-muted-foreground">{bias.toFixed(2)}</span>
                    <Button size="sm" variant="ghost" className="h-4 px-1 text-[8px]" onClick={() => boostMutation.mutate({ dimension: i, amount: 3 })} data-testid={`button-psi-boost-${i}`}>+</Button>
                  </div>
                </div>
                <div className="flex-shrink-0 text-right w-20">
                  <span className="text-[9px] text-muted-foreground" data-testid={`text-omega-pairing-${i}`}>{omega?.omegaLabel || "—"}</span>
                  {omega?.inverse && <Badge variant="outline" className="text-[7px] ml-1 text-yellow-400 border-yellow-400/30">INV</Badge>}
                </div>
              </div>
            );
          })}
        </div>

        {triadState && (
          <div className="rounded border border-border p-3">
            <span className="text-xs font-medium text-muted-foreground">Triad Energy Summary</span>
            <div className="grid grid-cols-3 gap-3 mt-2">
              <div className="text-center" data-testid="text-triad-ptca"><div className="text-[10px] text-muted-foreground">PTCA (Cognitive)</div><div className="text-sm font-mono font-bold">{(triadState.ptca?.energy || 0).toFixed(4)}</div><div className="text-[9px] text-muted-foreground">{triadState.ptca?.axes}</div></div>
              <div className="text-center" data-testid="text-triad-psi"><div className="text-[10px] text-pink-400">PTCA-Ψ (Self-Model)</div><div className="text-sm font-mono font-bold">{(triadState.psi?.totalEnergy || 0).toFixed(4)}</div><div className="text-[9px] text-muted-foreground">{triadState.psi?.mode}</div></div>
              <div className="text-center" data-testid="text-triad-omega"><div className="text-[10px] text-orange-400">PTCA-Ω (Autonomy)</div><div className="text-sm font-mono font-bold">{(triadState.omega?.totalEnergy || 0).toFixed(4)}</div><div className="text-[9px] text-muted-foreground">{triadState.omega?.mode}</div></div>
            </div>
          </div>
        )}

        {history.length > 0 && (
          <div className="rounded border border-border p-3">
            <span className="text-xs font-medium text-muted-foreground">Ψ Energy History (last {history.length})</span>
            <div className="flex items-end gap-0.5 mt-2 h-12">
              {history.map((e: number, i: number) => { const max = Math.max(...history, 0.001); return <div key={i} className="flex-1 bg-pink-400/60 rounded-t min-w-[3px]" style={{ height: `${(e / max) * 100}%` }} title={e.toFixed(6)} data-testid={`bar-psi-history-${i}`} />; })}
            </div>
          </div>
        )}

        <div className="rounded border border-border p-2">
          <p className="text-[10px] text-muted-foreground" data-testid="text-psi-status">{statusText} ({aboveThreshold}/{labels.length} above threshold)</p>
        </div>
      </div>
    </ScrollArea>
  );
}
