import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { slotColor } from "@/lib/console-config";
import { ChevronDown, ChevronRight, Layers, Play, Radio } from "lucide-react";

type SlotData = { label: string; provider: string; model: string; baseUrl: string; apiKeySet: boolean };

type PatternArg = { name: string; type: string; default?: string | number | boolean; required?: boolean };

type Pattern = {
  id: string;
  name: string;
  description: string;
  args: PatternArg[];
};

type ModelResult = {
  model: string;
  slotKey: string;
  content: string;
  responseTimeMs: number;
  roundNum?: number;
  stepNum?: number;
  role?: string;
  initiative?: number;
};

type HubRunResult = {
  pattern: string;
  slots: string[];
  prompt: string;
  totalMs: number;
  results: ModelResult[];
};

const PATTERNS_NEEDING_ROUNDS = new Set(["room_all", "room_synthesized"]);
const PATTERNS_NEEDING_SYNTH = new Set(["room_synthesized"]);
const PATTERNS_NEEDING_DM = new Set(["roleplay"]);

export function HubTab() {
  const { toast } = useToast();

  const { data: slots = {} } = useQuery<Record<string, SlotData>>({
    queryKey: ["/api/v1/agent/slots"],
  });

  const { data: patternsData } = useQuery<{ patterns: Pattern[] }>({
    queryKey: ["/api/v1/hub/patterns"],
  });

  const patterns = patternsData?.patterns ?? [];
  const slotKeys = Object.keys(slots);

  const [selectedPattern, setSelectedPattern] = useState<string>("fan_out");
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [prompt, setPrompt] = useState("");
  const [rounds, setRounds] = useState(2);
  const [synthSlot, setSynthSlot] = useState<string>("");
  const [dmSlot, setDmSlot] = useState<string>("");
  const [slotContextMap, setSlotContextMap] = useState<Record<string, string>>({});
  const [showContexts, setShowContexts] = useState(false);
  const [result, setResult] = useState<HubRunResult | null>(null);

  const needsRounds = PATTERNS_NEEDING_ROUNDS.has(selectedPattern);
  const needsSynth = PATTERNS_NEEDING_SYNTH.has(selectedPattern);
  const needsDm = PATTERNS_NEEDING_DM.has(selectedPattern);

  function toggleSlot(key: string) {
    setSelectedSlots(prev =>
      prev.includes(key) ? prev.filter(s => s !== key) : [...prev, key]
    );
  }

  function updateSlotContext(key: string, val: string) {
    setSlotContextMap(prev => ({ ...prev, [key]: val }));
  }

  const runMutation = useMutation({
    mutationFn: async () => {
      if (!prompt.trim()) throw new Error("Prompt is required");
      if (selectedSlots.length === 0) throw new Error("Select at least one slot");
      if (needsSynth && !synthSlot) throw new Error("Synth slot is required for this pattern");
      if (needsDm && !dmSlot) throw new Error("DM slot is required for this pattern");

      type HubRunRequest = {
        pattern: string;
        slots: string[];
        prompt: string;
        slotContexts?: string[];
        rounds?: number;
        synthSlot?: string;
        dmSlot?: string;
      };

      const body: HubRunRequest = {
        pattern: selectedPattern,
        slots: selectedSlots,
        prompt: prompt.trim(),
        slotContexts: selectedSlots.some(k => slotContextMap[k]?.trim())
          ? selectedSlots.map(k => slotContextMap[k] ?? "")
          : undefined,
        ...(needsRounds ? { rounds } : {}),
        ...(needsSynth ? { synthSlot } : {}),
        ...(needsDm ? { dmSlot } : {}),
      };

      const res = await apiRequest("POST", "/api/v1/hub/run", body);
      return await res.json() as HubRunResult;
    },
    onSuccess: (data) => { setResult(data); },
    onError: (e: Error) => toast({ title: "Hub error", description: e.message, variant: "destructive" }),
  });

  const currentPattern = patterns.find(p => p.id === selectedPattern);

  return (
    <ScrollArea className="h-full w-full">
      <div className="px-3 py-3 space-y-3 pb-6">

        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-primary flex-shrink-0" />
          <h3 className="font-semibold text-sm">Multi-Model Hub</h3>
          {result && (
            <div className="flex items-center gap-1 ml-auto flex-wrap">
              <Badge variant="secondary" className="text-[9px]">{result.pattern.replace(/_/g, " ")}</Badge>
              <Badge variant="outline" className="text-[9px] font-mono">{result.totalMs}ms</Badge>
              <Badge variant="outline" className="text-[9px]">{result.results.length} results</Badge>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-3 space-y-2">
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Pattern</p>
          <div className="space-y-1">
            {patterns.map(p => (
              <button
                key={p.id}
                onClick={() => { setSelectedPattern(p.id); setSynthSlot(""); setDmSlot(""); }}
                className={cn(
                  "w-full text-left rounded-md border px-2.5 py-2 transition-colors",
                  selectedPattern === p.id
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/40 hover:bg-accent"
                )}
                data-testid={`button-pattern-${p.id}`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold">{p.name}</span>
                  {selectedPattern === p.id && <Badge className="text-[8px] h-4 px-1">selected</Badge>}
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{p.description}</p>
              </button>
            ))}
            {patterns.length === 0 && (
              <div className="space-y-1">
                {["fan_out","daisy_chain","room_all","room_synthesized","council","roleplay"].map(id => (
                  <button key={id} onClick={() => setSelectedPattern(id)} className={cn("w-full text-left rounded-md border px-2.5 py-1.5 text-xs transition-colors", selectedPattern === id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")} data-testid={`button-pattern-${id}`}>
                    {id.replace(/_/g, " ")}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-3 space-y-2">
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Slots</p>
          {slotKeys.length === 0 ? (
            <p className="text-[10px] text-muted-foreground">No slots configured yet.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {slotKeys.map(key => {
                const s = slots[key];
                const active = selectedSlots.includes(key);
                return (
                  <button
                    key={key}
                    onClick={() => toggleSlot(key)}
                    className={cn(
                      "flex items-center gap-1 px-2.5 py-1.5 rounded-full border text-[11px] font-medium transition-colors",
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:text-foreground hover:border-primary/40"
                    )}
                    data-testid={`button-hub-slot-${key}`}
                  >
                    <span className={cn("w-1.5 h-1.5 rounded-full", active ? "bg-primary" : "bg-muted-foreground/40")} />
                    <span className={slotColor(key)}>{s.label}</span>
                    <span className="text-[9px] opacity-60">{s.model}</span>
                  </button>
                );
              })}
            </div>
          )}
          {selectedSlots.length > 0 && (
            <p className="text-[9px] text-muted-foreground">{selectedSlots.length} slot{selectedSlots.length !== 1 ? "s" : ""} selected</p>
          )}
        </div>

        {needsRounds && (
          <div className="rounded-lg border border-border bg-card p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Rounds</p>
              <Badge variant="secondary" className="text-[10px] font-mono">{rounds}</Badge>
            </div>
            <Slider
              min={1} max={6} step={1}
              value={[rounds]}
              onValueChange={([v]) => setRounds(v)}
              className="w-full"
              data-testid="slider-hub-rounds"
            />
          </div>
        )}

        {needsSynth && (
          <div className="rounded-lg border border-border bg-card p-3 space-y-2">
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Synth Slot</p>
            <div className="flex flex-wrap gap-1">
              {slotKeys.map(key => (
                <button key={key} onClick={() => setSynthSlot(key)} className={cn("px-2 py-1 rounded border text-[11px] transition-colors", synthSlot === key ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")} data-testid={`button-hub-synth-${key}`}>
                  {slots[key]?.label || key.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        )}

        {needsDm && (
          <div className="rounded-lg border border-border bg-card p-3 space-y-2">
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">DM Slot</p>
            <div className="flex flex-wrap gap-1">
              {slotKeys.map(key => (
                <button key={key} onClick={() => setDmSlot(key)} className={cn("px-2 py-1 rounded border text-[11px] transition-colors", dmSlot === key ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")} data-testid={`button-hub-dm-${key}`}>
                  {slots[key]?.label || key.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-lg border border-border bg-card p-3 space-y-2">
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Prompt</p>
          <Textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Enter your prompt for all models…"
            className="text-xs min-h-[80px] resize-none"
            data-testid="textarea-hub-prompt"
          />
        </div>

        {selectedSlots.length > 0 && (
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <button
              className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowContexts(v => !v)}
              data-testid="button-toggle-slot-contexts"
            >
              {showContexts ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              Per-slot system context
              <span className="text-[9px] opacity-60 ml-1">(optional)</span>
            </button>
            {showContexts && (
              <div className="px-3 pb-3 space-y-2 border-t border-border pt-2">
                {selectedSlots.map((key) => (
                  <div key={key} className="space-y-1">
                    <p className="text-[9px] text-muted-foreground font-mono">
                      <span className={slotColor(key)}>{slots[key]?.label || key.toUpperCase()}</span> system prompt
                    </p>
                    <Textarea
                      value={slotContextMap[key] ?? ""}
                      onChange={e => updateSlotContext(key, e.target.value)}
                      placeholder={`Override system prompt for ${slots[key]?.label || key}…`}
                      className="text-xs min-h-[52px] resize-none"
                      data-testid={`textarea-hub-context-${key}`}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <Button
          className="w-full gap-2"
          onClick={() => runMutation.mutate()}
          disabled={runMutation.isPending || !prompt.trim() || selectedSlots.length === 0}
          data-testid="button-hub-run"
        >
          <Play className="w-3.5 h-3.5" />
          {runMutation.isPending ? "Running…" : `Run ${currentPattern?.name || selectedPattern.replace(/_/g," ")}`}
        </Button>

        {runMutation.isPending && (
          <div className="rounded-lg border border-border bg-card p-4 text-center">
            <p className="text-xs text-muted-foreground animate-pulse">Hub running — waiting for all models…</p>
          </div>
        )}

        {result && !runMutation.isPending && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-semibold">Results</span>
            </div>
            {result.results.map((r, i) => (
              <div key={i} className="rounded-lg border border-border bg-card p-3 space-y-1.5" data-testid={`card-hub-result-${i}`}>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge variant="secondary" className={cn("text-[9px] font-mono", slotColor(r.slotKey ?? ""))}>
                    {r.model}
                  </Badge>
                  <Badge variant="outline" className="text-[9px] font-mono">{r.responseTimeMs}ms</Badge>
                  {r.roundNum !== undefined && <Badge variant="outline" className="text-[9px]">round {r.roundNum}</Badge>}
                  {r.stepNum !== undefined && <Badge variant="outline" className="text-[9px]">step {r.stepNum}</Badge>}
                  {r.role && <Badge variant="outline" className="text-[9px]">{r.role}</Badge>}
                  {r.initiative !== undefined && <Badge variant="outline" className="text-[9px]">init {r.initiative}</Badge>}
                </div>
                <p className="text-[11px] leading-relaxed whitespace-pre-wrap text-foreground/90" data-testid={`text-hub-result-${i}`}>{r.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
