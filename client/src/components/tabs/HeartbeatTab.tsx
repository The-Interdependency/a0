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
import { Activity, Check, Clock, Play, Plus, Settings, Sparkles, Trash2, X, Zap } from "lucide-react";
import { type SliderOrientationProps } from "@/lib/console-config";

export function HeartbeatTab({ orientation, isVertical }: SliderOrientationProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const BUILTIN_TASKS = ["transcript_search", "github_search", "ai_social_search", "x_monitor"];

  const [showNewForm, setShowNewForm] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formType, setFormType] = useState("custom");
  const [formWeight, setFormWeight] = useState(1.0);
  const [formInterval, setFormInterval] = useState(300);
  const [formEnabled, setFormEnabled] = useState(true);
  const [formHandlerCode, setFormHandlerCode] = useState("");

  const { data: activityStats } = useQuery<{
    heartbeatRuns: number; transcripts: number; conversations: number; events: number;
    drafts: number; promotions: number; edcmSnapshots: number; memorySnapshots: number;
  }>({ queryKey: ["/api/v1/heartbeat/stats"], refetchInterval: 10000 });

  const { data: status } = useQuery<{ running: boolean; tickIntervalMs: number }>({ queryKey: ["/api/v1/heartbeat/status"], refetchInterval: 10000 });
  const { data: tasks = [], isLoading: tasksLoading } = useQuery<any[]>({ queryKey: ["/api/v1/heartbeat/tasks"], refetchInterval: 10000 });
  const { data: discoveries = [] } = useQuery<any[]>({ queryKey: ["/api/v1/discoveries"], refetchInterval: 10000 });

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
    if (editingTaskId !== null) { updateTaskMutation.mutate({ id: editingTaskId, updates: payload }); }
    else { createTaskMutation.mutate({ name: formName, ...payload }); }
  }

  const totalWeight = tasks.reduce((sum: number, t: any) => sum + (t.enabled ? t.weight : 0), 0);

  const taskForm = (
    <div className="rounded-md border border-border p-3 space-y-3" data-testid="heartbeat-task-form">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h4 className="text-xs font-semibold">{editingTaskId !== null ? "Edit Task" : "New Task"}</h4>
        <Button size="icon" variant="ghost" onClick={resetForm} data-testid="button-cancel-task-form"><X className="w-3 h-3" /></Button>
      </div>
      {editingTaskId === null && (
        <div><Label className="text-[10px]">Name</Label><Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="my_custom_task" className="text-xs font-mono mt-0.5" data-testid="input-task-name" /></div>
      )}
      <div><Label className="text-[10px]">Description</Label><Input value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="What this task does..." className="text-xs mt-0.5" data-testid="input-task-desc" /></div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[10px]">Task Type</Label>
          <Select value={formType} onValueChange={setFormType}>
            <SelectTrigger className="text-xs mt-0.5" data-testid="select-task-type"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="custom">Custom</SelectItem>
              <SelectItem value="transcript_search">Transcript Search</SelectItem>
              <SelectItem value="github_search">GitHub Search</SelectItem>
              <SelectItem value="ai_social_search">AI Social Search</SelectItem>
              <SelectItem value="x_monitor">X Monitor</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><Label className="text-[10px]">Interval (seconds)</Label><Input type="number" value={formInterval} onChange={e => setFormInterval(parseInt(e.target.value) || 300)} className="text-xs font-mono mt-0.5" data-testid="input-task-interval" /></div>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[120px]">
          <Label className="text-[10px]">Weight</Label>
          <div className={cn(isVertical ? "flex flex-col items-center gap-1 mt-0.5" : "flex items-center gap-2 mt-0.5")}>
            <Slider value={[formWeight]} onValueChange={([v]) => setFormWeight(v)} min={0} max={5} step={0.1} orientation={orientation} className={cn(isVertical ? "h-[120px]" : "flex-1")} data-testid="slider-task-weight" />
            <span className="text-[10px] font-mono">{formWeight.toFixed(1)}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 pt-3"><Switch checked={formEnabled} onCheckedChange={setFormEnabled} data-testid="toggle-task-enabled" /><Label className="text-[10px]">Enabled</Label></div>
      </div>
      {formType === "custom" && (
        <div><Label className="text-[10px]">Handler Code</Label><Textarea value={formHandlerCode} onChange={e => setFormHandlerCode(e.target.value)} placeholder="// JavaScript handler..." className="text-xs font-mono mt-0.5 min-h-[80px]" data-testid="textarea-handler-code" /></div>
      )}
      <Button size="sm" onClick={handleSubmit} disabled={(!formName && editingTaskId === null) || createTaskMutation.isPending || updateTaskMutation.isPending} className="w-full gap-1" data-testid="button-submit-task">
        <Check className="w-3 h-3" />{editingTaskId !== null ? "Save Changes" : "Create Task"}
      </Button>
    </div>
  );

  return (
    <div className="h-full w-full overflow-y-auto overflow-x-hidden px-3 py-3">
      <div className="space-y-4 pb-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><Sparkles className="w-4 h-4 text-amber-400" /> Activity Stats</h3>
          {activityStats ? (
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Heartbeat Runs", value: activityStats.heartbeatRuns, testId: "stat-heartbeat-runs" },
                { label: "Messages", value: activityStats.transcripts, testId: "stat-transcripts" },
                { label: "Conversations", value: activityStats.conversations, testId: "stat-conversations" },
                { label: "Chain Events", value: activityStats.events, testId: "stat-events" },
                { label: "Discovery Drafts", value: activityStats.drafts, testId: "stat-drafts" },
                { label: "Promotions", value: activityStats.promotions, testId: "stat-promotions" },
                { label: "EDCM Snapshots", value: activityStats.edcmSnapshots, testId: "stat-edcm-snapshots" },
                { label: "Memory Snapshots", value: activityStats.memorySnapshots, testId: "stat-memory-snapshots" },
              ].map((stat) => (
                <div key={stat.testId} className="rounded-md border border-border p-2.5 flex items-center justify-between gap-2" data-testid={stat.testId}>
                  <span className="text-[10px] text-muted-foreground">{stat.label}</span>
                  <span className="text-sm font-mono font-bold">{stat.value.toLocaleString()}</span>
                </div>
              ))}
            </div>
          ) : <Skeleton className="h-24 w-full" />}
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
            <h3 className="font-semibold text-sm flex items-center gap-2"><Clock className="w-4 h-4 text-blue-400" /> Heartbeat Scheduler</h3>
            <div className="flex items-center gap-2">
              <Badge variant={status?.running ? "default" : "secondary"} data-testid="status-heartbeat">{status?.running ? "RUNNING" : "STOPPED"}</Badge>
              <Switch checked={status?.running || false} onCheckedChange={(checked) => toggleSchedulerMutation.mutate(checked)} data-testid="toggle-heartbeat-scheduler" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div><span className="text-muted-foreground">Tick Interval</span><p className="font-mono" data-testid="text-tick-interval">{status ? `${(status.tickIntervalMs / 1000).toFixed(0)}s` : "--"}</p></div>
            <div><span className="text-muted-foreground">Active Tasks</span><p className="font-mono" data-testid="text-active-tasks">{tasks.filter((t: any) => t.enabled).length} / {tasks.length}</p></div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
            <h3 className="font-semibold text-sm flex items-center gap-2"><Activity className="w-4 h-4 text-emerald-400" /> Task List</h3>
            {!showNewForm && editingTaskId === null && (
              <Button size="sm" variant="outline" onClick={() => setShowNewForm(true)} className="gap-1" data-testid="button-new-task"><Plus className="w-3 h-3" /> New Task</Button>
            )}
          </div>
          {(showNewForm || editingTaskId !== null) && taskForm}
          {tasksLoading ? <Skeleton className="h-32 w-full" /> : tasks.length === 0 && !showNewForm ? (
            <p className="text-xs text-muted-foreground">No heartbeat tasks configured.</p>
          ) : (
            <div className="space-y-3 mt-3">
              {tasks.map((task: any) => {
                const isBuiltin = BUILTIN_TASKS.includes(task.name);
                const isEditing = editingTaskId === task.id;
                const weightPct = totalWeight > 0 && task.enabled ? ((task.weight / totalWeight) * 100).toFixed(1) : "0";
                if (isEditing) return null;
                return (
                  <div key={task.id} className="rounded-md border border-border p-3 space-y-2" data-testid={`heartbeat-task-${task.name}`}>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 min-w-0 flex-wrap">
                        <Switch checked={task.enabled} onCheckedChange={(enabled) => updateTaskMutation.mutate({ id: task.id, updates: { enabled } })} data-testid={`toggle-task-${task.name}`} />
                        <span className="font-mono text-xs font-bold truncate">{task.name}</span>
                        <Badge variant="secondary" className="text-[9px]">{task.taskType}</Badge>
                        {isBuiltin && <Badge variant="outline" className="text-[8px]">Built-in</Badge>}
                      </div>
                      <div className="flex items-center gap-1">
                        {!isBuiltin && (
                          <>
                            <Button size="icon" variant="ghost" onClick={() => startEditing(task)} data-testid={`button-edit-${task.name}`}><Settings className="w-3 h-3" /></Button>
                            <Button size="icon" variant="ghost" onClick={() => deleteTaskMutation.mutate(task.id)} disabled={deleteTaskMutation.isPending} data-testid={`button-delete-${task.name}`}><Trash2 className="w-3 h-3" /></Button>
                          </>
                        )}
                        <Button size="sm" variant="outline" onClick={() => runNowMutation.mutate(task.name)} disabled={runNowMutation.isPending} data-testid={`button-run-${task.name}`}><Play className="w-3 h-3 mr-1" /> Run Now</Button>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground">{task.description}</p>
                    <div className="grid grid-cols-3 gap-2 text-[10px]">
                      <div>
                        <span className="text-muted-foreground">Weight</span>
                        <div className={cn(isVertical ? "flex flex-col items-center gap-1 mt-0.5" : "flex items-center gap-1 mt-0.5")}>
                          <Slider value={[task.weight]} onValueChange={([val]) => updateTaskMutation.mutate({ id: task.id, updates: { weight: val } })} min={0} max={5} step={0.1} orientation={orientation} className={cn(isVertical ? "h-[120px]" : "flex-1")} data-testid={`slider-weight-${task.name}`} />
                          <span className="font-mono">{task.weight.toFixed(1)}</span>
                        </div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Interval</span>
                        <Input type="number" value={task.intervalSeconds} onChange={e => updateTaskMutation.mutate({ id: task.id, updates: { intervalSeconds: parseInt(e.target.value) || 300 } })} className="text-[10px] font-mono mt-0.5" data-testid={`input-interval-${task.name}`} />
                      </div>
                      <div><span className="text-muted-foreground">Runs / Share</span><p className="font-mono mt-0.5">{task.runCount} / {weightPct}%</p></div>
                    </div>
                    {task.lastRun && <div className="text-[10px] text-muted-foreground">Last run: {new Date(task.lastRun).toLocaleString()}{task.lastResult && !task.lastResult.startsWith("handler:") && <span className="block truncate">{task.lastResult}</span>}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><Zap className="w-4 h-4 text-blue-400" /> Resource Allocation</h3>
          {tasks.filter((t: any) => t.enabled).length === 0 ? <p className="text-xs text-muted-foreground">No enabled tasks.</p> : (
            <div className="space-y-1.5">
              {tasks.filter((t: any) => t.enabled).map((task: any) => {
                const pct = totalWeight > 0 ? (task.weight / totalWeight) * 100 : 0;
                return (
                  <div key={task.id} className="flex items-center gap-2 text-xs" data-testid={`resource-${task.name}`}>
                    <span className="font-mono w-28 truncate">{task.name}</span>
                    <div className="flex-1 h-2 bg-background rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} /></div>
                    <span className="font-mono w-12 text-right">{pct.toFixed(1)}%</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><Sparkles className="w-4 h-4 text-amber-400" /> Discovery Feed</h3>
          {discoveries.length === 0 ? <p className="text-xs text-muted-foreground">No discoveries yet. Heartbeat tasks will surface notable findings here.</p> : (
            <div className="space-y-2">
              {discoveries.slice(0, 20).map((draft: any) => (
                <div key={draft.id} className="rounded-md border border-border p-2.5 space-y-1" data-testid={`discovery-${draft.id}`}>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs font-medium truncate flex-1">{draft.title}</span>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <Badge variant="secondary" className="text-[9px]">{(draft.relevanceScore * 100).toFixed(0)}%</Badge>
                      {!draft.promotedToConversation ? (
                        <Button size="sm" variant="outline" onClick={() => promoteMutation.mutate(draft.id)} disabled={promoteMutation.isPending} data-testid={`button-promote-${draft.id}`}>Start Conversation</Button>
                      ) : <Badge variant="default" className="text-[9px]">Promoted</Badge>}
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate">{draft.summary}</p>
                  <div className="flex items-center gap-2 text-[9px] text-muted-foreground"><span>{draft.sourceTask}</span><span>{new Date(draft.createdAt).toLocaleString()}</span></div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
