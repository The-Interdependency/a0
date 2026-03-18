import { usePersona, PERSONA_META, type Persona } from "@/hooks/use-persona";
import { cn } from "@/lib/utils";
import { Check, Loader2 } from "lucide-react";

const PERSONAS: Persona[] = ["free", "legal", "researcher", "political"];

export default function PersonaPage() {
  const { persona: current, isLoading, setPersona, isPending } = usePersona();

  return (
    <div className="flex flex-col h-full overflow-auto px-4 py-6 gap-6 max-w-xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="persona-page-title">Select your Persona</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your persona adapts the console views, EDCM metric labels, and the agent's reasoning style to your domain.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {PERSONAS.map((p) => {
            const meta = PERSONA_META[p];
            const isSelected = p === current;
            return (
              <button
                key={p}
                data-testid={`persona-card-${p}`}
                onClick={() => !isPending && setPersona(p)}
                disabled={isPending}
                className={cn(
                  "flex items-start gap-4 p-4 rounded-xl border text-left transition-all min-h-[72px]",
                  "active:scale-[0.98]",
                  isSelected
                    ? "border-primary bg-primary/10"
                    : "border-border bg-card hover:border-primary/40 hover:bg-card/80"
                )}
              >
                <span className="text-3xl leading-none mt-0.5 select-none">{meta.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={cn("font-semibold text-base", meta.color)}>{meta.label}</span>
                    {p === "free" && (
                      <span className="text-[10px] uppercase tracking-widest border border-muted-foreground/30 rounded px-1.5 py-0.5 text-muted-foreground">default</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{meta.desc}</p>
                </div>
                <div className={cn(
                  "flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5",
                  isSelected ? "border-primary bg-primary" : "border-muted-foreground/30"
                )}>
                  {isSelected && <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {isPending && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Saving…
        </div>
      )}

      <div className="text-xs text-muted-foreground border border-border rounded-lg p-3 bg-muted/20">
        <strong className="text-foreground">What changes with your persona?</strong>
        <ul className="mt-1.5 space-y-1 list-disc list-inside">
          <li>Console tab visibility (Legal/Researcher/Political get domain-specific views)</li>
          <li>EDCM metric labels remap to domain terminology</li>
          <li>Agent system prompt gains a persona reasoning block</li>
        </ul>
      </div>
    </div>
  );
}
