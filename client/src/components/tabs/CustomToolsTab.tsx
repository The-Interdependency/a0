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
import { Check, ChevronDown, ChevronRight, Play, Plus, Shield, TestTube, ToggleLeft, Trash2, Wrench, X } from "lucide-react";

interface CustomToolData {
  id: number;
  name: string;
  description: string;
  handlerType: string;
  handlerCode: string;
  parametersSchema: any;
  targetModels: string[];
  enabled: boolean;
  isGenerated: boolean;
}

const HANDLER_TYPES = [
  { value: "template", label: "Template" },
  { value: "javascript", label: "JavaScript" },
  { value: "webhook", label: "Webhook" },
];
const AVAILABLE_MODELS = ["slot_a", "slot_b", "slot_c", "all"];

export function CustomToolsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [builtinOpen, setBuiltinOpen] = useState(false);
  const [builtinFilter, setBuiltinFilter] = useState("");

  const { data: builtinTools = [] } = useQuery<{ name: string; description: string; required: string[] }[]>({ queryKey: ["/api/v1/agent/tools"], staleTime: 60000 });
  const filteredBuiltin = builtinFilter.trim() ? builtinTools.filter(t => t.name.includes(builtinFilter.toLowerCase()) || t.description.toLowerCase().includes(builtinFilter.toLowerCase())) : builtinTools;

  const [newCommand, setNewCommand] = useState("");
  const { data: allowlistData } = useQuery<{ hardcoded: string[]; extra: string[]; all: string[] }>({ queryKey: ["/api/v1/allowed-commands"] });
  const addCommandMutation = useMutation({
    mutationFn: (command: string) => apiRequest("POST", "/api/allowed-commands", { command }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/v1/allowed-commands"] }); setNewCommand(""); toast({ title: "Command added to allowlist" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const deleteCommandMutation = useMutation({
    mutationFn: (cmd: string) => apiRequest("DELETE", `/api/allowed-commands/${encodeURIComponent(cmd)}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/v1/allowed-commands"] }); toast({ title: "Command removed" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  function handleAddCommand() {
    const cmd = newCommand.trim();
    if (!cmd) return;
    if (cmd.includes(" ")) { toast({ title: "Single word only", variant: "destructive" }); return; }
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

  const { data: tools = [], isLoading } = useQuery<CustomToolData[]>({ queryKey: ["/api/v1/custom-tools"], refetchInterval: 10000 });

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
  const toggleMutation = useMutation({
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
    if (editingTool) { updateMutation.mutate({ id: editingTool.id, data: payload }); } else { createMutation.mutate(payload); }
  }
  function openTest(toolId: number) { setTestToolId(toolId); setTestArgs("{}"); setTestResult(null); setTestDialogOpen(true); }
  function runTest() {
    if (testToolId == null) return;
    let args: any;
    try { args = JSON.parse(testArgs); } catch { toast({ title: "Invalid JSON for test args", variant: "destructive" }); return; }
    testMutation.mutate({ id: testToolId, args });
  }
  function toggleModel(model: string) { setFormModels(prev => prev.includes(model) ? prev.filter(m => m !== model) : [...prev, model]); }

  if (isLoading) return <div className="p-4"><Skeleton className="h-40 w-full" /></div>;

  return (
    <div className="h-full w-full overflow-y-auto overflow-x-hidden px-3 py-3">
      <div className="space-y-4 pb-4">
        <div className="rounded-lg border border-border bg-card" data-testid="section-builtin-tools">
          <button onClick={() => setBuiltinOpen(o => !o)} className="flex items-center justify-between w-full px-3 py-2.5 text-left" data-testid="button-toggle-builtin-tools">
            <span className="font-semibold text-xs flex items-center gap-1.5 text-muted-foreground uppercase tracking-wide">
              <Wrench className="w-3.5 h-3.5 text-primary" /> Built-in Agent Tools
              <span className="ml-1 text-[10px] bg-primary/10 text-primary rounded px-1.5 py-0.5 font-mono normal-case tracking-normal">{builtinTools.length}</span>
            </span>
            {builtinOpen ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
          </button>
          {builtinOpen && (
            <div className="px-3 pb-3 space-y-2 border-t border-border pt-2">
              <input type="text" placeholder="Filter tools…" value={builtinFilter} onChange={e => setBuiltinFilter(e.target.value)} className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" data-testid="input-filter-builtin-tools" />
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {filteredBuiltin.map(t => (
                  <div key={t.name} className="rounded-md bg-muted/40 px-2.5 py-2" data-testid={`builtin-tool-${t.name}`}>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-mono text-[11px] font-semibold text-primary">{t.name}</span>
                      {t.required.length > 0 && <span className="text-[9px] text-muted-foreground">req: {t.required.join(", ")}</span>}
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-snug line-clamp-2">{t.description}</p>
                  </div>
                ))}
                {filteredBuiltin.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No tools match "{builtinFilter}"</p>}
              </div>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-3 space-y-2">
          <h3 className="font-semibold text-xs flex items-center gap-1.5 text-muted-foreground uppercase tracking-wide"><Shield className="w-3.5 h-3.5 text-primary" /> run_command Allowlist</h3>
          <div className="flex flex-wrap gap-1.5">
            {(allowlistData?.hardcoded || []).map(cmd => <span key={cmd} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-muted text-muted-foreground border border-transparent" data-testid={`badge-hardcoded-cmd-${cmd}`}>{cmd}</span>)}
            {(allowlistData?.extra || []).map(cmd => (
              <span key={cmd} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-primary/10 text-primary border border-primary/20" data-testid={`badge-extra-cmd-${cmd}`}>
                {cmd}
                <button onClick={() => deleteCommandMutation.mutate(cmd)} disabled={deleteCommandMutation.isPending} className="hover:text-destructive transition-colors ml-0.5" data-testid={`button-remove-cmd-${cmd}`}><X className="w-2.5 h-2.5" /></button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <Input value={newCommand} onChange={e => setNewCommand(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAddCommand()} placeholder="command (single word)" className="text-xs font-mono h-7 flex-1" data-testid="input-new-command" />
            <Button size="sm" onClick={handleAddCommand} disabled={!newCommand.trim() || addCommandMutation.isPending} className="h-7 px-2 text-xs" data-testid="button-add-command"><Plus className="w-3 h-3 mr-1" />Add</Button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="font-semibold text-sm flex items-center gap-2"><Wrench className="w-4 h-4 text-orange-400" /> Custom Function Calls</h3>
          <Button size="sm" onClick={() => { resetForm(); setShowForm(true); }} data-testid="button-add-tool"><Plus className="w-3.5 h-3.5 mr-1" />Add Tool</Button>
        </div>

        {showForm && (
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <h4 className="font-semibold text-sm">{editingTool ? "Edit Tool" : "New Custom Tool"}</h4>
            <div className="space-y-2">
              <div><Label className="text-xs">Name</Label><Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="my_tool" className="text-xs font-mono" data-testid="input-tool-name" /></div>
              <div><Label className="text-xs">Description</Label><Input value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="What this tool does..." className="text-xs" data-testid="input-tool-description" /></div>
              <div>
                <Label className="text-xs">Handler Type</Label>
                <Select value={formType} onValueChange={setFormType}>
                  <SelectTrigger className="text-xs" data-testid="select-handler-type"><SelectValue /></SelectTrigger>
                  <SelectContent>{HANDLER_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">{formType === "webhook" ? "Webhook URL" : formType === "javascript" ? "JavaScript Code" : "Template"}</Label>
                <Textarea value={formCode} onChange={e => setFormCode(e.target.value)} placeholder={formType === "webhook" ? "https://example.com/webhook" : formType === "javascript" ? "return `Hello ${args.name}`;" : "Hello {{name}}, your value is {{value}}"} className="text-xs font-mono min-h-[80px]" data-testid="input-tool-code" />
              </div>
              <div><Label className="text-xs">Parameters Schema (JSON)</Label><Textarea value={formSchema} onChange={e => setFormSchema(e.target.value)} placeholder='{"type":"object","properties":{"name":{"type":"string"}}}' className="text-xs font-mono min-h-[60px]" data-testid="input-tool-schema" /></div>
              <div>
                <Label className="text-xs">Target Models</Label>
                <div className="flex flex-wrap gap-3 mt-1">
                  {AVAILABLE_MODELS.map(model => (
                    <div key={model} className="flex items-center gap-1.5">
                      <Checkbox id={`model-${model}`} checked={formModels.includes(model)} onCheckedChange={() => toggleModel(model)} data-testid={`checkbox-model-${model}`} />
                      <Label htmlFor={`model-${model}`} className="text-xs font-mono cursor-pointer">{model}</Label>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">Select which models can use this tool. Leave empty for all models.</p>
              </div>
              <div className="flex items-center gap-2"><Switch checked={formEnabled} onCheckedChange={setFormEnabled} data-testid="toggle-tool-enabled" /><Label className="text-xs">Enabled</Label></div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSubmit} disabled={!formName || !formDesc || !formCode || createMutation.isPending || updateMutation.isPending} data-testid="button-save-tool"><Check className="w-3.5 h-3.5 mr-1" />{editingTool ? "Update" : "Create"}</Button>
              <Button variant="ghost" size="sm" onClick={resetForm} data-testid="button-cancel-tool">Cancel</Button>
            </div>
          </div>
        )}

        {tools.length === 0 && !showForm ? (
          <div className="rounded-lg border border-border bg-card p-6 text-center">
            <Wrench className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No custom tools defined yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Create tools with webhook, JavaScript, or template handlers that models can call during conversations.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {tools.map(tool => (
              <div key={tool.id} className={cn("rounded-lg border border-border bg-card p-3 space-y-2", !tool.enabled && "opacity-60")} data-testid={`card-tool-${tool.id}`}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="font-mono text-sm font-semibold truncate" data-testid={`text-tool-name-${tool.id}`}>{tool.name}</span>
                    <Badge variant="secondary" className="text-[9px] font-mono flex-shrink-0">{tool.handlerType}</Badge>
                    {!tool.enabled && <Badge variant="secondary" className="text-[9px] bg-amber-500/20 text-amber-400 flex-shrink-0">disabled</Badge>}
                    {tool.isGenerated && <Badge variant="secondary" className="text-[9px] bg-pink-500/20 text-pink-400 flex-shrink-0" data-testid={`badge-generated-${tool.id}`}>Generated</Badge>}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button variant="ghost" size="icon" onClick={() => toggleMutation.mutate(tool.id)} data-testid={`button-toggle-tool-${tool.id}`}><ToggleLeft className={cn("w-4 h-4", tool.enabled ? "text-green-400" : "text-muted-foreground")} /></Button>
                    <Button variant="ghost" size="icon" onClick={() => openTest(tool.id)} data-testid={`button-test-tool-${tool.id}`}><TestTube className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => startEdit(tool)} data-testid={`button-edit-tool-${tool.id}`}><Wrench className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(tool.id)} data-testid={`button-delete-tool-${tool.id}`}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{tool.description}</p>
                {tool.targetModels && tool.targetModels.length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="text-[10px] text-muted-foreground">Models:</span>
                    {tool.targetModels.map(m => <Badge key={m} variant="secondary" className="text-[9px] font-mono">{m}</Badge>)}
                  </div>
                )}
                <div className="text-[10px] font-mono text-muted-foreground bg-background rounded p-2 max-h-16 overflow-hidden">
                  {tool.handlerCode.slice(0, 200)}{tool.handlerCode.length > 200 ? "..." : ""}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={testDialogOpen} onOpenChange={setTestDialogOpen}>
        <DialogContent className="w-[90vw] max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><TestTube className="w-5 h-5" />Test Tool</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Test Arguments (JSON)</Label><Textarea value={testArgs} onChange={e => setTestArgs(e.target.value)} placeholder='{"key": "value"}' className="text-xs font-mono min-h-[60px]" data-testid="input-test-args" /></div>
            {testResult && (
              <div className={cn("rounded p-3 text-xs font-mono", testResult.success ? "bg-green-500/10 border border-green-500/20" : "bg-red-500/10 border border-red-500/20")}>
                <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                  <Badge variant="secondary" className={cn("text-[9px]", testResult.success ? "text-green-400" : "text-red-400")}>{testResult.success ? "SUCCESS" : "ERROR"}</Badge>
                  <span className="text-[10px] text-muted-foreground">{testResult.duration}ms</span>
                </div>
                <pre className="whitespace-pre-wrap max-h-40 overflow-auto text-[10px]" data-testid="text-test-result">{testResult.result}</pre>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="secondary" onClick={() => setTestDialogOpen(false)}>Close</Button>
            <Button onClick={runTest} disabled={testMutation.isPending} data-testid="button-run-test"><Play className="w-4 h-4 mr-1" />{testMutation.isPending ? "Running..." : "Run Test"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
