import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { AlertTriangle, Check, Eye, EyeOff, Info, Plus, Trash2 } from "lucide-react";

const PRESET_PROVIDERS = [
  { id: "xai", label: "xAI", baseUrl: "https://api.x.ai/v1", models: ["grok-3-mini", "grok-3", "grok-3-mini-fast"] },
  { id: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1", models: ["gpt-4o-mini", "gpt-4o", "gpt-4-turbo"] },
  { id: "anthropic", label: "Anthropic", baseUrl: "https://api.anthropic.com/v1", models: ["claude-3-5-sonnet-20241022", "claude-3-haiku-20240307"] },
  { id: "custom", label: "Custom", baseUrl: "", models: [] },
];

type SlotData = { label: string; provider: string; model: string; baseUrl: string; apiKeySet: boolean };

function getModelHint(model: string, provider: string): { type: "warning" | "info"; text: string } | null {
  if (model.toLowerCase().includes("reasoning")) {
    return {
      type: "warning",
      text: "Reasoning model — tool calls are disabled for this slot; responses are text-only. Uses max_completion_tokens instead of max_tokens.",
    };
  }
  if (provider === "anthropic") {
    return {
      type: "info",
      text: "Anthropic models use a different API format (messages API, anthropic-version header). Ensure your base URL and key are correct.",
    };
  }
  return null;
}

function SlotEditor({ slotKey, slotData, onSaved, onDelete }: {
  slotKey: string;
  slotData?: SlotData;
  onSaved: () => void;
  onDelete?: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [label, setLabel] = useState(slotData?.label ?? slotKey.toUpperCase());
  const [provider, setProvider] = useState(slotData?.provider ?? "xai");
  const [model, setModel] = useState(slotData?.model ?? "grok-3-mini");
  const [baseUrl, setBaseUrl] = useState(slotData?.baseUrl ?? "https://api.x.ai/v1");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (slotData && !loaded) {
      setLabel(slotData.label ?? slotKey.toUpperCase());
      setProvider(slotData.provider ?? "xai");
      setModel(slotData.model ?? "grok-3-mini");
      setBaseUrl(slotData.baseUrl ?? "https://api.x.ai/v1");
      setLoaded(true);
    }
  }, [slotData, loaded, slotKey]);

  const preset = PRESET_PROVIDERS.find(p => p.id === provider);
  const modelHint = getModelHint(model, provider);

  function handleProviderChange(pid: string) {
    setProvider(pid);
    const p = PRESET_PROVIDERS.find(x => x.id === pid);
    if (p) { setBaseUrl(p.baseUrl); if (p.models.length) setModel(p.models[0]); }
  }

  const saveMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/agent/slots/${slotKey}`, { label, provider, model, baseUrl, ...(apiKey ? { apiKey } : {}) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/v1/agent/slots"] }); setApiKey(""); toast({ title: `Slot ${slotKey.toUpperCase()} saved` }); onSaved(); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const isBuiltin = ["a", "b", "c"].includes(slotKey);

  return (
    <div className="space-y-2.5">
      <div className="rounded-lg border border-border bg-card p-2.5 space-y-1.5">
        <p className="text-[10px] text-muted-foreground">Label</p>
        <Input value={label} onChange={e => setLabel(e.target.value)} placeholder={`Slot ${slotKey.toUpperCase()}`} className="text-xs h-7" data-testid={`input-slot-${slotKey}-label`} />
      </div>
      <div className="rounded-lg border border-border bg-card p-2.5 space-y-1.5">
        <p className="text-[10px] text-muted-foreground">Provider</p>
        <div className="flex gap-1 flex-wrap">
          {PRESET_PROVIDERS.map(p => (
            <button key={p.id} onClick={() => handleProviderChange(p.id)} className={cn("px-2 py-0.5 rounded border text-[11px] transition-colors", provider === p.id ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/50 text-muted-foreground")} data-testid={`button-slot-${slotKey}-provider-${p.id}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div className="rounded-lg border border-border bg-card p-2.5 space-y-1.5">
        <p className="text-[10px] text-muted-foreground">Model</p>
        {preset && preset.models.length > 0 && (
          <div className="flex gap-1 flex-wrap mb-1">
            {preset.models.map(m => (
              <button key={m} onClick={() => setModel(m)} className={cn("px-1.5 py-0.5 rounded text-[9px] font-mono transition-colors", model === m ? "bg-primary text-primary-foreground" : "bg-background border border-border hover:bg-accent text-muted-foreground")} data-testid={`button-slot-${slotKey}-model-${m}`}>{m}</button>
            ))}
          </div>
        )}
        <Input value={model} onChange={e => setModel(e.target.value)} placeholder="e.g. grok-3-mini, gpt-4o..." className="font-mono text-xs h-7" data-testid={`input-slot-${slotKey}-model`} />
      </div>
      <div className="rounded-lg border border-border bg-card p-2.5 space-y-1.5">
        <p className="text-[10px] text-muted-foreground">Base URL</p>
        <Input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="https://api.x.ai/v1" className="font-mono text-xs h-7" data-testid={`input-slot-${slotKey}-base-url`} />
      </div>
      <div className="rounded-lg border border-border bg-card p-2.5 space-y-1.5">
        <p className="text-[10px] text-muted-foreground">API Key</p>
        <p className="text-[9px] text-muted-foreground">{slotData?.apiKeySet ? "Key stored. Enter a new one to replace." : "No key stored. xAI slots use XAI_API_KEY env var."}</p>
        <div className="relative">
          <Input type={showKey ? "text" : "password"} value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder={slotData?.apiKeySet ? "••••••••••••" : "Paste API key…"} className="font-mono text-xs h-7 pr-8" data-testid={`input-slot-${slotKey}-api-key`} />
          <button type="button" onClick={() => setShowKey(v => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            {showKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          </button>
        </div>
      </div>
      <div className="rounded-lg border border-border bg-muted/20 px-2.5 py-2 font-mono text-[9px] text-muted-foreground space-y-0.5">
        <div><span className="text-primary">label</span>: {label}</div>
        <div><span className="text-primary">model</span>: {model}</div>
        <div><span className="text-primary">baseUrl</span>: {baseUrl || "(default)"}</div>
        <div><span className="text-primary">apiKey</span>: {slotData?.apiKeySet ? "stored ✓" : "env var"}</div>
      </div>
      {modelHint && (
        <div
          className={cn(
            "flex items-start gap-2 rounded-lg border px-3 py-2 text-[10px] leading-relaxed",
            modelHint.type === "warning"
              ? "border-amber-400/40 bg-amber-400/5 text-amber-500"
              : "border-blue-400/40 bg-blue-400/5 text-blue-400"
          )}
          data-testid={`callout-model-hint-${slotKey}`}
        >
          {modelHint.type === "warning"
            ? <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            : <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />}
          <span>{modelHint.text}</span>
        </div>
      )}
      <div className="flex gap-2">
        <Button className="flex-1" size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid={`button-save-slot-${slotKey}`}>
          <Check className="w-3 h-3 mr-1" />{saveMutation.isPending ? "Saving…" : `Save ${slotKey.toUpperCase()}`}
        </Button>
        {!isBuiltin && onDelete && (
          <Button size="sm" variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/10 px-2" onClick={onDelete} data-testid={`button-delete-slot-${slotKey}`}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

export function ApiModelTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: slots = {} } = useQuery<Record<string, SlotData>>({ queryKey: ["/api/v1/agent/slots"] });

  const slotKeys = Object.keys(slots);
  const [activeSlot, setActiveSlot] = useState<string>("a");
  const [showAddSlot, setShowAddSlot] = useState(false);
  const [newSlotKey, setNewSlotKey] = useState("");

  const deleteSlotMutation = useMutation({
    mutationFn: (key: string) => apiRequest("DELETE", `/api/agent/slots/${key}`),
    onSuccess: (_, key) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/agent/slots"] });
      if (activeSlot === key) setActiveSlot("a");
      toast({ title: `Slot ${key.toUpperCase()} removed` });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function handleAddSlot() {
    const key = newSlotKey.trim().toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
    if (!key) { toast({ title: "Invalid key", description: "1-8 alphanumeric chars", variant: "destructive" }); return; }
    if (slots[key]) { toast({ title: "Slot already exists", variant: "destructive" }); return; }
    setActiveSlot(key);
    setNewSlotKey("");
    setShowAddSlot(false);
  }

  const effectiveKeys = slotKeys.length > 0 ? slotKeys : ["a", "b", "c"];

  return (
    <div className="h-full w-full overflow-y-auto overflow-x-hidden px-3 py-3">
      <div className="space-y-3 pb-4">
        <div>
          <p className="text-[11px] text-muted-foreground mb-2">Model slots route calls from the chat bar. Each slot is an independent LLM endpoint.</p>
          <div className="flex gap-1 flex-wrap">
            {effectiveKeys.map(s => (
              <button key={s} onClick={() => setActiveSlot(s)} className={cn("flex-1 min-w-[60px] py-1.5 px-2 rounded-md border text-xs font-semibold transition-colors", activeSlot === s ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent text-muted-foreground")} data-testid={`button-slot-tab-${s}`}>
                {slots[s]?.label || s.toUpperCase()}
                {slots[s]?.model && <span className="block text-[9px] font-normal opacity-70 truncate px-0.5">{slots[s].model}</span>}
                {!["a","b","c"].includes(s) && <Badge variant="secondary" className="text-[8px] ml-1">custom</Badge>}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full mt-2 h-8 text-xs border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary/50 gap-1.5"
            onClick={() => setShowAddSlot(v => !v)}
            data-testid="button-add-slot"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Slot
          </Button>
          {showAddSlot && (
            <div className="flex gap-1.5 mt-2">
              <Input value={newSlotKey} onChange={e => setNewSlotKey(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAddSlot()} placeholder="slot key (a-z, 1-8 chars)" className="h-7 text-xs font-mono flex-1" data-testid="input-new-slot-key" autoFocus />
              <Button size="sm" className="h-7 px-2" onClick={handleAddSlot} data-testid="button-confirm-add-slot"><Check className="w-3 h-3" /></Button>
            </div>
          )}
        </div>
        <SlotEditor
          key={activeSlot}
          slotKey={activeSlot}
          slotData={slots[activeSlot]}
          onSaved={() => {}}
          onDelete={!["a","b","c"].includes(activeSlot) ? () => deleteSlotMutation.mutate(activeSlot) : undefined}
        />
      </div>
    </div>
  );
}
