import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Shield, Zap } from "lucide-react";

export function GuardianTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: psiState, isLoading: psiLoading } = useQuery<any>({
    queryKey: ["/api/v1/psi/state"],
    refetchInterval: 8000,
  });

  const { data: spendData } = useQuery<any>({
    queryKey: ["/api/v1/metrics/spend"],
    refetchInterval: 15000,
  });

  const { data: toolToggles = {} } = useQuery<Record<string, boolean>>({
    queryKey: ["/api/v1/agent/tool-toggles"],
    staleTime: 15000,
  });

  const { data: omegaState } = useQuery<any>({
    queryKey: ["/api/v1/omega/state"],
    refetchInterval: 8000,
  });

  const [psiSliders, setPsiSliders] = useState<Record<number, number>>({});
  const [thrSliders, setThrSliders] = useState<Record<number, number>>({});
  const [editingThreshold, setEditingThreshold] = useState<number | null>(null);

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

  if (psiLoading) return <div className="p-4"><Skeleton className="h-60" /></div>;

  const dims = psiState?.dimensionEnergies || [];
  const labels = psiState?.labels || psiState?.dimensionLabels || [];
  const thresholds = psiState?.thresholds || psiState?.dimensionThresholds || [];
  const biases = psiState?.dimensionBiases || [];

  const psi3 = dims[3] ?? 0;
  const psi4 = dims[4] ?? 0;
  const psi5 = dims[5] ?? 0;
  const psi3t = thresholds[3] ?? 0.6;
  const psi4t = thresholds[4] ?? 0.5;
  const psi5t = thresholds[5] ?? 0.5;

  const gateColor = (e: number, t: number) =>
    e >= t ? "text-green-500" : e >= t * 0.7 ? "text-amber-500" : "text-red-500";
  const gateLabel = (e: number, t: number) =>
    e >= t ? "Open" : "Restricted";

  const spendPct = spendData?.limitUsd && spendData?.totalAll
    ? (spendData.totalAll / spendData.limitUsd) * 100
    : null;

  const disabledTools = Object.entries(toolToggles).filter(([, v]) => !v).map(([k]) => k);
  const enabledTools = Object.entries(toolToggles).filter(([, v]) => v).map(([k]) => k);

  const omegaMode = omegaState?.mode || "active";
  const OMEGA_MODES = ["active", "passive", "economy", "research"];

  return (
    <div className="h-full w-full overflow-y-auto overflow-x-hidden px-3 py-3 space-y-4">
      <div className="flex items-center gap-2">
        <Shield className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold" data-testid="text-guardian-title">Guardian — Gate Control</h3>
      </div>

      <div className="rounded-lg border border-border bg-card p-3 space-y-3">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Ψ Gate Thresholds &amp; Bias (Ψ3/4/5)</h4>
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
                  <Badge
                    variant="outline"
                    className={`text-xs ${gateColor(val, thr)}`}
                    data-testid={`gate-psi${idx}`}
                  >
                    {gateLabel(val, thr)}
                  </Badge>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground flex-1">
                  Threshold: {thr.toFixed(2)} | Bias: {biasVal.toFixed(2)}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-5 text-xs px-1.5"
                  onClick={() => setEditingThreshold(isEditingThr ? null : idx)}
                  data-testid={`button-edit-threshold-psi${idx}`}
                >
                  {isEditingThr ? "↑ bias" : "edit thr"}
                </Button>
              </div>
              {isEditingThr ? (
                <>
                  <Slider
                    min={0}
                    max={1}
                    step={0.05}
                    value={[thrVal]}
                    onValueChange={([v]) => setThrSliders(prev => ({ ...prev, [idx]: v }))}
                    data-testid={`slider-threshold-psi${idx}`}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-xs"
                    onClick={() => thresholdMutation.mutate({ dimension: idx, threshold: thrVal })}
                    disabled={thresholdMutation.isPending}
                    data-testid={`button-apply-threshold-psi${idx}`}
                  >
                    Set Ψ{idx} Threshold → {thrVal.toFixed(2)}
                  </Button>
                </>
              ) : (
                <>
                  <Slider
                    min={-1}
                    max={1}
                    step={0.05}
                    value={[biasVal]}
                    onValueChange={([v]) => setPsiSliders(prev => ({ ...prev, [idx]: v }))}
                    data-testid={`slider-psi${idx}`}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-xs"
                    onClick={() => biasMutation.mutate({ dimension: idx, bias: biasVal })}
                    disabled={biasMutation.isPending}
                    data-testid={`button-apply-psi${idx}`}
                  >
                    Apply Ψ{idx} Bias
                  </Button>
                </>
              )}
            </div>
          );
        })}
      </div>

      <div className="rounded-lg border border-border bg-card p-3 space-y-2">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Spend Limit Status</h4>
        {spendData ? (
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span>Total Spent</span>
              <span className="font-mono">${Number(spendData.totalAll ?? 0).toFixed(4)}</span>
            </div>
            {spendData.limitUsd && (
              <>
                <div className="flex justify-between text-xs">
                  <span>Limit</span>
                  <span className="font-mono">${spendData.limitUsd}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span>Usage</span>
                  <Badge
                    variant={spendPct && spendPct >= 90 ? "destructive" : "outline"}
                    className="text-xs"
                    data-testid="text-spend-pct"
                  >
                    {spendPct?.toFixed(1)}%
                  </Badge>
                </div>
              </>
            )}
          </div>
        ) : <p className="text-xs text-muted-foreground">No spend data available.</p>}
      </div>

      <div className="rounded-lg border border-border bg-card p-3 space-y-2">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Ω Mode Control</h4>
        <div className="flex flex-wrap gap-2">
          {OMEGA_MODES.map(m => (
            <Button
              key={m}
              size="sm"
              variant={omegaMode === m ? "default" : "outline"}
              className="h-7 text-xs capitalize"
              onClick={() => modeMutation.mutate(m)}
              disabled={modeMutation.isPending}
              data-testid={`button-omega-mode-${m}`}
            >
              {m}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Current: <span className="font-medium capitalize">{omegaMode}</span></p>
      </div>

      <div className="rounded-lg border border-border bg-card p-3 space-y-2">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tool Toggle Summary</h4>
        {disabledTools.length === 0 && enabledTools.length === 0 ? (
          <p className="text-xs text-muted-foreground">All tools use defaults (no overrides set).</p>
        ) : (
          <div className="space-y-1">
            {disabledTools.length > 0 && (
              <div>
                <p className="text-xs text-red-500 font-medium">Disabled ({disabledTools.length}):</p>
                <p className="text-xs text-muted-foreground">{disabledTools.join(", ")}</p>
              </div>
            )}
            {enabledTools.length > 0 && (
              <div>
                <p className="text-xs text-green-500 font-medium">Force-enabled ({enabledTools.length}):</p>
                <p className="text-xs text-muted-foreground">{enabledTools.join(", ")}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
