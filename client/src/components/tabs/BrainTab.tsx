import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Cpu, GitBranch, Play, Plus, Settings, Star, Trash2 } from "lucide-react";
import { slotColor, type SliderOrientationProps } from "@/lib/console-config";

const STAGE_ROLES = ["generate", "review", "refine", "synthesize"];
const STAGE_INPUTS = ["user_query", "previous_output", "all_outputs"];

export function BrainTab({ orientation, isVertical }: SliderOrientationProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingPreset, setEditingPreset] = useState<any | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formMerge, setFormMerge] = useState("last");
  const [formStages, setFormStages] = useState<any[]>([{ order: 0, model: "a", role: "generate", input: "user_query", timeoutMs: 30000, weight: 1.0 }]);

  const { data: slotsData } = useQuery<Record<string, { label: string; provider: string; model: string }>>({ queryKey: ["/api/v1/agent/slots"], refetchInterval: 30000 });
  const slotEntries = Object.entries(slotsData ?? {});

  const { data: brainData, isLoading } = useQuery<{ presets: any[]; activePresetId: string }>({ queryKey: ["/api/v1/brain/presets"], refetchInterval: 10000 });
  const presets = brainData?.presets || [];
  const activePresetId = brainData?.activePresetId || "a0_dual";
  const activePreset = presets.find(p => p.id === activePresetId);

  const activateMutation = useMutation({ mutationFn: (id: string) => apiRequest("POST", `/api/brain/presets/${id}/activate`), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/v1/brain/presets"] }); toast({ title: "Brain preset activated" }); } });
  const setDefaultMutation = useMutation({ mutationFn: (id: string) => apiRequest("POST", `/api/brain/presets/${id}/default`), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/v1/brain/presets"] }); toast({ title: "Default preset updated" }); } });
  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/brain/presets", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/v1/brain/presets"] }); toast({ title: "Preset created" }); resetForm(); },
    onError: (e: any) => toast({ title: "Create failed", description: e.message, variant: "destructive" }),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: any }) => apiRequest("PATCH", `/api/brain/presets/${id}`, updates),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/v1/brain/presets"] }); toast({ title: "Preset updated" }); setEditingPreset(null); },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/brain/presets/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/v1/brain/presets"] }); toast({ title: "Preset deleted" }); },
    onError: (e: any) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });
  const updateWeightsMutation = useMutation({
    mutationFn: (weights: Record<string, number>) => apiRequest("POST", "/api/brain/weights", { weights }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/v1/brain/presets"] }); toast({ title: "Weights updated" }); },
  });

  function resetForm() { setShowNewForm(false); setFormName(""); setFormDesc(""); setFormMerge("last"); setFormStages([{ order: 0, model: "a", role: "generate", input: "user_query", timeoutMs: 30000, weight: 1.0 }]); }
  function addStage() { const maxOrder = Math.max(...formStages.map(s => s.order), -1); setFormStages([...formStages, { order: maxOrder + 1, model: "a", role: "generate", input: "user_query", timeoutMs: 30000, weight: 1.0 }]); }
  function removeStage(idx: number) { if (formStages.length <= 1) return; setFormStages(formStages.filter((_, i) => i !== idx)); }
  function updateStage(idx: number, key: string, value: any) { const updated = [...formStages]; updated[idx] = { ...updated[idx], [key]: value }; setFormStages(updated); }

  function handleSubmit() {
    if (!formName.trim()) return;
    const weights: Record<string, number> = {};
    for (const s of formStages) { if (!weights[s.model]) weights[s.model] = 0; weights[s.model] += s.weight; }
    const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
    for (const k of Object.keys(weights)) weights[k] = weights[k] / totalWeight;
    createMutation.mutate({ name: formName.trim(), description: formDesc.trim(), stages: formStages, mergeStrategy: formMerge, weights, thresholds: { mergeThreshold: 0.18, softforkThreshold: 0.30 } });
  }

  if (isLoading) return <div className="p-4"><Skeleton className="h-40 w-full" /></div>;

  return (
    <ScrollArea className="h-full px-3 py-3">
      <div className="space-y-4 pb-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><Cpu className="w-4 h-4 text-primary" /> Active Brain Pipeline</h3>
          {activePreset ? (
            <div className="space-y-3" data-testid="brain-active-preset">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-medium">{activePreset.name}</span>
                  <Badge variant="default" className="text-[9px]">ACTIVE</Badge>
                  {activePreset.isDefault && <Badge variant="secondary" className="text-[9px]">DEFAULT</Badge>}
                </div>
                <Badge variant="secondary" className="text-[9px] font-mono">{activePreset.mergeStrategy}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{activePreset.description}</p>
              <div className="space-y-1.5">
                <span className="text-[10px] text-muted-foreground font-medium">Pipeline Stages</span>
                <div className="flex items-center gap-1 flex-wrap" data-testid="brain-pipeline-visual">
                  {activePreset.stages.map((stage: any, idx: number) => {
                    const prevStage = idx > 0 ? activePreset.stages[idx - 1] : null;
                    const isParallel = prevStage && prevStage.order === stage.order;
                    const slotKey = stage.model?.replace(/^slot_/, "") ?? "a";
                    const slotInfo = slotsData?.[slotKey];
                    return (
                      <div key={idx} className="flex items-center gap-1">
                        {idx > 0 && !isParallel && <GitBranch className="w-3 h-3 text-muted-foreground rotate-90" />}
                        {isParallel && <span className="text-[9px] text-muted-foreground">‖</span>}
                        <div className={cn("rounded-md border px-2 py-1 text-[10px] font-mono", slotColor(slotKey))}>
                          <span className="font-semibold">{slotInfo ? slotInfo.label : stage.model}</span>
                          {slotInfo?.model && <span className="opacity-60 ml-1 text-[9px]">{slotInfo.model.split("/").pop()}</span>}
                          <span className="opacity-60 ml-1">({stage.role})</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              {activePreset.weights && Object.keys(activePreset.weights).length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[10px] text-muted-foreground font-medium">Model Weights</span>
                  <div className={cn(isVertical ? "grid grid-cols-2 gap-3" : "space-y-2")}>
                    {Object.entries(activePreset.weights).map(([model, weight]) => {
                      const wSlotKey = model.replace(/^slot_/, "");
                      const wLabel = slotsData?.[wSlotKey]?.label ?? model;
                      return (
                        <div key={model} className={cn(isVertical ? "flex flex-col items-center gap-1" : "flex items-center gap-2")}>
                          <span className={cn("text-[10px] font-mono flex-shrink-0", !isVertical && "w-16")}>{wLabel}</span>
                          <Slider value={[weight as number]} onValueChange={([val]) => updateWeightsMutation.mutate({ ...activePreset.weights, [model]: val })} min={0} max={1} step={0.05} orientation={orientation} className={cn(isVertical ? "h-[120px]" : "flex-1")} data-testid={`slider-brain-weight-${model}`} />
                          <span className="text-[10px] font-mono">{(weight as number).toFixed(2)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : <p className="text-xs text-muted-foreground">No active preset. Select one below.</p>}
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
            <h3 className="font-semibold text-sm flex items-center gap-2"><GitBranch className="w-4 h-4 text-muted-foreground" /> All Presets</h3>
            <Button size="sm" variant="outline" onClick={() => { setShowNewForm(!showNewForm); setEditingPreset(null); }} data-testid="button-new-brain-preset"><Plus className="w-3 h-3 mr-1" /> New Preset</Button>
          </div>

          {showNewForm && (
            <div className="rounded-md border border-border p-3 mb-3 space-y-2" data-testid="brain-preset-form">
              <Input placeholder="Preset name" value={formName} onChange={e => setFormName(e.target.value)} data-testid="input-brain-preset-name" />
              <Textarea placeholder="Description" value={formDesc} onChange={e => setFormDesc(e.target.value)} className="resize-none text-xs" rows={2} data-testid="input-brain-preset-desc" />
              <div className="flex items-center gap-2">
                <Label className="text-[10px]">Merge Strategy</Label>
                <Select value={formMerge} onValueChange={setFormMerge}>
                  <SelectTrigger className="w-32" data-testid="select-brain-merge"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="last">Last Output</SelectItem>
                    <SelectItem value="synthesis">Synthesis</SelectItem>
                    <SelectItem value="weighted">Weighted</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] text-muted-foreground font-medium">Pipeline Stages</span>
                  <Button size="sm" variant="ghost" onClick={addStage} data-testid="button-add-stage"><Plus className="w-3 h-3 mr-1" /> Stage</Button>
                </div>
                {formStages.map((stage, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 flex-wrap" data-testid={`brain-stage-${idx}`}>
                    <Input type="number" value={stage.order} onChange={e => updateStage(idx, "order", parseInt(e.target.value) || 0)} className="w-12 text-xs" />
                    <Select value={stage.model} onValueChange={v => updateStage(idx, "model", v)}>
                      <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {slotEntries.map(([key, s]) => <SelectItem key={key} value={key}>{s.label} ({key})</SelectItem>)}
                        <SelectItem value="hub">Hub</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={stage.role} onValueChange={v => updateStage(idx, "role", v)}>
                      <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                      <SelectContent>{STAGE_ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                    </Select>
                    <Select value={stage.input} onValueChange={v => updateStage(idx, "input", v)}>
                      <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                      <SelectContent>{STAGE_INPUTS.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent>
                    </Select>
                    <Button size="icon" variant="ghost" onClick={() => removeStage(idx)} disabled={formStages.length <= 1}><Trash2 className="w-3 h-3" /></Button>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Button size="sm" onClick={handleSubmit} disabled={createMutation.isPending || !formName.trim()} data-testid="button-save-brain-preset">{createMutation.isPending ? "Saving..." : "Save Preset"}</Button>
                <Button size="sm" variant="ghost" onClick={resetForm} data-testid="button-cancel-brain-preset">Cancel</Button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {presets.map((preset: any) => {
              const isActive = preset.id === activePresetId;
              const isEditing = editingPreset?.id === preset.id;
              return (
                <div key={preset.id} className={cn("rounded-md border p-2.5 space-y-1.5", isActive ? "border-primary/50" : "border-border")} data-testid={`brain-preset-${preset.id}`}>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-medium truncate">{preset.name}</span>
                      {isActive && <Badge variant="default" className="text-[9px]">ACTIVE</Badge>}
                      {preset.isDefault && <Badge variant="secondary" className="text-[9px]">DEFAULT</Badge>}
                      {preset.builtin && <Badge variant="secondary" className="text-[9px]">Built-in</Badge>}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {!isActive && <Button size="sm" variant="outline" onClick={() => activateMutation.mutate(preset.id)} disabled={activateMutation.isPending} data-testid={`button-activate-brain-${preset.id}`}><Play className="w-3 h-3 mr-1" /> Activate</Button>}
                      {!preset.isDefault && <Button size="icon" variant="ghost" onClick={() => setDefaultMutation.mutate(preset.id)} disabled={setDefaultMutation.isPending} data-testid={`button-default-brain-${preset.id}`}><Star className="w-3 h-3" /></Button>}
                      {!preset.builtin && (
                        <>
                          <Button size="icon" variant="ghost" onClick={() => isEditing ? setEditingPreset(null) : setEditingPreset({ ...preset })} data-testid={`button-edit-brain-${preset.id}`}><Settings className="w-3 h-3" /></Button>
                          <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(preset.id)} disabled={deleteMutation.isPending} data-testid={`button-delete-brain-${preset.id}`}><Trash2 className="w-3 h-3" /></Button>
                        </>
                      )}
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground">{preset.description}</p>
                  <div className="flex items-center gap-1 flex-wrap">
                    {preset.stages?.map((stage: any, idx: number) => {
                      const prevStage = idx > 0 ? preset.stages[idx - 1] : null;
                      const isParallel = prevStage && prevStage.order === stage.order;
                      const pSlotKey = (stage.model ?? "a").replace(/^slot_/, "");
                      const pLabel = slotsData?.[pSlotKey]?.label ?? stage.model;
                      return (
                        <div key={idx} className="flex items-center gap-0.5">
                          {idx > 0 && !isParallel && <span className="text-[9px] text-muted-foreground mx-0.5">→</span>}
                          {isParallel && <span className="text-[9px] text-muted-foreground mx-0.5">‖</span>}
                          <span className={cn("text-[9px] font-mono px-1 py-0.5 rounded", slotColor(pSlotKey).split(" ").filter(c => c.startsWith("bg-") || c.startsWith("text-")).join(" "))}>{pLabel}:{stage.role}</span>
                        </div>
                      );
                    })}
                  </div>
                  {isEditing && (
                    <div className="border-t border-border pt-2 mt-2 space-y-2">
                      <Input value={editingPreset.name} onChange={e => setEditingPreset({ ...editingPreset, name: e.target.value })} className="text-xs" data-testid="input-edit-brain-name" />
                      <Textarea value={editingPreset.description} onChange={e => setEditingPreset({ ...editingPreset, description: e.target.value })} className="resize-none text-xs" rows={2} data-testid="input-edit-brain-desc" />
                      <Button size="sm" onClick={() => updateMutation.mutate({ id: editingPreset.id, updates: { name: editingPreset.name, description: editingPreset.description } })} disabled={updateMutation.isPending} data-testid="button-save-edit-brain">Save Changes</Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}
