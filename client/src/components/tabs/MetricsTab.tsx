import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Activity, AlertTriangle, Check, ChevronDown, ChevronRight, Cpu, DollarSign, GitBranch, Plus, ScrollText, Settings, Trash2, X } from "lucide-react";
import { type SliderOrientationProps } from "@/lib/console-config";

export function MetricsTab({ orientation, isVertical }: SliderOrientationProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingRate, setEditingRate] = useState<string | null>(null);
  const [rateForm, setRateForm] = useState({ prompt: "", completion: "", cache: "" });
  const [newModelName, setNewModelName] = useState("");
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const { data: summary, isLoading } = useQuery<{
    totalCost: number; totalPromptTokens: number; totalCompletionTokens: number; totalCacheTokens: number;
    costThisMonth: number; costToday: number;
    byModel: Record<string, { cost: number; promptTokens: number; completionTokens: number; cacheTokens: number; calls: number }>;
    byStage: Record<string, { cost: number; promptTokens: number; completionTokens: number; calls: number }>;
    byConversation: { conversationId: number; cost: number; tokens: number; calls: number }[];
    dailyUsage: { date: string; promptTokens: number; completionTokens: number; cost: number }[];
  }>({ queryKey: ["/api/v1/metrics/costs"], refetchInterval: 15000 });

  const { data: tokenRates } = useQuery<Record<string, { prompt: number; completion: number; cache: number }>>({ queryKey: ["/api/v1/metrics/token-rates"] });
  const { data: spendLimit } = useQuery<{ enabled: boolean; limit: number; mode: string; currentSpend: number }>({ queryKey: ["/api/v1/metrics/spend-limit"], refetchInterval: 30000 });

  const updateRatesMutation = useMutation({
    mutationFn: (rates: Record<string, { prompt: number; completion: number; cache: number }>) => apiRequest("POST", "/api/metrics/token-rates", { rates }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/v1/metrics/token-rates"] }); queryClient.invalidateQueries({ queryKey: ["/api/v1/metrics/costs"] }); toast({ title: "Token rates updated" }); setEditingRate(null); setNewModelName(""); },
  });

  const updateSpendLimitMutation = useMutation({
    mutationFn: (data: { enabled: boolean; limit: number; mode: string }) => apiRequest("POST", "/api/metrics/spend-limit", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/v1/metrics/spend-limit"] }); toast({ title: "Spend limit updated" }); },
  });

  if (isLoading) return <div className="p-4"><Skeleton className="h-40 w-full" /></div>;

  const totalTokens = (summary?.totalPromptTokens || 0) + (summary?.totalCompletionTokens || 0) + (summary?.totalCacheTokens || 0);
  const maxDailyCost = Math.max(0.0001, ...((summary?.dailyUsage || []).map(d => d.cost)));

  function startEditRate(model: string) {
    const r = (tokenRates || {})[model] || { prompt: 0, completion: 0, cache: 0 };
    setRateForm({ prompt: (r.prompt * 1_000_000).toFixed(4), completion: (r.completion * 1_000_000).toFixed(4), cache: (r.cache * 1_000_000).toFixed(4) });
    setEditingRate(model);
  }
  function saveRate(model: string) {
    const updated = { ...(tokenRates || {}) };
    updated[model] = { prompt: parseFloat(rateForm.prompt) / 1_000_000, completion: parseFloat(rateForm.completion) / 1_000_000, cache: parseFloat(rateForm.cache) / 1_000_000 };
    updateRatesMutation.mutate(updated);
  }
  function addNewModel() { if (!newModelName.trim()) return; startEditRate(newModelName.trim()); setNewModelName(""); }
  function deleteRate(model: string) { const updated = { ...(tokenRates || {}) }; delete updated[model]; updateRatesMutation.mutate(updated); }

  return (
    <ScrollArea className="h-full px-3 py-3">
      <div className="space-y-4 pb-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><DollarSign className="w-4 h-4 text-emerald-400" /> Summary</h3>
          <div className="grid grid-cols-2 gap-3 text-center">
            <div><p className="text-xl font-bold font-mono" data-testid="text-total-tokens">{totalTokens.toLocaleString()}</p><p className="text-[10px] text-muted-foreground">Total Tokens</p></div>
            <div><p className="text-xl font-bold font-mono" data-testid="text-total-cost">${(summary?.totalCost || 0).toFixed(4)}</p><p className="text-[10px] text-muted-foreground">Total Cost</p></div>
            <div><p className="text-lg font-bold font-mono text-blue-400" data-testid="text-cost-month">${(summary?.costThisMonth || 0).toFixed(4)}</p><p className="text-[10px] text-muted-foreground">This Month</p></div>
            <div><p className="text-lg font-bold font-mono text-emerald-400" data-testid="text-cost-today">${(summary?.costToday || 0).toFixed(4)}</p><p className="text-[10px] text-muted-foreground">Today</p></div>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-3 text-center">
            <div><p className="text-sm font-mono text-blue-400">{(summary?.totalPromptTokens || 0).toLocaleString()}</p><p className="text-[9px] text-muted-foreground">Prompt</p></div>
            <div><p className="text-sm font-mono text-emerald-400">{(summary?.totalCompletionTokens || 0).toLocaleString()}</p><p className="text-[9px] text-muted-foreground">Completion</p></div>
            <div><p className="text-sm font-mono text-amber-400">{(summary?.totalCacheTokens || 0).toLocaleString()}</p><p className="text-[9px] text-muted-foreground">Cache</p></div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <button className="w-full flex items-center justify-between text-sm font-semibold" onClick={() => setExpandedSection(expandedSection === "model" ? null : "model")} data-testid="button-toggle-model-breakdown">
            <span className="flex items-center gap-2"><Cpu className="w-4 h-4 text-purple-400" /> Per-Model Breakdown</span>
            {expandedSection === "model" ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          {expandedSection === "model" && summary?.byModel && (
            <div className="mt-3 space-y-1.5">
              <div className="grid grid-cols-6 gap-1 text-[9px] font-mono text-muted-foreground px-1">
                <span className="col-span-1">Model</span><span className="text-right">Calls</span><span className="text-right">Prompt</span><span className="text-right">Compl.</span><span className="text-right">Cache</span><span className="text-right">Cost</span>
              </div>
              {Object.entries(summary.byModel).map(([model, data]) => (
                <div key={model} className="grid grid-cols-6 gap-1 text-[10px] font-mono items-center px-1" data-testid={`model-row-${model}`}>
                  <Badge variant="secondary" className="text-[9px] col-span-1 justify-start">{model}</Badge>
                  <span className="text-right">{data.calls}</span>
                  <span className="text-right">{data.promptTokens.toLocaleString()}</span>
                  <span className="text-right">{data.completionTokens.toLocaleString()}</span>
                  <span className="text-right">{(data.cacheTokens || 0).toLocaleString()}</span>
                  <span className="text-right">${data.cost.toFixed(4)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <button className="w-full flex items-center justify-between text-sm font-semibold" onClick={() => setExpandedSection(expandedSection === "stage" ? null : "stage")} data-testid="button-toggle-stage-breakdown">
            <span className="flex items-center gap-2"><GitBranch className="w-4 h-4 text-blue-400" /> Per-Stage Breakdown</span>
            {expandedSection === "stage" ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          {expandedSection === "stage" && summary?.byStage && (
            <div className="mt-3 space-y-1.5">
              {Object.entries(summary.byStage).map(([stage, data]) => (
                <div key={stage} className="flex items-center justify-between gap-2 text-xs" data-testid={`stage-row-${stage}`}>
                  <div className="flex items-center gap-2 min-w-0"><Badge variant="secondary" className="text-[9px]">{stage}</Badge><span className="text-muted-foreground text-[10px]">{data.calls} calls</span></div>
                  <span className="font-mono text-[10px] flex-shrink-0">{(data.promptTokens + data.completionTokens).toLocaleString()} tok · ${data.cost.toFixed(4)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <button className="w-full flex items-center justify-between text-sm font-semibold" onClick={() => setExpandedSection(expandedSection === "conv" ? null : "conv")} data-testid="button-toggle-conv-breakdown">
            <span className="flex items-center gap-2"><ScrollText className="w-4 h-4 text-amber-400" /> Per-Conversation Cost</span>
            {expandedSection === "conv" ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          {expandedSection === "conv" && (
            <div className="mt-3 space-y-1">
              {(summary?.byConversation || []).length === 0 ? (
                <p className="text-xs text-muted-foreground">No conversation cost data yet.</p>
              ) : (
                (summary?.byConversation || []).map((conv) => (
                  <div key={conv.conversationId} className="flex items-center justify-between gap-2 text-[10px] font-mono" data-testid={`conv-cost-${conv.conversationId}`}>
                    <span className="text-muted-foreground">Conv #{conv.conversationId}</span>
                    <span>{conv.tokens.toLocaleString()} tok · {conv.calls} calls · ${conv.cost.toFixed(4)}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><Activity className="w-4 h-4 text-blue-400" /> Daily Usage (30d)</h3>
          {(summary?.dailyUsage || []).length === 0 ? <p className="text-xs text-muted-foreground">No daily usage data yet.</p> : (
            <div className="space-y-1">
              <div className="flex items-end gap-px h-20" data-testid="chart-daily-usage">
                {(summary?.dailyUsage || []).map((day) => (
                  <div key={day.date} className="flex-1 bg-primary rounded-t min-w-[3px] transition-all" style={{ height: `${Math.max(2, (day.cost / maxDailyCost) * 100)}%` }} title={`${day.date}: $${day.cost.toFixed(4)}`} />
                ))}
              </div>
              <div className="flex justify-between text-[9px] text-muted-foreground font-mono">
                <span>{(summary?.dailyUsage || [])[0]?.date?.slice(5) || ""}</span>
                <span>{(summary?.dailyUsage || [])[(summary?.dailyUsage || []).length - 1]?.date?.slice(5) || ""}</span>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><Settings className="w-4 h-4 text-muted-foreground" /> Rate Cards ($/1M tokens)</h3>
          <div className="space-y-2">
            {tokenRates && Object.entries(tokenRates).map(([model, rates]) => (
              <div key={model} className="rounded-md border border-border p-2 space-y-1" data-testid={`rate-card-${model}`}>
                {editingRate === model ? (
                  <div className="space-y-1.5">
                    <span className="text-xs font-mono font-bold">{model}</span>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(["prompt", "completion", "cache"] as const).map(field => (
                        <div key={field}><label className="text-[9px] text-muted-foreground capitalize">{field}</label>
                          <Input value={rateForm[field]} onChange={e => setRateForm({ ...rateForm, [field]: e.target.value })} className="text-xs h-7" data-testid={`input-rate-${field}-${model}`} />
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-1.5">
                      <Button size="sm" onClick={() => saveRate(model)} disabled={updateRatesMutation.isPending} data-testid={`button-save-rate-${model}`}><Check className="w-3 h-3 mr-1" /> Save</Button>
                      <Button size="sm" variant="secondary" onClick={() => setEditingRate(null)} data-testid={`button-cancel-rate-${model}`}><X className="w-3 h-3 mr-1" /> Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs font-mono font-bold">{model}</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-[9px] font-mono text-muted-foreground">P=${(rates.prompt * 1_000_000).toFixed(2)} C=${(rates.completion * 1_000_000).toFixed(2)} Ca=${(rates.cache * 1_000_000).toFixed(2)}</span>
                      <Button size="icon" variant="ghost" onClick={() => startEditRate(model)} data-testid={`button-edit-rate-${model}`}><Settings className="w-3 h-3" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => deleteRate(model)} data-testid={`button-delete-rate-${model}`}><Trash2 className="w-3 h-3" /></Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            <div className="flex items-center gap-2">
              <Input placeholder="New model name..." value={newModelName} onChange={e => setNewModelName(e.target.value)} className="text-xs flex-1" data-testid="input-new-rate-model" />
              <Button size="sm" onClick={addNewModel} disabled={!newModelName.trim()} data-testid="button-add-rate-model"><Plus className="w-3 h-3 mr-1" /> Add</Button>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-400" /> Spend Limits</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs">Enforcement</span>
              <Switch checked={spendLimit?.enabled || false} onCheckedChange={(enabled) => updateSpendLimitMutation.mutate({ enabled, limit: spendLimit?.limit || 50, mode: spendLimit?.mode || "warn" })} data-testid="toggle-spend-limit" />
            </div>
            <div className={cn(!(spendLimit?.enabled) && "opacity-40 pointer-events-none", "space-y-3")}>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span>Mode</span>
                <Select value={spendLimit?.mode || "warn"} onValueChange={(mode) => updateSpendLimitMutation.mutate({ enabled: spendLimit?.enabled || false, limit: spendLimit?.limit || 50, mode })}>
                  <SelectTrigger className="w-32 text-xs" data-testid="select-spend-mode"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="warn">Warn Only</SelectItem><SelectItem value="hard_stop">Hard Stop</SelectItem></SelectContent>
                </Select>
              </div>
              <div>
                <div className="flex items-center justify-between text-xs mb-2"><span>Monthly limit</span><span className="font-mono font-bold">${spendLimit?.limit || 50}</span></div>
                <div className={cn(isVertical ? "flex items-center justify-center gap-2" : "")}>
                  <Slider value={[spendLimit?.limit || 50]} onValueChange={([val]) => updateSpendLimitMutation.mutate({ enabled: spendLimit?.enabled || false, limit: val, mode: spendLimit?.mode || "warn" })} min={1} max={500} step={1} orientation={orientation} className={cn(isVertical ? "h-[160px]" : "")} data-testid="slider-spend-limit" />
                </div>
                <div className={cn("flex text-[10px] text-muted-foreground mt-1", isVertical ? "justify-center gap-3" : "justify-between")}><span>$1</span><span>$500</span></div>
              </div>
              <div>
                <div className="flex items-center justify-between text-xs mb-1"><span>Current month usage</span><span className="font-mono text-[10px]">${(spendLimit?.currentSpend || 0).toFixed(4)} / ${spendLimit?.limit || 50}</span></div>
                <div className="w-full h-2 bg-background rounded-full overflow-hidden" data-testid="progress-spend">
                  <div className={cn("h-full rounded-full transition-all", (spendLimit?.currentSpend || 0) >= (spendLimit?.limit || 50) ? "bg-red-500" : (spendLimit?.currentSpend || 0) >= (spendLimit?.limit || 50) * 0.8 ? "bg-amber-500" : "bg-emerald-500")}
                    style={{ width: `${Math.min(100, ((spendLimit?.currentSpend || 0) / (spendLimit?.limit || 50)) * 100)}%` }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}
