import { useLocation } from "wouter";
import { usePersona, PERSONA_META, type Persona } from "@/hooks/use-persona";
import { cn } from "@/lib/utils";
import { Check, Loader2, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const PERSONAS: Persona[] = ["free", "legal", "researcher", "political"];

const PERSONA_FEATURES: Record<Persona, string[]> = {
  free: [
    "All console tabs unlocked",
    "Full agent + bandit access",
    "EDCM default metric labels",
    "Brain pipeline & model slots",
    "S17 · Psi Ψ · Omega Ω tensors",
    "Custom tools & credentials",
    "Export & logs",
  ],
  legal: [
    "EDCM → legal constructs (Compliance Gap, Adversarial Tone…)",
    "Agent prompt tuned for statutory analysis",
    "Case framing + jurisdiction awareness",
    "Workflow · Metrics · Deals · Memory",
    "Psi Ψ · Heartbeat · Context · Logs",
    "Credentials & Export",
    "Bandit & Omega hidden for focus",
  ],
  researcher: [
    "EDCM → academic constructs (Methodological Inconsistency, Citation Density…)",
    "Agent prompt tuned for literature analysis",
    "Hypothesis tracking & methodological critique",
    "Brain pipeline included for deep research",
    "Workflow · Metrics · Deals · Memory · Brain",
    "Psi Ψ · Omega Ω · Heartbeat · Context",
    "Logs · Credentials · Export",
  ],
  political: [
    "EDCM → political science constructs (Policy Constraint Violation, Rhetoric Intensity…)",
    "Agent prompt tuned for discourse analysis",
    "Stakeholder & power-dynamics framing",
    "Workflow · Metrics · Deals · Memory",
    "Psi Ψ · Heartbeat · Context · Logs",
    "Credentials & Export",
    "Bandit & Omega hidden for focus",
  ],
};

const PERSONA_TAGLINES: Record<Persona, string> = {
  free: "No framing constraints. Full access.",
  legal: "Statutory precision. Case-first reasoning.",
  researcher: "Evidence-grounded. Hypothesis-aware.",
  political: "Discourse analysis. Stakeholder-aware.",
};

export default function PricingPage() {
  const { persona: current, isLoading, setPersona, isPending } = usePersona();
  const [, navigate] = useLocation();

  return (
    <div className="flex flex-col h-full overflow-auto bg-background" data-testid="pricing-page">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border flex-shrink-0">
        <button
          onClick={() => navigate("/console")}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          data-testid="button-back-console"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Console
        </button>
      </div>

      <div className="flex-1 px-4 py-6 max-w-xl mx-auto w-full space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-plans-title">
            Choose your Plan
          </h1>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
            Each plan adapts the console views, EDCM metric labels, and the agent's reasoning style to your domain. Switch any time.
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {PERSONAS.map((p) => {
              const meta = PERSONA_META[p];
              const isSelected = p === current;
              const features = PERSONA_FEATURES[p];
              const tagline = PERSONA_TAGLINES[p];

              return (
                <div
                  key={p}
                  data-testid={`pricing-card-${p}`}
                  className={cn(
                    "rounded-xl border p-4 transition-all",
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-border bg-card"
                  )}
                >
                  <div className="flex items-start gap-3 mb-3">
                    <span className="text-3xl leading-none mt-0.5 select-none">{meta.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={cn("font-bold text-base", meta.color)}>{meta.label}</span>
                        {p === "free" && (
                          <span className="text-[10px] uppercase tracking-widest border border-muted-foreground/30 rounded px-1.5 py-0.5 text-muted-foreground">
                            default
                          </span>
                        )}
                        {isSelected && (
                          <span
                            className="text-[10px] uppercase tracking-widest bg-primary/20 text-primary rounded px-1.5 py-0.5 font-semibold"
                            data-testid={`badge-active-${p}`}
                          >
                            active
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{tagline}</p>
                    </div>
                  </div>

                  <ul className="space-y-1.5 mb-4">
                    {features.map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <Check className="w-3 h-3 text-primary flex-shrink-0 mt-0.5" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    size="sm"
                    variant={isSelected ? "secondary" : "default"}
                    className="w-full"
                    disabled={isSelected || isPending}
                    onClick={() => !isSelected && !isPending && setPersona(p)}
                    data-testid={`button-select-${p}`}
                  >
                    {isSelected ? "Current plan" : isPending ? "Switching…" : `Switch to ${meta.label}`}
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-[11px] text-muted-foreground text-center pb-4">
          Plans are domain presets — no payment required. The owner can also grant plans to specific users.
        </p>
      </div>
    </div>
  );
}
