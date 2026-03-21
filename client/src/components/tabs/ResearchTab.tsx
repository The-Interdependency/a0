import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Search, ChevronDown, ChevronRight, Loader2, CheckCircle2, CircleDot, Zap, BookOpen, HelpCircle, ShieldAlert, Layers } from "lucide-react";
import { cn } from "@/lib/utils";

type Depth = "quick" | "standard" | "deep";
type StepStatus = "pending" | "running" | "done" | "error";

interface StepState {
  status: StepStatus;
  output?: string;
  expanded: boolean;
}

const STEPS = [
  { id: "ingest", label: "Ingest", icon: BookOpen, model: "Grok", desc: "Live web search on topic" },
  { id: "claims", label: "Extract Claims", icon: Layers, model: "Gemini", desc: "Pull discrete factual claims" },
  { id: "questions", label: "Verify Questions", icon: HelpCircle, model: "Gemini", desc: "Generate validation questions" },
  { id: "counterevidence", label: "Counterevidence", icon: ShieldAlert, model: "Grok", desc: "Seek contradictions & gaps" },
  { id: "synthesis", label: "Compress", icon: Zap, model: "Gemini", desc: "Compress into spec update" },
];

function StepIcon({ status }: { status: StepStatus }) {
  if (status === "running") return <Loader2 className="w-3.5 h-3.5 text-yellow-500 animate-spin" />;
  if (status === "done") return <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />;
  if (status === "error") return <CircleDot className="w-3.5 h-3.5 text-red-500" />;
  return <CircleDot className="w-3.5 h-3.5 text-muted-foreground/40" />;
}

export function ResearchTab() {
  const { toast } = useToast();
  const [topic, setTopic] = useState("");
  const [depth, setDepth] = useState<Depth>("standard");
  const [running, setRunning] = useState(false);
  const [stepStates, setStepStates] = useState<Record<string, StepState>>({});
  const [synthesis, setSynthesis] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  function resetState() {
    setStepStates({});
    setSynthesis(null);
  }

  function updateStep(id: string, patch: Partial<StepState>) {
    setStepStates(prev => ({
      ...prev,
      [id]: { status: "pending", output: undefined, expanded: false, ...prev[id], ...patch },
    }));
  }

  function toggleExpand(id: string) {
    setStepStates(prev => ({
      ...prev,
      [id]: { ...prev[id], expanded: !prev[id]?.expanded },
    }));
  }

  async function startLoop() {
    if (!topic.trim() || running) return;
    resetState();
    setRunning(true);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const response = await fetch("/api/v1/research/loop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topic.trim(), depth }),
        signal: abort.signal,
      });

      if (!response.ok) throw new Error("Server error");

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.step) {
              updateStep(data.step, {
                status: data.status as StepStatus,
                output: data.output,
                expanded: data.status === "done" && data.step === "synthesis",
              });
            }
            if (data.done && data.synthesis) {
              setSynthesis(data.synthesis);
            }
            if (data.error) {
              toast({ title: "Research error", description: data.error, variant: "destructive" });
            }
          } catch {}
        }
      }
    } catch (e: any) {
      if (e.name !== "AbortError") {
        toast({ title: "Research failed", description: e.message, variant: "destructive" });
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }

  const hasRun = Object.keys(stepStates).length > 0;

  return (
    <div className="h-full w-full overflow-y-auto overflow-x-hidden">
      <div className="p-3 space-y-3">
        <div>
          <h3 className="text-sm font-semibold" data-testid="text-research-title">Autoresearch Loop</h3>
          <p className="text-[11px] text-muted-foreground">Gemini extracts · Grok arbitrates · multi-model synthesis</p>
        </div>

        <div className="space-y-2">
          <Textarea
            value={topic}
            onChange={e => setTopic(e.target.value)}
            placeholder="Enter a topic, claim, or question to research deeply…"
            className="text-xs min-h-[64px] resize-none"
            onKeyDown={e => { if (e.key === "Enter" && e.ctrlKey) startLoop(); }}
            disabled={running}
            data-testid="input-research-topic"
          />
          <div className="flex items-center gap-2">
            <Select value={depth} onValueChange={v => setDepth(v as Depth)} disabled={running}>
              <SelectTrigger className="h-8 text-xs flex-1" data-testid="select-research-depth">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="quick">Quick — 1 search</SelectItem>
                <SelectItem value="standard">Standard — 2 searches</SelectItem>
                <SelectItem value="deep">Deep — 3 searches</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="h-8 px-3 flex-1"
              onClick={running ? () => { abortRef.current?.abort(); setRunning(false); } : startLoop}
              disabled={!topic.trim() && !running}
              data-testid="button-start-research"
            >
              {running ? (
                <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Stop</>
              ) : (
                <><Search className="w-3 h-3 mr-1" /> Run Loop</>
              )}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">Ctrl+Enter to run · a0 can also invoke this autonomously during chat</p>
        </div>

        {hasRun && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Pipeline</p>
            {STEPS.map(step => {
              const state = stepStates[step.id];
              const status = state?.status || "pending";
              const hasOutput = !!state?.output;
              return (
                <div key={step.id} className={cn("border rounded-lg overflow-hidden transition-colors", status === "running" ? "border-yellow-500/40 bg-yellow-500/5" : status === "done" ? "border-green-500/20" : status === "error" ? "border-red-500/30" : "border-border/40")}>
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/20 transition-colors"
                    onClick={() => hasOutput && toggleExpand(step.id)}
                    data-testid={`step-${step.id}`}
                  >
                    <StepIcon status={status} />
                    <step.icon className="w-3 h-3 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium">{step.label}</span>
                        <Badge variant="secondary" className="text-[9px] h-3.5 px-1">{step.model}</Badge>
                      </div>
                      <span className="text-[10px] text-muted-foreground">{step.desc}</span>
                    </div>
                    {hasOutput && (
                      state?.expanded ? <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" /> : <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
                    )}
                  </button>
                  {state?.expanded && state.output && (
                    <div className="px-3 pb-3">
                      <ScrollArea className="h-48 rounded bg-muted/20 p-2">
                        <pre className="text-[10px] whitespace-pre-wrap font-mono leading-relaxed">{state.output}</pre>
                      </ScrollArea>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {synthesis && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-semibold">Spec Synthesis</span>
            </div>
            <ScrollArea className="h-56">
              <pre className="text-[11px] whitespace-pre-wrap leading-relaxed font-sans">{synthesis}</pre>
            </ScrollArea>
          </div>
        )}
      </div>
    </div>
  );
}
