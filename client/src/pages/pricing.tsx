import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { usePersona, PERSONA_META, type Persona } from "@/hooks/use-persona";
import { Button } from "@/components/ui/button";
import { Check, Crown, Heart, CreditCard, LogIn, LogOut, User, Clock, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const PERSONA_ORDER: Persona[] = ["free", "legal", "researcher", "political"];

const PERSONA_DETAILS: Record<Persona, { features: string[]; color: string; border: string }> = {
  free: {
    features: [
      "Transcript upload (5 reports/month)",
      "EDCM cognitive analysis",
      "A0 explains results in plain language",
      "All file formats supported",
    ],
    color: "text-muted-foreground",
    border: "border-border",
  },
  legal: {
    features: [
      "Deposition & court transcript analysis",
      "Legal-language metric framing",
      "Witness inconsistency flagging",
      "A0 as paralegal analyst",
      "Export to report format",
    ],
    color: "text-blue-400",
    border: "border-blue-500/40",
  },
  researcher: {
    features: [
      "Full technical console",
      "PTCA triad — Cognitive, PSI, Omega tensors",
      "Heartbeat cycle visualization",
      "PCNA node inspector",
      "Model registry + bandit arms",
    ],
    color: "text-purple-400",
    border: "border-purple-500/40",
  },
  political: {
    features: [
      "Speech & debate transcript analysis",
      "Message discipline tracking",
      "Narrative contradiction detection",
      "Frame break identification",
      "A0 as discourse analyst",
    ],
    color: "text-amber-400",
    border: "border-amber-500/40",
  },
  founder: {
    features: [
      "Full access across all views",
      "Founder registry listing",
      "Locked rate for life",
      "Early refinement channel",
    ],
    color: "text-green-400",
    border: "border-green-500/40",
  },
};

export default function PricingPage() {
  const { user, isAuthenticated, logout } = useAuth();
  const { persona, setPersona, isPending } = usePersona();

  return (
    <ScrollArea className="h-full">
      <div className="px-3 py-4 space-y-6 pb-8 max-w-lg mx-auto">

        {!isAuthenticated ? (
          <div className="rounded-md border border-primary/30 bg-primary/5 p-4 text-center">
            <LogIn className="w-8 h-8 text-primary mx-auto mb-2" />
            <h3 className="font-semibold text-sm mb-1">Sign in to a0p</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Log in with your Replit account to access all features.
            </p>
            <Button asChild data-testid="button-login">
              <a href="/api/login">
                <LogIn className="w-4 h-4 mr-1" />
                Log in with Replit
              </a>
            </Button>
          </div>
        ) : (
          <Card className="p-4 flex items-center gap-3">
            {user?.profileImageUrl ? (
              <img src={user.profileImageUrl} className="w-10 h-10 rounded-full" alt="" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="w-5 h-5 text-primary" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate" data-testid="text-user-name">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => logout()} data-testid="button-logout">
              <LogOut className="w-4 h-4" />
            </Button>
          </Card>
        )}

        <div className="space-y-2">
          <h2 className="font-bold text-base">Your View</h2>
          <p className="text-xs text-muted-foreground">
            Choose the lens that fits your work. Your console, A0's language, and metric labels all adapt to match.
          </p>

          <div className="space-y-2 pt-1">
            {PERSONA_ORDER.map((p) => {
              const meta = PERSONA_META[p];
              const details = PERSONA_DETAILS[p];
              const isActive = persona === p;
              return (
                <button
                  key={p}
                  onClick={() => setPersona(p)}
                  disabled={isPending}
                  className={cn(
                    "w-full text-left rounded-lg border p-3 transition-all",
                    isActive
                      ? `${details.border} bg-card ring-1 ring-inset ring-primary/30`
                      : "border-border bg-card/50 active:bg-accent"
                  )}
                  data-testid={`button-persona-${p}`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl leading-none mt-0.5">{meta.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={cn("font-semibold text-sm", isActive && details.color)}>{meta.label}</span>
                        {isActive && (
                          <CheckCircle2 className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">{meta.description}</p>
                      {isActive && (
                        <div className="mt-2 space-y-1">
                          {details.features.map((f) => (
                            <div key={f} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                              <Check className="w-3 h-3 text-green-400 flex-shrink-0" />
                              {f}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-6 text-center">
          <Clock className="w-10 h-10 text-amber-400 mx-auto mb-3" />
          <h2 className="font-bold text-lg mb-2" data-testid="text-coming-soon-title">Payments Coming Soon</h2>
          <p className="text-sm text-muted-foreground mb-4">
            All views are currently available during preview. Pricing will be usage-based — pay per analysis, or subscribe for your tier.
          </p>
          <Badge variant="secondary" data-testid="badge-preview">Preview Access</Badge>
        </div>

        <Card className="p-4 opacity-70">
          <div className="flex items-center gap-2 mb-2">
            <Crown className="w-5 h-5 text-amber-400" />
            <h3 className="font-bold text-base">Founder</h3>
            <Badge variant="secondary" className="text-[10px]">Limited to 53</Badge>
          </div>
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="text-2xl font-bold">$153</span>
            <span className="text-xs text-muted-foreground">one-time · all views forever</span>
          </div>
          <div className="space-y-1.5 mb-3">
            {PERSONA_DETAILS.founder.features.map((f) => (
              <div key={f} className="flex items-center gap-2 text-xs">
                <Crown className="w-3 h-3 text-amber-400 flex-shrink-0" />
                <span>{f}</span>
              </div>
            ))}
          </div>
          <Button variant="secondary" className="w-full" disabled data-testid="button-founder">
            Coming Soon
          </Button>
        </Card>

        <Card className="p-4 opacity-60">
          <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">
            <Heart className="w-4 h-4 text-pink-400" />
            Optional Support
          </h3>
          <p className="text-xs text-muted-foreground">Tip the project — $1, $2, or $5. Coming soon.</p>
        </Card>

        <Card className="p-4 opacity-60">
          <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-blue-400" />
            Compute Credits
          </h3>
          <p className="text-xs text-muted-foreground">Top-up blocks — $10, $25, $50. Coming soon.</p>
        </Card>

      </div>
    </ScrollArea>
  );
}
