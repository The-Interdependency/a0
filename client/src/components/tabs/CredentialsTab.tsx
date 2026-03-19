import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Check, Eye, EyeOff, Key, Plus, Shield, Sparkles, Trash2, X } from "lucide-react";

const AI_PROVIDERS = [
  { id: "openai", label: "OpenAI", placeholder: "sk-..." },
  { id: "anthropic", label: "Anthropic", placeholder: "sk-ant-..." },
  { id: "openrouter", label: "OpenRouter", placeholder: "sk-or-..." },
];

const CREDENTIAL_TEMPLATES = [
  { id: "ai_hub", name: "Multi-Model AI Hub", category: "ai", fields: [{ label: "Endpoint URL", key: "endpoint_url" }, { label: "API Key", key: "api_key" }, { label: "Default Model", key: "default_model" }] },
  { id: "google_cloud", name: "Google Cloud Project", category: "cloud", fields: [{ label: "Project ID", key: "project_id" }, { label: "API Key", key: "api_key" }, { label: "Service Account JSON", key: "service_account_json" }] },
  { id: "firebase", name: "Firebase", category: "cloud", fields: [{ label: "Project ID", key: "project_id" }, { label: "API Key", key: "api_key" }, { label: "Auth Domain", key: "auth_domain" }] },
  { id: "aws", name: "AWS", category: "cloud", fields: [{ label: "Access Key ID", key: "access_key_id" }, { label: "Secret Access Key", key: "secret_access_key" }, { label: "Region", key: "region" }] },
  { id: "custom", name: "Custom Service", category: "custom", fields: [] as { label: string; key: string }[] },
] as const;

export function CredentialsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showNewCred, setShowNewCred] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [credServiceName, setCredServiceName] = useState("");
  const [credFields, setCredFields] = useState<{ label: string; key: string; value: string }[]>([]);
  const [customFieldLabel, setCustomFieldLabel] = useState("");
  const [showNewSecret, setShowNewSecret] = useState(false);
  const [secretName, setSecretName] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [secretValue, setSecretValue] = useState("");
  const [secretCategory, setSecretCategory] = useState("general");
  const [visibleFields, setVisibleFields] = useState<Set<string>>(new Set());
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});

  const { data: credentials = [], isLoading: credsLoading } = useQuery<any[]>({ queryKey: ["/api/v1/credentials"] });
  const { data: secrets = [], isLoading: secretsLoading } = useQuery<any[]>({ queryKey: ["/api/v1/secrets"] });
  const { data: savedKeys = {} } = useQuery<Record<string, string>>({ queryKey: ["/api/v1/keys"] });

  const saveKeyMutation = useMutation({
    mutationFn: async ({ provider, key }: { provider: string; key: string }) => { await apiRequest("POST", "/api/keys", { provider, key }); },
    onSuccess: (_, { provider, key }) => { queryClient.invalidateQueries({ queryKey: ["/api/v1/keys"] }); setKeyInputs(prev => ({ ...prev, [provider]: "" })); toast({ title: key ? `${provider} key saved` : `${provider} key removed` }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const addCredMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/credentials", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/v1/credentials"] }); setShowNewCred(false); resetCredForm(); toast({ title: "Credential saved" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const deleteCredMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/credentials/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/v1/credentials"] }); toast({ title: "Credential deleted" }); },
  });
  const addSecretMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/secrets", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/v1/secrets"] }); setShowNewSecret(false); setSecretName(""); setSecretKey(""); setSecretValue(""); setSecretCategory("general"); toast({ title: "Secret saved" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const deleteSecretMutation = useMutation({
    mutationFn: (key: string) => apiRequest("DELETE", `/api/secrets/${encodeURIComponent(key)}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/v1/secrets"] }); toast({ title: "Secret deleted" }); },
  });

  function resetCredForm() { setSelectedTemplate(""); setCredServiceName(""); setCredFields([]); setCustomFieldLabel(""); }
  function handleTemplateSelect(templateId: string) {
    setSelectedTemplate(templateId);
    const tmpl = CREDENTIAL_TEMPLATES.find(t => t.id === templateId);
    if (tmpl) { setCredServiceName(tmpl.id === "custom" ? "" : tmpl.name); setCredFields([...tmpl.fields].map(f => ({ label: f.label, key: f.key, value: "" }))); }
  }
  function addCustomField() { if (!customFieldLabel.trim()) return; const key = customFieldLabel.trim().toLowerCase().replace(/\s+/g, "_"); setCredFields(prev => [...prev, { label: customFieldLabel.trim(), key, value: "" }]); setCustomFieldLabel(""); }
  function removeCustomField(idx: number) { setCredFields(prev => prev.filter((_, i) => i !== idx)); }
  function toggleFieldVisibility(fieldId: string) { setVisibleFields(prev => { const next = new Set(prev); if (next.has(fieldId)) next.delete(fieldId); else next.add(fieldId); return next; }); }
  function handleSaveCred() {
    if (!credServiceName.trim() || credFields.length === 0) return;
    const tmpl = CREDENTIAL_TEMPLATES.find(t => t.id === selectedTemplate);
    addCredMutation.mutate({ serviceName: credServiceName.trim(), category: tmpl?.category || "custom", template: selectedTemplate || "custom", fields: credFields });
  }

  return (
    <ScrollArea className="h-full px-3 py-3">
      <div className="space-y-4 pb-4">
        <div className="rounded-lg border border-primary/20 bg-card p-4">
          <h3 className="font-semibold text-sm mb-1 flex items-center gap-2"><Key className="w-4 h-4 text-primary" /> AI Provider Keys</h3>
          <p className="text-[10px] text-muted-foreground mb-3">Bring your own keys for additional AI providers. Gemini and Grok are built-in.</p>
          <div className="space-y-3">
            {AI_PROVIDERS.map(p => {
              const existing = savedKeys[p.id];
              return (
                <div key={p.id} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">{p.label}</span>
                    {existing && (
                      <div className="flex items-center gap-1">
                        <Badge variant="secondary" className="text-[9px] font-mono">{existing}</Badge>
                        <Button variant="ghost" size="icon" onClick={() => saveKeyMutation.mutate({ provider: p.id, key: "" })} data-testid={`button-remove-key-${p.id}`}><X className="w-3 h-3 text-destructive" /></Button>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Input type="password" placeholder={p.placeholder} value={keyInputs[p.id] || ""} onChange={e => setKeyInputs(prev => ({ ...prev, [p.id]: e.target.value }))} className="text-xs font-mono" data-testid={`input-key-${p.id}`} />
                    <Button size="sm" variant="secondary" disabled={!keyInputs[p.id]?.trim() || saveKeyMutation.isPending} onClick={() => saveKeyMutation.mutate({ provider: p.id, key: keyInputs[p.id]!.trim() })} data-testid={`button-save-key-${p.id}`}>Save</Button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 rounded bg-background p-2">
            <p className="text-[9px] text-muted-foreground">Built-in: Gemini 2.5 Flash, Grok-3 Mini. BYO keys enable future model routing. Keys are stored server-side per session.</p>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
            <h3 className="font-semibold text-sm flex items-center gap-2"><Shield className="w-4 h-4 text-blue-400" /> Service Credentials</h3>
            <Button size="sm" variant="outline" onClick={() => { setShowNewCred(!showNewCred); if (showNewCred) resetCredForm(); }} data-testid="button-new-credential">
              <Plus className="w-3.5 h-3.5 mr-1" />{showNewCred ? "Cancel" : "Add Service"}
            </Button>
          </div>

          {showNewCred && (
            <div className="rounded-md border border-border p-3 space-y-3 mb-3">
              <div className="space-y-1">
                <Label className="text-xs">Template</Label>
                <Select value={selectedTemplate} onValueChange={handleTemplateSelect}>
                  <SelectTrigger className="text-xs" data-testid="select-credential-template"><SelectValue placeholder="Choose a template..." /></SelectTrigger>
                  <SelectContent>{CREDENTIAL_TEMPLATES.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {selectedTemplate && (
                <>
                  <div className="space-y-1">
                    <Label className="text-xs">Service Name</Label>
                    <Input value={credServiceName} onChange={e => setCredServiceName(e.target.value)} className="text-xs" placeholder="My AI Hub" data-testid="input-credential-name" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Fields</Label>
                    {credFields.map((field, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground w-28 flex-shrink-0 truncate">{field.label}</span>
                        <Input type="password" value={field.value} onChange={e => { const u = [...credFields]; u[idx] = { ...u[idx], value: e.target.value }; setCredFields(u); }} className="text-xs font-mono" placeholder={`Enter ${field.label.toLowerCase()}`} data-testid={`input-cred-field-${field.key}`} />
                        {selectedTemplate === "custom" && <Button size="icon" variant="ghost" onClick={() => removeCustomField(idx)} data-testid={`button-remove-field-${idx}`}><X className="w-3 h-3 text-destructive" /></Button>}
                      </div>
                    ))}
                  </div>
                  {selectedTemplate === "custom" && (
                    <div className="flex items-center gap-2">
                      <Input value={customFieldLabel} onChange={e => setCustomFieldLabel(e.target.value)} className="text-xs" placeholder="New field label" data-testid="input-custom-field-label" onKeyDown={e => { if (e.key === "Enter") addCustomField(); }} />
                      <Button size="sm" variant="outline" onClick={addCustomField} data-testid="button-add-custom-field"><Plus className="w-3 h-3 mr-1" />Add</Button>
                    </div>
                  )}
                  <Button className="w-full" onClick={handleSaveCred} disabled={!credServiceName.trim() || credFields.length === 0 || addCredMutation.isPending} data-testid="button-save-credential">
                    <Check className="w-4 h-4 mr-1" />{addCredMutation.isPending ? "Saving..." : "Save Credential"}
                  </Button>
                </>
              )}
            </div>
          )}

          {credsLoading ? <Skeleton className="h-20 w-full" /> : credentials.length === 0 ? (
            <p className="text-xs text-muted-foreground">No service credentials configured. Add one using a template above.</p>
          ) : (
            <div className="space-y-2">
              {credentials.map((cred: any) => (
                <div key={cred.id} className="rounded-md border border-border p-2.5 space-y-1.5" data-testid={`card-credential-${cred.id}`}>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-xs font-medium truncate" data-testid={`text-cred-name-${cred.id}`}>{cred.serviceName}</span>
                      <Badge variant="secondary" className="text-[9px]">{cred.category}</Badge>
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => deleteCredMutation.mutate(cred.id)} disabled={deleteCredMutation.isPending} data-testid={`button-delete-cred-${cred.id}`}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                  </div>
                  <div className="space-y-1">
                    {cred.fields?.map((field: any, idx: number) => {
                      const fieldId = `${cred.id}-${field.key}`;
                      const isVisible = visibleFields.has(fieldId);
                      return (
                        <div key={idx} className="flex items-center gap-2 text-[10px]">
                          <span className="text-muted-foreground w-28 flex-shrink-0 truncate">{field.label}</span>
                          <span className="font-mono flex-1 truncate" data-testid={`text-cred-field-${cred.id}-${field.key}`}>{isVisible ? field.value : field.value?.replace(/./g, "*").slice(0, 20) || "***"}</span>
                          <button onClick={() => toggleFieldVisibility(fieldId)} className="flex-shrink-0 text-muted-foreground" data-testid={`button-toggle-visibility-${cred.id}-${field.key}`}>
                            {isVisible ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <div className="text-[9px] text-muted-foreground">Added {new Date(cred.createdAt).toLocaleDateString()}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
            <h3 className="font-semibold text-sm flex items-center gap-2"><Sparkles className="w-4 h-4 text-amber-400" /> Quick Secrets</h3>
            <Button size="sm" variant="outline" onClick={() => setShowNewSecret(!showNewSecret)} data-testid="button-new-secret"><Plus className="w-3.5 h-3.5 mr-1" />{showNewSecret ? "Cancel" : "Add Secret"}</Button>
          </div>

          {showNewSecret && (
            <div className="rounded-md border border-border p-3 space-y-2 mb-3">
              <div className="space-y-1"><Label className="text-xs">Name</Label><Input value={secretName} onChange={e => setSecretName(e.target.value)} className="text-xs" placeholder="My Token" data-testid="input-secret-name" /></div>
              <div className="space-y-1"><Label className="text-xs">Key</Label><Input value={secretKey} onChange={e => setSecretKey(e.target.value)} className="text-xs font-mono" placeholder="MY_TOKEN" data-testid="input-secret-key" /></div>
              <div className="space-y-1"><Label className="text-xs">Value</Label><Input type="password" value={secretValue} onChange={e => setSecretValue(e.target.value)} className="text-xs font-mono" placeholder="secret_value_here" data-testid="input-secret-value" /></div>
              <div className="space-y-1">
                <Label className="text-xs">Category</Label>
                <Select value={secretCategory} onValueChange={setSecretCategory}>
                  <SelectTrigger className="text-xs" data-testid="select-secret-category"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="api">API</SelectItem>
                    <SelectItem value="auth">Auth</SelectItem>
                    <SelectItem value="infra">Infrastructure</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button className="w-full" onClick={() => addSecretMutation.mutate({ name: secretName, key: secretKey, value: secretValue, category: secretCategory })} disabled={!secretKey.trim() || !secretValue.trim() || addSecretMutation.isPending} data-testid="button-save-secret">
                <Check className="w-4 h-4 mr-1" />{addSecretMutation.isPending ? "Saving..." : "Save Secret"}
              </Button>
            </div>
          )}

          {secretsLoading ? <Skeleton className="h-20 w-full" /> : secrets.length === 0 ? (
            <p className="text-xs text-muted-foreground">No quick secrets stored. Add one-off tokens and keys above.</p>
          ) : (
            <div className="space-y-1.5">
              {secrets.map((s: any) => {
                const fieldId = `secret-${s.key}`;
                const isVisible = visibleFields.has(fieldId);
                return (
                  <div key={s.key} className="flex items-center gap-2 rounded-md border border-border p-2" data-testid={`card-secret-${s.key}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium truncate" data-testid={`text-secret-name-${s.key}`}>{s.name}</span>
                        <Badge variant="secondary" className="text-[9px]">{s.category}</Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] font-mono text-muted-foreground">{s.key}</span>
                        <span className="text-[10px] font-mono" data-testid={`text-secret-value-${s.key}`}>{isVisible ? s.value : "****"}</span>
                        <button onClick={() => toggleFieldVisibility(fieldId)} className="text-muted-foreground" data-testid={`button-toggle-secret-${s.key}`}>
                          {isVisible ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        </button>
                      </div>
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => deleteSecretMutation.mutate(s.key)} disabled={deleteSecretMutation.isPending} data-testid={`button-delete-secret-${s.key}`}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </ScrollArea>
  );
}
