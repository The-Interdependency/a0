import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Activity, Check, Clock, Plus, Settings, Sparkles, Target, Trash2, X, Zap } from "lucide-react";
import { type SliderOrientationProps } from "@/lib/console-config";

export function HeartbeatTab({ orientation, isVertical }: SliderOrientationProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showNewForm, setShowNewForm] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formType, setFormType] = useState("custom");
  const [formWeight, setFormWeight] = useState(1.0);
  const [formInterval, setFormInterval] = useState(300);
  const [formEnabled, setFormEnabled] = useState(true);
  const [formHandlerCode, setFormHandlerCode] = useState("");

  const [newGoalDesc, setNewGoalDesc] = useState("");
  const [newGoalPriority, setNewGoalPriority] = useState(5);

  const { data: activityStats } = useQuery<{
    heartbeatRuns: number; transcripts: number; conversations: number; events: number;
    drafts: number; promotions: number; edcmSnapshots: number; memorySnapshots: number;
  }>({ queryKey: ["/api/v1/heartbeat/stats"], refetchInterval: 10000 });

  const { data: status } = useQuery<{ running: boolean; tickIntervalMs: number }>({ queryKey: ["/api/v1/heartbeat/status"], refetchInterval: 10000 });
  const { data: tasks = [], isLoading: tasksLoading } = useQuery<any[]>({ queryKey: ["/api/v1/heartbeat/tasks"], refetchInterval: 10000 });
  const { data: discoveries = [] } = useQuery<any[]>({ queryKey: ["/api/v1/discoveries"], refetchInterval: 10000 });
  const { data: omegaState } = useQuery<{ goals: Array<{ id: string; description: string; priority: number; status: string; source: string; createdAt: string }> }>({ queryKey: ["/api/v1/omega/state"], refetchInterval: 15000 });

  const createTaskMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/heartbeat/tasks", data),
    onSuccess: () => { toast({ title: "Task created" }); queryClient.invalidateQueries({ queryKey: ["/api/v1/heartbeat/tasks"] }); resetForm(); },
    onError: (e: any) => toast({ title: "Create failed", description: e.message, variant: "destructive" }),
  });
  const updateTaskMutation = useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: any }) => apiRequest("PATCH", `/api/heartbeat/tasks/${id}`, updates),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/v1/heartbeat/tasks"] }); if (editingTaskId !== null) { setEditingTaskId(null); toast({ title: "Task updated" }); } },
  });
  const deleteTaskMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/heartbeat/tasks/${id}`),
    onSuccess: () => { toast({ title: "Task deleted" }); queryClient.invalidateQueries({ queryKey: ["/api/v1/heartbeat/tasks"] }); },
    onError: (e: any) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });
  const runNowMutation = useMutation({
    mutationFn: (name: string) => apiRequest("POST", `/api/heartbeat/tasks/${name}/run`),
    onSuccess: () => { toast({ title: "Task executed" }); queryClient.invalidateQueries({ queryKey: ["/api/v1/heartbeat/tasks"] }); queryClient.invalidateQueries({ queryKey: ["/api/v1/discoveries"] }); },
    onError: (e: any) => toast({ title: "Run failed", description: e.message, variant: "destructive" }),
  });
  const toggleSchedulerMutation = useMutation({
    mutationFn: (start: boolean) => apiRequest("POST", start ? "/api/heartbeat/start" : "/api/heartbeat/stop"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/v1/heartbeat/status"] }),
  });
  const promoteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/discoveries/${id}/promote`),
    onSuccess: () => { toast({ title: "Discovery promoted" }); queryClient.invalidateQueries({ queryKey: ["/api/v1/discoveries"] }); },
  });
  const addGoalMutation = useMutation({
    mutationFn: ({ description, priority }: { description: string; priority: number }) => apiRequest("POST", "/api/v1/omega/goal", { description, priority }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/v1/triad/omega"] }); setNewGoalDesc(""); setNewGoalPriority(5); toast({ title: "Goal added" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const completeGoalMutation = useMutation({
    mutationFn: (goalId: string) => apiRequest("POST", `/api/v1/omega/goal/${goalId}/complete`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/v1/triad/omega"] }); toast({ title: "Goal completed" }); },
  });
  const removeGoalMutation = useMutation({
    mutationFn: (goalId: string) => apiRequest("POST", `/api/v1/omega/goal/${goalId}/remove`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/v1/triad/omega"] }); },
  });

  function resetForm() {
    setShowNewForm(false); setEditingTaskId(null); setFormName(""); setFormDesc(""); setFormType("custom");
    setFormWeight(1.0); setFormInterval(300); setFormEnabled(true); setFormHandlerCode("");
  }
  function startEditing(task: any) {
    setEditingTaskId(task.id); setFormName(task.name); setFormDesc(task.description || "");
    setFormType(task.taskType); setFormWeight(task.weight); setFormInterval(task.intervalSeconds);
    setFormEnabled(task.enabled); setFormHandlerCode(""); setShowNewForm(false);
  }
  function handleSubmit() {
    const payload = { description: formDesc, taskType: formType, weight: formWeight, intervalSeconds: formInterval, enabled: formEnabled, ...(formType === "custom" ? { handlerCode: formHandlerCode } : {}) };
    if (editingTaskId !== null) updateTaskMutation.mutate({ id: editingTaskId, updates: payload });
    else createTaskMutation.mutate({ name: formName, ...payload });
  }

  const totalWeight = tasks.reduce((sum: number, t: any) => sum + (t.enabled ? t.weight : 0), 0);
  const activeGoals = omegaState?.goals?.filter(g => g.status === "active") ?? [];

  const taskForm = (
    <div className="rounded-md border border-border p-3 space-y-3" data-testid="heartbeat-task-form">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold">{editingTaskId !== null ? "Edit Task" : "New Task"}</h4>
        <Button size="icon" variant="ghost" onClick={resetForm} data-testid="button-cancel-task-form"><X className="w-3 h-3" /></Button>
      </div>
      {editingTaskId === null && (
        <div><Label className="text-[10px]">Name</Label><Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="my_custom_task" className="text-xs font-mono mt-0.5 h-7" data-testid="input-task-name" /></div>
      )}
      <div><Label className="text-[10px]">Description</Label><Input value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="What this task does..." className="text-xs mt-0.5 h-7" data-testid="input-task-desc" /></div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[10px]">Task Type</Label>
          <Select value={formType} onValueChange={setFormType}>
            <SelectTrigger className="text-xs mt-0.5 h-7" data-testid="select-task-type"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="custom">Custom</SelectItem>
              <SelectItem value="transcript_search">Transcript Search</SelectItem>
              <SelectItem value="github_search">GitHub Search</SelectItem>
              <SelectItem value="ai_social_search">AI Social Search</SelectItem>
              <SelectItem value="x_monitor">X Monitor</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><Label className="text-[10px]">Interval (sec)</Label><Input type="number" value={formInterval} onChange={e => setFormInterval(parseInt(e.target.value) || 300)} className="text-xs font-mono mt-0.5 h-7" data-testid="input-task-interval" /></div>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[120px]">
          <Label className="text-[10px]">Weight {formWeight.toFixed(1)}</Label>
          <Slider value={[formWeight]} onValueChange={([v]) => setFormWeight(v)} min={0} max={5} step={0.1} className="mt-1" data-testid="slider-task-weight" />
        </div>
        <div className="flex items-center gap-1.5 pt-3"><Switch checked={formEnabled} onCheckedChange={setFormEnabled} data-testid="toggle-task-enabled" /><Label className="text-[10px]">Enabled</Label></div>
      </div>
      {formType === "custom" && (
        <div><Label className="text-[10px]">Handler Code</Label><Textarea value={formHandlerCode} onChange={e => setFormHandlerCode(e.target.value)} placeholder="// JavaScript handler..." className="text-xs font-mono mt-0.5 min-h-[60px]" data-testid="textarea-handler-code" /></div>
      )}
      <Button size="sm" onClick={handleSubmit} disabled={(!formName && editingTaskId === null) || createTaskMutation.isPending || updateTaskMutation.isPending} className="w-full gap-1" data-testid="button-submit-task">
        <Check className="w-3 h-3" />{editingTaskId !== null ? "Save Changes" : "Create Task"}
      </Button>
    </div>
  );

  return (
    <div className="h-full w-full overflow-y-auto overflow-x-hidden px-3 py-3">
      <div className="space-y-4 pb-4">

        {/* Φ Omega Goals */}
        <div className="rounded-lg border border-border bg-card p-3 space-y-2">
          <h3 className="font-semibold text-xs flex items-center gap-2"><Target className="w-3.5 h-3.5 text-amber-400" /> Φ Omega Goals <Badge variant="outline" className="text-[9px] ml-auto">{activeGoals.length} active</Badge></h3>
          <p className="text-[10px] text-muted-foreground">Goal-directed objectives from the PTCA-Ω autonomy tensor. a0 uses these to bias its autonomous behavior.</p>
          {activeGoals.length > 0 && (
            <div className="space-y-1.5">
              {activeGoals.map(goal => (
                <div key={goal.id} className="rounded-md border border-border bg-muted/20 px-2.5 py-2 flex items-start gap-2" data-testid={`goal-${goal.id}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-foreground leading-snug">{goal.description}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[9px] text-muted-foreground font-mono">p{goal.priority}</span>
                      <Badge variant="secondary" className="text-[8px] px-1">{goal.source}</Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    <button onClick={() => completeGoalMutation.mutate(goal.id)} className="text-green-400 hover:text-green-300 p-1" title="Complete" data-testid={`btn-complete-goal-${goal.id}`}><Check className="w-3 h-3" /></button>
                    <button onClick={() => removeGoalMutation.mutate(goal.id)} className="text-muted-foreground hover:text-destructive p-1" title="Remove" data-testid={`btn-remove-goal-${goal.id}`}><Trash2 className="w-3 h-3" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-1.5 pt-1">
            <Input value={newGoalDesc} onChange={e => setNewGoalDesc(e.target.value)} onKeyDown={e => e.key === "Enter" && newGoalDesc.trim() && addGoalMutation.mutate({ description: newGoalDesc.trim(), priority: newGoalPriority })} placeholder="Describe a new goal…" className="h-7 text-xs flex-1" data-testid="input-new-goal" />
            <select value={newGoalPriority} onChange={e => setNewGoalPriority(parseInt(e.target.value))} className="h-7 text-[11px] rounded-md border border-border bg-background px-1.5 w-10" data-testid="select-goal-priority">
              {[1,2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <Button size="sm" className="h-7 px-2" onClick={() => newGoalDesc.trim() && addGoalMutation.mutate({ description: newGoalDesc.trim(), priority: newGoalPriority })} disabled={addGoalMutation.isPending} data-testid="button-add-goal"><Plus className="w-3 h-3" /></Button>
          </div>
        </div>

        {/* Activity Stats */}
        <div className="rounded-lg border border-border bg-card p-3">
          <h3 className="font-semibold text-xs mb-2 flex items-center gap-2"><Sparkles className="w-3.5 h-3.5 text-amber-400" /> Activity Stats</h3>
          {activityStats ? (
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { label: "Heartbeat Runs", value: activityStats.heartbeatRuns, testId: "stat-heartbeat-runs" },
                { label: "Messages", value: activityStats.transcripts, testId: "stat-transcripts" },
                { label: "Conversations", value: activityStats.conversations, testId: "stat-conversations" },
                { label: "Chain Events", value: activityStats.events, testId: "stat-events" },
                { label: "Discovery Drafts", value: activityStats.drafts, testId: "stat-drafts" },
                { label: "Promotions", value: activityStats.promotions, testId: "stat-promotions" },
                { label: "EDCM Snapshots", value: activityStats.edcmSnapshots, testId: "stat-edcm-snapshots" },
                { label: "Memory Snapshots", value: activityStats.memorySnapshots, testId: "stat-memory-snapshots" },
              ].map(stat => (
                <div key={stat.testId} className="rounded-md border border-border px-2.5 py-2 flex items-center justify-between" data-testid={stat.testId}>
                  <span className="text-[10px] text-muted-foreground">{stat.label}</span>
                  <span className="text-sm font-mono font-bold">{stat.value.toLocaleString()}</span>
                </div>
              ))}
            </div>
          ) : <Skeleton className="h-20 w-full" />}
        </div>

        {/* Heartbeat Scheduler */}
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h3 className="font-semibold text-xs flex items-center gap-2"><Clock className="w-3.5 h-3.5 text-blue-400" /> Heartbeat Scheduler</h3>
            <div className="flex items-center gap-2">
              <Badge variant={status?.running ? "default" : "secondary"} className="text-[9px]" data-testid="status-heartbeat">{status?.running ? "RUNNING" : "STOPPED"}</Badge>
              <Switch checked={status?.running || false} onCheckedChange={(checked) => toggleSchedulerMutation.mutate(checked)} data-testid="toggle-heartbeat-scheduler" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div><span className="text-muted-foreground text-[10px]">Tick Interval</span><p className="font-mono text-sm" data-testid="text-tick-interval">{status ? `${(status.tickIntervalMs / 1000).toFixed(0)}s` : "--"}</p></div>
            <div><span className="text-muted-foreground text-[10px]">Active Tasks</span><p className="font-mono text-sm" data-testid="text-active-tasks">{tasks.filter((t: any) => t.enabled).length} / {tasks.length}</p></div>
          </div>
        </div>

        {/* Task List */}
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h3 className="font-semibold text-xs flex items-center gap-2"><Activity className="w-3.5 h-3.5 text-emerald-400" /> Tasks</h3>
            {!showNewForm && editingTaskId === null && (
              <Button size="sm" variant="outline" onClick={() => setShowNewForm(true)} className="h-7 gap-1 text-[11px]" data-testid="button-new-task"><Plus className="w-3 h-3" /> New</Button>
            )}
          </div>
          {(showNewForm || editingTaskId !== null) && taskForm}
          {tasksLoading ? <Skeleton className="h-24 w-full" /> : tasks.length === 0 && !showNewForm ? (
            <p className="text-xs text-muted-foreground">No heartbeat tasks configured.</p>
          ) : (
            <div className="space-y-2 mt-2">
              {tasks.map((task: any) => {
                const isEditing = editingTaskId === task.id;
                const weightPct = totalWeight > 0 && task.enabled ? ((task.weight / totalWeight) * 100).toFixed(1) : "0";
                if (isEditing) return null;
                return (
                  <div key={task.id} className="rounded-md border border-border p-2.5 space-y-2" data-testid={`heartbeat-task-${task.name}`}>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 min-w-0">
                        <Switch checked={task.enabled} onCheckedChange={(enabled) => updateTaskMutation.mutate({ id: task.id, updates: { enabled } })} data-testid={`toggle-task-${task.name}`} className="h-4 w-7" />
                        <span className="font-mono text-xs font-bold truncate">{task.name}</span>
                        <Badge variant="secondary" className="text-[9px]">{task.taskType}</Badge>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="ghost" className="w-6 h-6" onClick={() => startEditing(task)} data-testid={`button-edit-${task.name}`}><Settings className="w-3 h-3" /></Button>
                        <Button size="icon" variant="ghost" className="w-6 h-6 text-destructive hover:text-destructive" onClick={() => deleteTaskMutation.mutate(task.id)} disabled={deleteTaskMutation.isPending} data-testid={`button-delete-${task.name}`}><Trash2 className="w-3 h-3" /></Button>
                        <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => runNowMutation.mutate(task.name)} disabled={runNowMutation.isPending} data-testid={`button-run-${task.name}`}>▶ Run</Button>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate">{task.description}</p>
                    <div className="flex items-center gap-3 text-[10px] flex-wrap">
                      <div className={cn("flex items-center gap-1.5 flex-1 min-w-[80px]", isVertical ? "flex-col" : "")}>
                        <span className="text-muted-foreground">w</span>
                        <Slider value={[task.weight]} onValueChange={([val]) => updateTaskMutation.mutate({ id: task.id, updates: { weight: val } })} min={0} max={5} step={0.1} orientation={orientation} className={cn(isVertical ? "h-[80px]" : "flex-1")} data-testid={`slider-weight-${task.name}`} />
                        <span className="font-mono">{task.weight.toFixed(1)}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-muted-foreground">every</span>
                        <Input type="number" value={task.intervalSeconds} onChange={e => updateTaskMutation.mutate({ id: task.id, updates: { intervalSeconds: parseInt(e.target.value) || 300 } })} className="text-[10px] font-mono w-14 h-6" data-testid={`input-interval-${task.name}`} />
                        <span className="text-muted-foreground">s</span>
                      </div>
                      <span className="font-mono text-muted-foreground">{task.runCount}× | {weightPct}%</span>
                    </div>
                    {task.lastRun && <p className="text-[9px] text-muted-foreground">Last: {new Date(task.lastRun).toLocaleString()}</p>}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Resource Allocation */}
        {tasks.filter((t: any) => t.enabled).length > 0 && (
          <div className="rounded-lg border border-border bg-card p-3">
            <h3 className="font-semibold text-xs mb-2 flex items-center gap-2"><Zap className="w-3.5 h-3.5 text-blue-400" /> Resource Allocation</h3>
            <div className="space-y-1.5">
              {tasks.filter((t: any) => t.enabled).map((task: any) => {
                const pct = totalWeight > 0 ? (task.weight / totalWeight) * 100 : 0;
                return (
                  <div key={task.id} className="flex items-center gap-2 text-xs" data-testid={`resource-${task.name}`}>
                    <span className="font-mono w-28 truncate text-[10px]">{task.name}</span>
                    <div className="flex-1 h-1.5 bg-background rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} /></div>
                    <span className="font-mono w-10 text-right text-[10px]">{pct.toFixed(1)}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Discovery Feed */}
        <div className="rounded-lg border border-border bg-card p-3">
          <h3 className="font-semibold text-xs mb-2 flex items-center gap-2"><Sparkles className="w-3.5 h-3.5 text-amber-400" /> Discovery Feed</h3>
          {discoveries.length === 0 ? <p className="text-xs text-muted-foreground">No discoveries yet.</p> : (
            <div className="space-y-2">
              {discoveries.slice(0, 20).map((draft: any) => (
                <div key={draft.id} className="rounded-md border border-border p-2.5 space-y-1" data-testid={`discovery-${draft.id}`}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-medium flex-1">{draft.title}</span>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <Badge variant="secondary" className="text-[9px]">{(draft.relevanceScore * 100).toFixed(0)}%</Badge>
                      {!draft.promotedToConversation ? (
                        <Button size="sm" variant="outline" className="h-6 text-[10px] px-1.5" onClick={() => promoteMutation.mutate(draft.id)} disabled={promoteMutation.isPending} data-testid={`button-promote-${draft.id}`}>Start Chat</Button>
                      ) : <Badge variant="default" className="text-[9px]">↑ chat</Badge>}
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate">{draft.summary}</p>
                  <div className="text-[9px] text-muted-foreground">{draft.sourceTask} · {new Date(draft.createdAt).toLocaleString()}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
