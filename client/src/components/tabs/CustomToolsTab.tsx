import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, ChevronRight, Play, Plus, ToggleLeft, TestTube, Trash2, Wrench, X } from "lucide-react";

const TOOL_CATEGORIES: Array<{ label: string; color: string; tools: string[]; note?: string }> = [
  { label: "Shell & Files", color: "text-green-400", tools: ["run_command", "read_file", "write_file", "list_files", "search_files"] },
  {
    label: "Web", color: "text-blue-400",
    tools: ["web_search", "fetch_url", "xai_search"],
    note: "xai_search uses live web search via XAI API (not server-side Grok — it IS a real tool call)",
  },
  { label: "GitHub", color: "text-purple-400", tools: ["github_list_repos", "github_list_files", "github_get_file", "github_create_or_update_file", "github_delete_file", "github_push_zip"] },
  { label: "Google", color: "text-amber-400", tools: ["list_gmail", "read_gmail", "send_gmail", "list_drive"] },
  { label: "Codespace", color: "text-cyan-400", tools: ["codespace_list", "codespace_create", "codespace_start", "codespace_stop", "codespace_exec", "codespace_delete"] },
  { label: "Scheduling", color: "text-orange-400", tools: ["schedule_task", "list_scheduled_tasks", "cancel_scheduled_task"] },
  { label: "Triad / State", color: "text-pink-400", tools: ["get_psi_state", "get_omega_state", "get_triad_state", "boost_psi_dimension", "boost_dimension", "set_goal", "complete_goal", "list_goals", "set_autonomy_mode", "set_selfmodel_mode"] },
  { label: "Deals", color: "text-yellow-400", tools: ["analyze_offer", "create_deal", "close_deal", "list_deals", "update_deal"] },
  { label: "Transcript", color: "text-indigo-400", tools: ["create_transcript_source", "fetch_transcript_url", "get_transcript_report", "list_transcript_sources", "scan_transcript_source"] },
  { label: "Hub / Model", color: "text-teal-400", tools: ["hub_run", "hub_list_patterns", "list_hub_connections", "list_model_registry", "update_model_registry", "get_brain_presets", "get_synthesis_config", "set_brain_preset", "set_default_brain", "set_synthesis_weights", "Council", "Daisy Chain", "Fan Out", "Roleplay", "Room (All)", "Room (Synthesized)"] },
  { label: "Module / Misc", color: "text-violet-400", tools: ["write_module", "list_agent_modules", "delete_agent_module", "generate_tool", "set_ai_welcome", "xai-grok"] },
];

interface CustomToolData {
  id: number; name: string; description: string; handlerType: string;
  handlerCode: string; parametersSchema: any; targetModels: string[]; enabled: boolean; isGenerated: boolean;
}
const HANDLER_TYPES = [{ value: "template", label: "Template" }, { value: "javascript", label: "JavaScript" }, { value: "webhook", label: "Webhook" }];
const AVAILABLE_MODELS = ["slot_a", "slot_b", "slot_c", "all"];

export function CustomToolsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [togglesOpen, setTogglesOpen] = useState(true);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [commandsOpen, setCommandsOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [newCommand, setNewCommand] = useState("");

  const { data: builtinTools = [] } = useQuery<{ name: string; description: string; required: string[] }[]>({ queryKey: ["/api/v1/agent/tools"], staleTime: 60000 });
  const { data: toolToggles = {} } = useQuery<Record<string, boolean>>({ queryKey: ["/api/v1/agent/tool-toggles"], staleTime: 5000 });
  const { data: allowlistData } = useQuery<{ hardcoded: string[]; extra: string[]; all: string[] }>({ queryKey: ["/api/v1/allowed-commands"] });

  function isEnabled(name: string) { return toolToggles[name] !== false; }
  const enabledCount = builtinTools.filter(t => isEnabled(t.name)).length;

  const bulkToggleMutation = useMutation({
    mutationFn: (updates: Record<string, boolean>) => apiRequest("PATCH", "/api/v1/agent/tool-toggles", { updates }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/v1/agent/tool-toggles"] }),
    onError: (e: any) => toast({ title: "Toggle failed", description: e.message, variant: "destructive" }),
  });

  function toggleTool(name: string) { bulkToggleMutation.mutate({ [name]: !isEnabled(name) }); }
  function toggleCat(tools: string[], enable: boolean) {
    const updates: Record<string, boolean> = {};
    for (const n of tools) updates[n] = enable;
    bulkToggleMutation.mutate(updates);
  }
  function toggleAll(enable: boolean) {
    const updates: Record<string, boolean> = {};
    for (const t of builtinTools) updates[t.name] = enable;
    bulkToggleMutation.mutate(updates);
  }
  function toggleCatExpanded(label: string) {
    setExpandedCats(prev => { const n = new Set(prev); if (n.has(label)) n.delete(label); else n.add(label); return n; });
  }

  const addCommandMutation = useMutation({
    mutationFn: (cmd: string) => apiRequest("POST", "/api/allowed-commands", { command: cmd }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/v1/allowed-commands"] }); setNewCommand(""); toast({ title: "Command added" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const deleteCommandMutation = useMutation({
    mutationFn: (cmd: string) => apiRequest("DELETE", `/api/allowed-commands/${encodeURIComponent(cmd)}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/v1/allowed-commands"] }),
  });
  function handleAddCommand() {
    const cmd = newCommand.trim();
    if (!cmd || cmd.includes(" ")) { toast({ title: "Single word only", variant: "destructive" }); return; }
    if (allowlistData?.all.includes(cmd)) { toast({ title: "Already in allowlist", variant: "destructive" }); return; }
    addCommandMutation.mutate(cmd);
  }

  const [showForm, setShowForm] = useState(false);
  const [editingTool, setEditingTool] = useState<CustomToolData | null>(null);
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [testToolId, setTestToolId] = useState<number | null>(null);
  const [testArgs, setTestArgs] = useState("{}");
  const [testResult, setTestResult] = useState<{ success: boolean; result: string; duration: number } | null>(null);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formType, setFormType] = useState("template");
  const [formCode, setFormCode] = useState("");
  const [formSchema, setFormSchema] = useState("{}");
  const [formModels, setFormModels] = useState<string[]>([]);
  const [formEnabled, setFormEnabled] = useState(true);

  const { data: tools = [], isLoading: toolsLoading } = useQuery<CustomToolData[]>({ queryKey: ["/api/v1/custom-tools"], refetchInterval: 10000 });
  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/custom-tools", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/v1/custom-tools"] }); toast({ title: "Tool created" }); resetForm(); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PATCH", `/api/custom-tools/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/v1/custom-tools"] }); toast({ title: "Tool updated" }); resetForm(); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/custom-tools/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/v1/custom-tools"] }); toast({ title: "Tool deleted" }); },
  });
  const customToggleMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/custom-tools/${id}/toggle`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/v1/custom-tools"] }),
  });
  const testMutation = useMutation({
    mutationFn: ({ id, args }: { id: number; args: any }) => apiRequest("POST", `/api/custom-tools/${id}/test`, { args }),
    onSuccess: async (response: any) => { const data = await response.json(); setTestResult(data); },
    onError: (e: any) => setTestResult({ success: false, result: e.message, duration: 0 }),
  });

  function resetForm() { setShowForm(false); setEditingTool(null); setFormName(""); setFormDesc(""); setFormType("template"); setFormCode(""); setFormSchema("{}"); setFormModels([]); setFormEnabled(true); }
  function startEdit(tool: CustomToolData) { setEditingTool(tool); setFormName(tool.name); setFormDesc(tool.description); setFormType(tool.handlerType); setFormCode(tool.handlerCode); setFormSchema(tool.parametersSchema ? JSON.stringify(tool.parametersSchema, null, 2) : "{}"); setFormModels(tool.targetModels || []); setFormEnabled(tool.enabled); setShowForm(true); }
  function handleSubmit() {
    let parsedSchema: any = null;
    try { parsedSchema = JSON.parse(formSchema); } catch { toast({ title: "Invalid JSON in parameters schema", variant: "destructive" }); return; }
    const payload = { name: formName, description: formDesc, handlerType: formType, handlerCode: formCode, parametersSchema: parsedSchema, targetModels: formModels.length > 0 ? formModels : [], enabled: formEnabled };
    if (editingTool) updateMutation.mutate({ id: editingTool.id, data: payload }); else createMutation.mutate(payload);
  }
  function openTest(toolId: number) { setTestToolId(toolId); setTestArgs("{}"); setTestResult(null); setTestDialogOpen(true); }
  function runTest() {
    if (testToolId == null) return;
    let args: any;
    try { args = JSON.parse(testArgs); } catch { toast({ title: "Invalid JSON for test args", variant: "destructive" }); return; }
    testMutation.mutate({ id: testToolId, args });
  }
  function toggleModel(model: string) { setFormModels(prev => prev.includes(model) ? prev.filter(m => m !== model) : [...prev, model]); }

  return (
    <div className="h-full w-full overflow-y-auto overflow-x-hidden px-3 py-3">
      <div className="space-y-3 pb-4">

        {/* Built-in Tool Toggles */}
        <div className="rounded-lg border border-border bg-card overflow-hidden" data-testid="section-tool-toggles">
          <button onClick={() => setTogglesOpen(o => !o)} className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-accent/50 transition-colors" data-testid="button-toggle-builtin-section">
            {togglesOpen ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
            <Wrench className="w-3.5 h-3.5 text-primary flex-shrink-0" />
            <span className="text-xs font-semibold flex-1">Built-in Tool Set</span>
            <Badge variant="outline" className="text-[9px]">{enabledCount}/{builtinTools.length} active</Badge>
          </button>
          {togglesOpen && (
            <div className="border-t border-border px-3 py-2.5 space-y-2.5">
              <div className="flex items-center gap-2">
                <p className="text-[10px] text-muted-foreground flex-1">Controls which tools are sent as function definitions each request. ~45 tokens each.</p>
                <button onClick={() => toggleAll(true)} className="text-[10px] text-accent hover:underline flex-shrink-0" data-testid="button-all-on">all on</button>
                <span className="text-muted-foreground text-[10px]">·</span>
                <button onClick={() => toggleAll(false)} className="text-[10px] text-muted-foreground hover:text-foreground hover:underline flex-shrink-0" data-testid="button-all-off">all off</button>
              </div>
              <div className="space-y-1.5">
                {TOOL_CATEGORIES.map(cat => {
                  const catOn = cat.tools.filter(isEnabled).length;
                  const isExp = expandedCats.has(cat.label);
                  return (
                    <div key={cat.label} className="rounded-md border border-border overflow-hidden">
                      <div className="flex items-center gap-2 px-2 py-1.5">
                        <button onClick={() => toggleCatExpanded(cat.label)} className="flex items-center gap-1.5 flex-1 text-left min-w-0" data-testid={`button-cat-${cat.label}`}>
                          {isExp ? <ChevronDown className="w-3 h-3 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
                          <span className={cn("text-[11px] font-semibold", cat.color)}>{cat.label}</span>
                          <span className="text-[9px] text-muted-foreground ml-auto">{catOn}/{cat.tools.length}</span>
                        </button>
                        <Switch checked={catOn === cat.tools.length} onCheckedChange={(v) => toggleCat(cat.tools, v)} className="flex-shrink-0 h-4 w-7" data-testid={`toggle-cat-${cat.label}`} />
                      </div>
                      {cat.note && <p className="px-7 pb-1.5 text-[9px] text-amber-400/70 italic">{cat.note}</p>}
                      {isExp && (
                        <div className="border-t border-border px-2 py-1.5 space-y-1 bg-muted/20">
                          {cat.tools.map(name => (
                            <div key={name} className="flex items-center gap-2">
                              <Switch checked={isEnabled(name)} onCheckedChange={() => toggleTool(name)} className="h-3.5 w-6" data-testid={`toggle-tool-${name}`} />
                              <span className={cn("text-[10px] font-mono flex-1 truncate", !isEnabled(name) && "text-muted-foreground line-through")}>{name}</span>
                              {!isEnabled(name) && <span className="text-[9px] text-green-500/70 flex-shrink-0">−45tok</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Shell Allowlist */}
        <div className="rounded-lg border border-border bg-card overflow-hidden" data-testid="section-allowlist">
          <button onClick={() => setCommandsOpen(o => !o)} className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-accent/50 transition-colors" data-testid="button-toggle-commands">
            {commandsOpen ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
            <span className="text-xs font-semibold flex-1">Shell Command Allowlist</span>
            <Badge variant="outline" className="text-[9px]">{allowlistData?.all.length ?? "—"}</Badge>
          </button>
          {commandsOpen && (
            <div className="border-t border-border px-3 py-2.5 space-y-2">
              <p className="text-[10px] text-muted-foreground">Commands a0 may pass to run_command. Hardcoded ones cannot be removed.</p>
              <div className="flex gap-1.5">
                <Input value={newCommand} onChange={e => setNewCommand(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAddCommand()} placeholder="add command…" className="h-7 text-xs font-mono flex-1" data-testid="input-new-command" />
                <Button size="sm" className="h-7 px-2" onClick={handleAddCommand} disabled={addCommandMutation.isPending} data-testid="button-add-command"><Plus className="w-3 h-3" /></Button>
              </div>
              {allowlistData && (
                <div className="flex flex-wrap gap-1">
                  {allowlistData.hardcoded.map(cmd => <span key={cmd} className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-muted text-muted-foreground" data-testid={`cmd-hard-${cmd}`}>{cmd}</span>)}
                  {allowlistData.extra.map(cmd => (
                    <span key={cmd} className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-mono bg-primary/10 text-primary" data-testid={`cmd-extra-${cmd}`}>
                      {cmd}
                      <button onClick={() => deleteCommandMutation.mutate(cmd)} className="ml-0.5 hover:text-destructive" data-testid={`btn-rm-${cmd}`}><X className="w-2.5 h-2.5" /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Custom / AI-Generated Tools */}
        <div className="rounded-lg border border-border bg-card overflow-hidden" data-testid="section-custom-tools">
          <button onClick={() => setCustomOpen(o => !o)} className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-accent/50 transition-colors" data-testid="button-toggle-custom-tools">
            {customOpen ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
            <span className="text-xs font-semibold flex-1">Custom / AI-Generated Tools</span>
            <Badge variant="outline" className="text-[9px]">{tools.length}</Badge>
          </button>
          {customOpen && (
            <div className="border-t border-border p-3 space-y-3">
              {!showForm && (
                <Button size="sm" variant="outline" onClick={() => { resetForm(); setShowForm(true); }} className="gap-1 w-full" data-testid="button-add-tool">
                  <Plus className="w-3 h-3" /> Add Custom Tool
                </Button>
              )}
              {showForm && (
                <div className="rounded-md border border-border p-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold">{editingTool ? "Edit Tool" : "New Custom Tool"}</h4>
                    <Button size="icon" variant="ghost" className="w-6 h-6" onClick={resetForm} data-testid="button-cancel-tool-form"><X className="w-3 h-3" /></Button>
                  </div>
                  {!editingTool && <div><Label className="text-[10px]">Name</Label><Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="my_tool" className="text-xs font-mono h-7 mt-0.5" data-testid="input-tool-name" /></div>}
                  <div><Label className="text-[10px]">Description</Label><Input value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="What this tool does..." className="text-xs h-7 mt-0.5" data-testid="input-tool-description" /></div>
                  <div>
                    <Label className="text-[10px]">Handler Type</Label>
                    <Select value={formType} onValueChange={setFormType}>
                      <SelectTrigger className="text-xs h-7 mt-0.5" data-testid="select-handler-type"><SelectValue /></SelectTrigger>
                      <SelectContent>{HANDLER_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-[10px]">{formType === "webhook" ? "Webhook URL" : "Code / Template"}</Label><Textarea value={formCode} onChange={e => setFormCode(e.target.value)} className="text-xs font-mono min-h-[60px] mt-0.5" data-testid="input-tool-code" /></div>
                  <div><Label className="text-[10px]">Parameters Schema (JSON)</Label><Textarea value={formSchema} onChange={e => setFormSchema(e.target.value)} className="text-xs font-mono min-h-[50px] mt-0.5" data-testid="input-tool-schema" /></div>
                  <div>
                    <Label className="text-[10px]">Target Models</Label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {AVAILABLE_MODELS.map(model => (
                        <div key={model} className="flex items-center gap-1">
                          <Checkbox id={`model-${model}`} checked={formModels.includes(model)} onCheckedChange={() => toggleModel(model)} data-testid={`checkbox-model-${model}`} />
                          <Label htmlFor={`model-${model}`} className="text-[10px] font-mono cursor-pointer">{model}</Label>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2"><Switch checked={formEnabled} onCheckedChange={setFormEnabled} data-testid="toggle-tool-enabled" /><Label className="text-[10px]">Enabled</Label></div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSubmit} disabled={(!formName && !editingTool) || !formDesc || !formCode || createMutation.isPending || updateMutation.isPending} data-testid="button-save-tool"><Check className="w-3 h-3 mr-1" />{editingTool ? "Update" : "Create"}</Button>
                    <Button variant="ghost" size="sm" onClick={resetForm} data-testid="button-cancel-tool">Cancel</Button>
                  </div>
                </div>
              )}
              {toolsLoading && <Skeleton className="h-10 w-full" />}
              {tools.length === 0 && !showForm && <p className="text-xs text-muted-foreground text-center py-3">No custom tools yet. a0 can generate tools via generate_tool.</p>}
              {tools.map(tool => (
                <div key={tool.id} className={cn("rounded-md border border-border p-2.5 space-y-1", !tool.enabled && "opacity-60")} data-testid={`card-tool-${tool.id}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-semibold truncate flex-1" data-testid={`text-tool-name-${tool.id}`}>{tool.name}</span>
                    <Badge variant="secondary" className="text-[9px] font-mono">{tool.handlerType}</Badge>
                    {tool.isGenerated && <Badge variant="secondary" className="text-[9px] bg-pink-500/20 text-pink-400" data-testid={`badge-generated-${tool.id}`}>AI</Badge>}
                    {!tool.enabled && <Badge variant="secondary" className="text-[9px] bg-amber-500/20 text-amber-400">off</Badge>}
                    <div className="flex items-center gap-0.5">
                      <Button variant="ghost" size="icon" className="w-6 h-6" onClick={() => customToggleMutation.mutate(tool.id)} data-testid={`button-toggle-tool-${tool.id}`}><ToggleLeft className={cn("w-3.5 h-3.5", tool.enabled ? "text-green-400" : "text-muted-foreground")} /></Button>
                      <Button variant="ghost" size="icon" className="w-6 h-6" onClick={() => openTest(tool.id)} data-testid={`button-test-tool-${tool.id}`}><TestTube className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="w-6 h-6" onClick={() => startEdit(tool)} data-testid={`button-edit-tool-${tool.id}`}><Wrench className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="w-6 h-6 text-destructive hover:text-destructive" onClick={() => deleteMutation.mutate(tool.id)} data-testid={`button-delete-tool-${tool.id}`}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate">{tool.description}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Dialog open={testDialogOpen} onOpenChange={setTestDialogOpen}>
        <DialogContent className="w-[90vw] max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-sm"><TestTube className="w-4 h-4" />Test Tool</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <div><Label className="text-xs">Arguments (JSON)</Label><Textarea value={testArgs} onChange={e => setTestArgs(e.target.value)} placeholder='{"key": "value"}' className="text-xs font-mono min-h-[60px]" data-testid="input-test-args" /></div>
            {testResult && (
              <div className={cn("rounded p-2 text-[10px] font-mono", testResult.success ? "bg-green-500/10 border border-green-500/20" : "bg-red-500/10 border border-red-500/20")}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className={cn("font-semibold", testResult.success ? "text-green-400" : "text-red-400")}>{testResult.success ? "SUCCESS" : "FAILED"}</span>
                  <span className="text-muted-foreground">{testResult.duration}ms</span>
                </div>
                <pre className="whitespace-pre-wrap max-h-32 overflow-auto" data-testid="text-test-result">{testResult.result}</pre>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="secondary" size="sm" onClick={() => setTestDialogOpen(false)}>Close</Button>
            <Button size="sm" onClick={runTest} disabled={testMutation.isPending} data-testid="button-run-test"><Play className="w-3 h-3 mr-1" />{testMutation.isPending ? "Running…" : "Run Test"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
