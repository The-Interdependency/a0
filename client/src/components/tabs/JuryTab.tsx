import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { slotColor } from "@/lib/console-config";
import { CheckCircle, Layers, Play } from "lucide-react";

type SlotData = { label: string; provider: string; model: string; baseUrl: string; apiKeySet: boolean };
type ModelResult = { model: string; slotKey: string; content: string; responseTimeMs: number };

export function JuryTab() {
  const { toast } = useToast();
  const [prompt, setPrompt] = useState("");
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [winner, setWinner] = useState<string | null>(null);
  const [results, setResults] = useState<ModelResult[]>([]);

  const { data: slots = {}, isLoading: slotsLoading } = useQuery<Record<string, SlotData>>({
    queryKey: ["/api/v1/agent/slots"],
  });

  const slotKeys = Object.keys(slots).filter(k => slots[k]?.apiKeySet);

  function toggleSlot(key: string) {
    setSelectedSlots(prev =>
      prev.includes(key) ? prev.filter(s => s !== key) : [...prev, key]
    );
  }

  const fanOutMutation = useMutation({
    mutationFn: async ({ prompt, slots }: { prompt: string; slots: string[] }) => {
      const res = await apiRequest("POST", "/api/v1/hub/run", { pattern: "fan_out", prompt, slots });
      return res.json();
    },
    onSuccess: (data: any) => {
      setResults(data.results || []);
      setWinner(null);
      toast({ title: `Fan-out complete — ${data.results?.length || 0} responses` });
    },
    onError: (e: any) => toast({ title: "Fan-out failed", description: e.message, variant: "destructive" }),
  });

  function run() {
    if (!prompt.trim()) { toast({ title: "Enter a prompt first", variant: "destructive" }); return; }
    const active = selectedSlots.length > 0 ? selectedSlots : slotKeys;
    if (active.length === 0) { toast({ title: "No active slots available", variant: "destructive" }); return; }
    setResults([]);
    setWinner(null);
    fanOutMutation.mutate({ prompt: prompt.trim(), slots: active });
  }

  return (
    <div className="h-full w-full overflow-y-auto overflow-x-hidden px-3 py-3 space-y-4">
      <div className="flex items-center gap-2">
        <Layers className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold" data-testid="text-jury-title">Jury — Multi-Model Deliberation</h3>
      </div>

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Send a prompt to multiple models simultaneously and select the best response.</p>
        <Textarea
          className="text-sm min-h-[80px]"
          placeholder="Enter your prompt for the jury…"
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          data-testid="textarea-jury-prompt"
        />
      </div>

      {slotsLoading ? (
        <Skeleton className="h-16" />
      ) : slotKeys.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Slots (all selected if none chosen):</p>
          <div className="flex flex-wrap gap-2">
            {slotKeys.map(key => (
              <button
                key={key}
                onClick={() => toggleSlot(key)}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-colors",
                  selectedSlots.includes(key)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                )}
                data-testid={`slot-toggle-${key}`}
              >
                <span className={cn("w-2 h-2 rounded-full bg-current", slotColor(key))} />
                <span className={slotColor(key)}>{key}</span>
                <span>{slots[key]?.label || slots[key]?.model}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No slots with API keys configured. Add slots in System &gt; Models.</p>
      )}

      <Button
        className="w-full"
        onClick={run}
        disabled={fanOutMutation.isPending || !prompt.trim()}
        data-testid="button-jury-run"
      >
        <Play className="w-3.5 h-3.5 mr-1.5" />
        {fanOutMutation.isPending ? "Running…" : "Run Jury"}
      </Button>

      {fanOutMutation.isPending && (
        <div className="space-y-2">
          {[1, 2].map(i => <Skeleton key={i} className="h-28" />)}
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium">Responses</p>
            {winner && <Badge className="text-xs">Winner: {winner}</Badge>}
          </div>
          {results.map((r) => (
            <div
              key={r.slotKey}
              className={cn(
                "rounded-lg border p-3 space-y-2 cursor-pointer transition-colors",
                winner === r.slotKey
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card hover:border-muted-foreground/40"
              )}
              onClick={() => setWinner(prev => prev === r.slotKey ? null : r.slotKey)}
              data-testid={`jury-result-${r.slotKey}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={cn("text-xs font-medium", slotColor(r.slotKey))}>{r.slotKey}</span>
                  <span className="text-xs text-muted-foreground">{r.model}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{r.responseTimeMs}ms</span>
                  {winner === r.slotKey && <CheckCircle className="w-3.5 h-3.5 text-primary" />}
                </div>
              </div>
              <ScrollArea className="max-h-40">
                <p className="text-xs whitespace-pre-wrap">{r.content}</p>
              </ScrollArea>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
