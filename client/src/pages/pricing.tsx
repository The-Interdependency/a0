import { useLocation } from "wouter";
import { usePersona, PERSONA_META, type Persona } from "@/hooks/use-persona";
import { cn } from "@/lib/utils";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const PERSONAS: Persona[] = ["free", "legal", "researcher", "political"];

export default function PricingPage() {
  const [, setLocation] = useLocation();
  const { persona: current, setPersona, isPending } = usePersona();

  async function select(p: Persona) {
    await setPersona(p);
    setLocation("/console");
  }

  return (
    <div className="flex flex-col min-h-dvh bg-background">
      <div className="flex-1 overflow-y-auto px-4 py-8 space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-xl font-bold tracking-tight">Choose your view</h1>
          <p className="text-sm text-muted-foreground">Shapes the console, labels, and agent framing.</p>
        </div>

        <div className="space-y-3">
          {PERSONAS.map((p) => {
            const meta = PERSONA_META[p];
            const active = current === p;
            return (
              <button
                key={p}
                data-testid={`card-persona-${p}`}
                onClick={() => select(p)}
                disabled={isPending}
                className={cn(
                  "w-full text-left rounded-xl border p-4 transition-all min-h-[72px] flex items-start gap-3",
                  active
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card active:bg-accent"
                )}
              >
                <div className="flex-1 space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={cn("text-sm font-semibold", meta.color)}>{meta.label}</span>
                    {active && (
                      <span className="text-[10px] font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded">active</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground leading-snug">{meta.tagline}</p>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {meta.groups.map((g) => (
                      <span key={g} className="text-[10px] font-mono bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                        {g}
                      </span>
                    ))}
                  </div>
                </div>
                {active && (
                  <Check className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                )}
              </button>
            );
          })}
        </div>

        {isPending && (
          <div className="flex justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}

        <div className="text-center">
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => setLocation("/console")}>
            Back to console
          </Button>
        </div>
      </div>
    </div>
  );
}
