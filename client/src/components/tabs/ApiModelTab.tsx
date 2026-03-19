import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Check, Eye, EyeOff } from "lucide-react";

const PRESET_PROVIDERS = [
  { id: "xai", label: "xAI", baseUrl: "https://api.x.ai/v1", models: ["grok-3-mini", "grok-3", "grok-3-mini-fast"] },
  { id: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1", models: ["gpt-4o-mini", "gpt-4o", "gpt-4-turbo"] },
  { id: "custom", label: "Custom", baseUrl: "", models: [] },
];

type SlotKey = "a" | "b" | "c";
type SlotData = { label: string; provider: string; model: string; baseUrl: string; apiKeySet: boolean };

function SlotEditor({ slotKey, slotData, onSaved }: { slotKey: SlotKey; slotData?: SlotData; onSaved: () => void }) {
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

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-card p-3 space-y-2">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Label</h4>
        <Input value={label} onChange={e => setLabel(e.target.value)} placeholder={`Slot ${slotKey.toUpperCase()}`} className="text-xs" data-testid={`input-slot-${slotKey}-label`} />
      </div>
      <div className="rounded-lg border border-border bg-card p-3 space-y-2">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Provider</h4>
        <div className="flex gap-1.5 flex-wrap">
          {PRESET_PROVIDERS.map(p => (
            <button key={p.id} onClick={() => handleProviderChange(p.id)} className={cn("px-2.5 py-1 rounded-md border text-xs transition-colors", provider === p.id ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/50 hover:bg-accent text-muted-foreground")} data-testid={`button-slot-${slotKey}-provider-${p.id}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div className="rounded-lg border border-border bg-card p-3 space-y-2">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Model</h4>
        {preset && preset.models.length > 0 && (
          <div className="flex gap-1 flex-wrap mb-1">
            {preset.models.map(m => (
              <button key={m} onClick={() => setModel(m)} className={cn("px-2 py-0.5 rounded text-[10px] font-mono transition-colors", model === m ? "bg-primary text-primary-foreground" : "bg-background border border-border hover:bg-accent text-muted-foreground hover:text-foreground")} data-testid={`button-slot-${slotKey}-model-${m}`}>{m}</button>
            ))}
          </div>
        )}
        <Input value={model} onChange={e => setModel(e.target.value)} placeholder="e.g. grok-3-mini, gpt-4o, llama-3..." className="font-mono text-xs" data-testid={`input-slot-${slotKey}-model`} />
      </div>
      <div className="rounded-lg border border-border bg-card p-3 space-y-2">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Base URL</h4>
        <Input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="https://api.x.ai/v1" className="font-mono text-xs" data-testid={`input-slot-${slotKey}-base-url`} />
      </div>
      <div className="rounded-lg border border-border bg-card p-3 space-y-2">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">API Key</h4>
        <p className="text-[10px] text-muted-foreground">{slotData?.apiKeySet ? "Key stored. Enter a new one to replace." : "No key stored. xAI slots use XAI_API_KEY env var."}</p>
        <div className="relative">
          <Input type={showKey ? "text" : "password"} value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder={slotData?.apiKeySet ? "••••••••••••••••" : "Paste API key…"} className="font-mono text-xs pr-9" data-testid={`input-slot-${slotKey}-api-key`} />
          <button type="button" onClick={() => setShowKey(v => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
      <div className="rounded-lg border border-border bg-card px-3 py-2 font-mono text-[10px] text-muted-foreground space-y-0.5">
        <div><span className="text-primary">label</span>: {label}</div>
        <div><span className="text-primary">provider</span>: {provider}</div>
        <div><span className="text-primary">model</span>: {model}</div>
        <div><span className="text-primary">baseUrl</span>: {baseUrl || "(default)"}</div>
        <div><span className="text-primary">apiKey</span>: {slotData?.apiKeySet ? "stored ✓" : "env var"}</div>
      </div>
      <Button className="w-full" size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid={`button-save-slot-${slotKey}`}>
        <Check className="w-3.5 h-3.5 mr-1" />{saveMutation.isPending ? "Saving..." : `Save Slot ${slotKey.toUpperCase()}`}
      </Button>
    </div>
  );
}

export function ApiModelTab() {
  const [activeSlot, setActiveSlot] = useState<SlotKey>("a");
  const { data: slots } = useQuery<Record<string, SlotData>>({ queryKey: ["/api/v1/agent/slots"] });

  return (
    <div className="h-full w-full overflow-y-auto overflow-x-hidden px-3 py-3">
      <div className="space-y-4 pb-4">
        <div>
          <p className="text-[11px] text-muted-foreground mb-2">Three independent model slots (A / B / C). Select a slot in the chat to route all calls through it.</p>
          <div className="flex gap-1.5">
            {(["a", "b", "c"] as const).map(s => (
              <button key={s} onClick={() => setActiveSlot(s)} className={cn("flex-1 py-1.5 rounded-md border text-xs font-semibold transition-colors", activeSlot === s ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent text-muted-foreground")} data-testid={`button-slot-tab-${s}`}>
                {slots?.[s]?.label || s.toUpperCase()}
                {slots?.[s]?.model && <span className="block text-[9px] font-normal opacity-70 truncate px-1">{slots[s].model}</span>}
              </button>
            ))}
          </div>
        </div>
        <SlotEditor key={activeSlot} slotKey={activeSlot} slotData={slots?.[activeSlot]} onSaved={() => {}} />
      </div>
    </div>
  );
}
