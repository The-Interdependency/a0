import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, MessageSquare, RefreshCw, Trash2 } from "lucide-react";

export function HygieneTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [scoreThreshold, setScoreThreshold] = useState(0.2);
  const [ageDays, setAgeDays] = useState(90);
  const [pruneMode, setPruneMode] = useState<"score" | "age" | "both">("score");
  const [confirmPurge, setConfirmPurge] = useState<string | null>(null);

  const { data: seeds = [], isLoading: seedsLoading } = useQuery<any[]>({
    queryKey: ["/api/v1/memory/seeds"],
    staleTime: 20000,
  });

  const { data: edcmSnaps = [], isLoading: snapsLoading } = useQuery<any[]>({
    queryKey: ["/api/v1/edcm/snapshots"],
    staleTime: 20000,
  });

  const { data: heartbeatStats } = useQuery<any>({
    queryKey: ["/api/v1/heartbeat/stats"],
    staleTime: 20000,
  });

  const now = Date.now();
  const ageCutoff = now - ageDays * 24 * 60 * 60 * 1000;
  const pruneBelow = seeds.filter((s: any) => {
    const score = typeof s.coherenceScore === "number" ? s.coherenceScore : 1;
    const updatedAt = s.updatedAt ? new Date(s.updatedAt).getTime() : now;
    const tooOld = updatedAt < ageCutoff;
    const lowScore = score < scoreThreshold;
    if (pruneMode === "score") return lowScore;
    if (pruneMode === "age") return tooOld;
    return lowScore || tooOld;
  });

  const clearSeedMutation = useMutation({
    mutationFn: (index: number) =>
      apiRequest("POST", `/api/v1/memory/seeds/${index}/clear`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/memory/seeds"] });
      toast({ title: "Seed cleared" });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const pruneMutation = useMutation({
    mutationFn: async (_: void) => {
      const toDelete = seeds
        .map((s: any, i: number) => ({ s, i }))
        .filter(({ s, i }) => pruneBelow.includes(s) && s.label);
      for (const { i } of toDelete) {
        await apiRequest("POST", `/api/v1/memory/seeds/${i}/clear`);
      }
      return toDelete.length;
    },
    onSuccess: (count: number) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/memory/seeds"] });
      toast({ title: `Pruned ${count} seeds` });
      setConfirmPurge(null);
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const clearEdcmMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/v1/edcm/snapshots"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/edcm/snapshots"] });
      toast({ title: "EDCM snapshots cleared" });
      setConfirmPurge(null);
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const purgeHeartbeatLogsMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/v1/heartbeat/logs"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/heartbeat/stats"] });
      toast({ title: "Heartbeat logs purged" });
      setConfirmPurge(null);
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const clearConvsMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/v1/conversations"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/conversations"] });
      toast({ title: "Conversation history cleared" });
      setConfirmPurge(null);
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const labeledSeeds = seeds.filter((s: any) => s.label);

  return (
    <div className="h-full w-full overflow-y-auto overflow-x-hidden px-3 py-3 space-y-4">
      <div className="flex items-center gap-2">
        <RefreshCw className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold" data-testid="text-hygiene-title">Memory Hygiene</h3>
      </div>

      <div className="rounded-lg border border-border bg-card p-3 space-y-3">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Prune Seeds</h4>
        <div className="flex gap-1 text-xs">
          {(["score", "age", "both"] as const).map(m => (
            <button
              key={m}
              onClick={() => setPruneMode(m)}
              className={`px-2 py-1 rounded border text-xs font-medium transition-colors ${pruneMode === m ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
              data-testid={`button-prune-mode-${m}`}
            >{m === "both" ? "Score & Age" : m.charAt(0).toUpperCase() + m.slice(1)}</button>
          ))}
        </div>
        <div className="space-y-2">
          {(pruneMode === "score" || pruneMode === "both") && (
            <>
              <div className="flex items-center justify-between text-xs">
                <span>Score threshold</span>
                <Badge variant="outline">&lt; {scoreThreshold.toFixed(2)}</Badge>
              </div>
              <Slider
                min={0}
                max={1}
                step={0.05}
                value={[scoreThreshold]}
                onValueChange={([v]) => setScoreThreshold(v)}
                data-testid="slider-score-threshold"
              />
            </>
          )}
          {(pruneMode === "age" || pruneMode === "both") && (
            <>
              <div className="flex items-center justify-between text-xs">
                <span>Age threshold</span>
                <Badge variant="outline">&gt; {ageDays}d old</Badge>
              </div>
              <Slider
                min={7}
                max={365}
                step={7}
                value={[ageDays]}
                onValueChange={([v]) => setAgeDays(v)}
                data-testid="slider-age-threshold"
              />
            </>
          )}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{seedsLoading ? "…" : `${labeledSeeds.length} active seeds, ${pruneBelow.length} match criteria`}</span>
          </div>
        </div>
        {confirmPurge === "prune" ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-amber-500">Prune {pruneBelow.length} seeds?</span>
            <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => pruneMutation.mutate(undefined as any)} disabled={pruneMutation.isPending} data-testid="button-confirm-prune">Confirm</Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setConfirmPurge(null)}>Cancel</Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={() => setConfirmPurge("prune")}
            disabled={pruneBelow.length === 0 || pruneMutation.isPending}
            data-testid="button-prune-seeds"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1.5" />
            Prune {pruneBelow.length} Seeds
          </Button>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card p-3 space-y-3">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">EDCM Snapshots</h4>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{snapsLoading ? "…" : `${edcmSnaps.length} snapshots stored`}</span>
        </div>
        {confirmPurge === "edcm" ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-amber-500">Delete all {edcmSnaps.length} EDCM snapshots?</span>
            <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => clearEdcmMutation.mutate()} disabled={clearEdcmMutation.isPending} data-testid="button-confirm-edcm">Confirm</Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setConfirmPurge(null)}>Cancel</Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={() => setConfirmPurge("edcm")}
            disabled={edcmSnaps.length === 0}
            data-testid="button-clear-edcm"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1.5" />
            Clear EDCM Snapshots
          </Button>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card p-3 space-y-3">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Heartbeat Logs</h4>
        <div className="text-xs text-muted-foreground">
          {heartbeatStats ? (
            <span>{heartbeatStats.heartbeatRuns ?? 0} runs logged, {heartbeatStats.events ?? 0} events</span>
          ) : "Loading…"}
        </div>
        {confirmPurge === "hblogs" ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-amber-500">Purge heartbeat logs?</span>
            <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => purgeHeartbeatLogsMutation.mutate()} disabled={purgeHeartbeatLogsMutation.isPending} data-testid="button-confirm-hblogs">Confirm</Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setConfirmPurge(null)}>Cancel</Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={() => setConfirmPurge("hblogs")}
            data-testid="button-purge-hblogs"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1.5" />
            Purge Heartbeat Logs
          </Button>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card p-3 space-y-3">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Conversation History</h4>
        <p className="text-xs text-muted-foreground">Remove all stored chat conversations from the database.</p>
        {confirmPurge === "convs" ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-amber-500">Delete all conversations?</span>
            <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => clearConvsMutation.mutate()} disabled={clearConvsMutation.isPending} data-testid="button-confirm-convs">Confirm</Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setConfirmPurge(null)}>Cancel</Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={() => setConfirmPurge("convs")}
            data-testid="button-clear-conversations"
          >
            <MessageSquare className="w-3.5 h-3.5 mr-1.5" />
            Clear Conversation History
          </Button>
        )}
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
        <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground">Prune and purge actions are permanent. Cleared memory seeds cannot be recovered.</p>
      </div>
    </div>
  );
}
