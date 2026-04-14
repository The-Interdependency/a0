// 305:0
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useBillingStatus } from "@/hooks/use-billing-status";
import { useSEO } from "@/hooks/use-seo";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Loader2, Check, Star, Key, Users, Heart, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

interface Plan {
  name: string;
  product_key: string;
  lookup_key: string;
  amount: number;
  amount_display: string;
  interval: string | null;
  description: string;
}

interface DonationConfig {
  label: string;
  amount: number;
  note: string;
  enabled: boolean;
}

const TIER_PRODUCT_KEY: Record<string, string> = {
  free: "free",
  seeker: "seeker_monthly",
  operator: "operator_monthly",
  patron: "patron_monthly",
  founder: "founder_lifetime",
};

const TIER_FEATURES: Record<string, string[]> = {
  free: [
    "Full console access — every tab unlocked",
    "ZFAE agent with EDCM awareness",
    "PCNA alignment engine active",
    "Bandit model routing",
    "The Interdependent Way principles active",
  ],
  seeker_monthly: [
    "Everything in Free",
    "Extended context window",
    "Priority PCNA cycle depth",
    "Seeker-tier system prompt context",
    "Deeper memory seed weighting",
  ],
  operator_monthly: [
    "Everything in Seeker",
    "Full operator context injection",
    "Advanced EDCM analytics",
    "Agent orchestration access",
    "Tool creation & management",
  ],
  patron_monthly: [
    "Everything in Operator",
    "Way Seer Patron context layer",
    "Elevated ZFAE alignment scope",
    "Patron-priority energy routing",
    "Direct influence on development direction",
  ],
  founder_lifetime: [
    "Lifetime access at Patron level",
    "Numbered founder slot (1–53)",
    "Name in founders registry",
    "All future tier upgrades included",
    "Founding-era energy provider access",
  ],
};

const MAIN_PRODUCT_KEYS = ["free", "seeker_monthly", "operator_monthly", "patron_monthly"];

function PlanCard({
  plan,
  currentTier,
  onSelect,
  loading,
}: {
  plan: Plan;
  currentTier: string;
  onSelect: (key: string) => void;
  loading: string | null;
}) {
  const activeProductKey = TIER_PRODUCT_KEY[currentTier] ?? "free";
  const isCurrent = plan.product_key === activeProductKey;
  const isLoading = loading === plan.product_key;

  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border p-5 gap-4 transition-all",
        isCurrent
          ? "border-primary bg-primary/5 shadow-[0_0_0_1px_hsl(var(--primary)/0.3)]"
          : "border-border bg-card hover:border-muted-foreground/40"
      )}
      data-testid={`plan-card-${plan.lookup_key}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-foreground">{plan.name}</h3>
          <p className="text-sm text-muted-foreground mt-0.5">{plan.description}</p>
        </div>
        <div className="text-right shrink-0">
          <span className="text-lg font-bold text-foreground">{plan.amount_display}</span>
        </div>
      </div>

      <ul className="space-y-1.5 flex-1">
        {(TIER_FEATURES[plan.product_key] ?? []).map((feat) => (
          <li key={feat} className="flex items-start gap-2 text-sm text-muted-foreground">
            <Check className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" />
            <span>{feat}</span>
          </li>
        ))}
      </ul>

      {isCurrent ? (
        <Badge variant="outline" className="self-start border-primary text-primary" data-testid={`badge-current-${plan.product_key}`}>
          Current plan
        </Badge>
      ) : plan.amount === 0 ? null : (
        <Button
          size="sm"
          onClick={() => onSelect(plan.product_key)}
          disabled={isLoading}
          data-testid={`btn-select-${plan.product_key}`}
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Choose plan"}
        </Button>
      )}
    </div>
  );
}

function DonationButton({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DonationConfig | null>(null);

  const { data: config, isLoading } = useQuery<DonationConfig>({
    queryKey: ["/api/v1/billing/donation"],
    staleTime: 60_000,
  });

  const saveMutation = useMutation({
    mutationFn: async (body: DonationConfig) => {
      const res = await apiRequest("PUT", "/api/v1/billing/donation", body);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/v1/billing/donation"] });
      setEditing(false);
      toast({ title: "Donation config saved" });
    },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/v1/billing/donation/checkout");
      return res.json();
    },
    onSuccess: (data) => {
      window.location.href = data.checkout_url;
    },
    onError: (e: Error) => toast({ title: "Donation failed", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return null;

  const startEdit = () => {
    setDraft(config ?? { label: "Support a0", amount: 500, note: "", enabled: true });
    setEditing(true);
  };

  if (editing && draft) {
    return (
      <div className="border border-border rounded-xl p-5 mb-4 bg-card space-y-3" data-testid="donation-editor">
        <div className="flex items-center gap-2">
          <Heart className="w-4 h-4 text-rose-400" />
          <h3 className="font-semibold text-foreground text-sm">Donation Button Config</h3>
          <button className="ml-auto text-muted-foreground hover:text-foreground" onClick={() => setEditing(false)}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Label</label>
            <Input
              value={draft.label}
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              className="text-xs h-8"
              data-testid="donation-label-input"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Amount (cents)</label>
            <Input
              type="number"
              value={draft.amount}
              onChange={(e) => setDraft({ ...draft, amount: parseInt(e.target.value) || 0 })}
              className="text-xs h-8"
              data-testid="donation-amount-input"
            />
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Note (optional)</label>
          <Input
            value={draft.note}
            onChange={(e) => setDraft({ ...draft, note: e.target.value })}
            className="text-xs h-8"
            placeholder="Shown below the button"
            data-testid="donation-note-input"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Enabled</label>
          <button
            onClick={() => setDraft({ ...draft, enabled: !draft.enabled })}
            className={cn("w-8 h-4 rounded-full transition-colors", draft.enabled ? "bg-primary" : "bg-muted")}
            data-testid="donation-enabled-toggle"
          >
            <div className={cn("h-3 w-3 rounded-full bg-white mx-0.5 transition-transform", draft.enabled && "translate-x-4")} />
          </button>
        </div>
        <div className="flex gap-2">
          <Button size="sm" className="text-xs h-7" onClick={() => saveMutation.mutate(draft)} disabled={saveMutation.isPending} data-testid="btn-save-donation">
            {saveMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
          </Button>
          <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => setEditing(false)}>Cancel</Button>
        </div>
      </div>
    );
  }

  if (!config?.enabled && !isAdmin) return null;

  return (
    <div className={cn("border rounded-xl p-5 mb-4 text-center", config?.enabled ? "border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/20" : "border-dashed border-border bg-card")} data-testid="donation-section">
      {config?.enabled ? (
        <>
          <Heart className="w-5 h-5 text-rose-400 mx-auto mb-2" />
          <p className="text-sm font-medium text-foreground mb-1">{config.label}</p>
          {config.note && <p className="text-xs text-muted-foreground mb-3">{config.note}</p>}
          <div className="flex items-center justify-center gap-2">
            <Button
              size="sm"
              className="bg-rose-500 hover:bg-rose-600 text-white"
              onClick={() => checkoutMutation.mutate()}
              disabled={checkoutMutation.isPending}
              data-testid="btn-donate"
            >
              {checkoutMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Heart className="w-3.5 h-3.5 mr-1" />}
              Donate ${(config.amount / 100).toFixed(2)}
            </Button>
            {isAdmin && (
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={startEdit} data-testid="btn-edit-donation">
                <Pencil className="w-3 h-3" />
              </Button>
            )}
          </div>
        </>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">Donation button not configured</p>
          <Button size="sm" variant="outline" className="text-xs h-7" onClick={startEdit} data-testid="btn-setup-donation">
            <Pencil className="w-3 h-3 mr-1" />Set up donation
          </Button>
        </div>
      )}
    </div>
  );
}

export default function PricingPage() {
  useSEO({ title: "Pricing — a0p", description: "Choose your tier: Free, Seeker, Operator, Way Seer Patron, or Founder Lifetime." });
  const { tier, isPaid, isAdmin } = useBillingStatus();
  const { toast } = useToast();
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  const { data: plans = [], isLoading: plansLoading } = useQuery<Plan[]>({
    queryKey: ["/api/v1/billing/plans"],
    staleTime: 10 * 60 * 1000,
  });

  const { data: founderCount } = useQuery<{ count: number; max: number; slots_remaining: number }>({
    queryKey: ["/api/v1/founders/count"],
    staleTime: 60 * 1000,
  });

  const checkoutMutation = useMutation({
    mutationFn: async (product_key: string) => {
      const res = await apiRequest("POST", "/api/v1/billing/checkout", {
        product: product_key,
        success_url: `${window.location.origin}/console?billing=success`,
        cancel_url: `${window.location.origin}/pricing`,
      });
      return res.json();
    },
    onSuccess: (data) => {
      window.location.href = data.checkout_url;
    },
    onError: (err: Error) => {
      setLoadingKey(null);
      toast({ title: "Checkout failed", description: err.message, variant: "destructive" });
    },
  });

  const portalMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/v1/billing/portal", {
        return_url: `${window.location.origin}/pricing`,
      });
      return res.json();
    },
    onSuccess: (data) => {
      window.location.href = data.url;
    },
    onError: (err: Error) => {
      const msg = err.message.toLowerCase();
      if (msg.includes("no billing account")) {
        toast({
          title: "No billing account yet",
          description: "Subscribe to a paid plan first to access the billing portal.",
        });
      } else {
        toast({ title: "Portal error", description: err.message, variant: "destructive" });
      }
    },
  });

  function handleSelect(lookup_key: string) {
    setLoadingKey(lookup_key);
    checkoutMutation.mutate(lookup_key);
  }

  const mainTiers = plans.filter((p) => MAIN_PRODUCT_KEYS.includes(p.product_key));
  const founderPlan = plans.find((p) => p.product_key === "founder_lifetime");
  const byokPlan = plans.find((p) => p.product_key === "byok_addon");
  const slotsLeft = founderCount?.slots_remaining ?? 53;

  return (
    <div className="min-h-screen bg-background pb-16 px-4 pt-6 max-w-2xl mx-auto">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-foreground mb-2">Choose your path</h1>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          The way you engage with a0 determines the depth of alignment available to you.
          Each tier unlocks a richer context layer — the same Way governs all.
        </p>
      </div>

      {plansLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            {mainTiers.map((plan) => (
              <PlanCard
                key={plan.lookup_key}
                plan={plan}
                currentTier={tier}
                onSelect={handleSelect}
                loading={loadingKey}
              />
            ))}
          </div>

          {founderPlan && (
            <div className="border border-amber-500/30 rounded-xl p-5 mb-4 bg-amber-500/5">
              <div className="flex items-center gap-2 mb-3">
                <Star className="w-4 h-4 text-amber-400" />
                <h3 className="font-semibold text-foreground">{founderPlan.name}</h3>
                <Badge variant="outline" className="text-amber-400 border-amber-400/40 ml-auto">
                  {slotsLeft} of 53 remaining
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mb-3">{founderPlan.description}</p>
              <ul className="space-y-1 mb-4">
                {(TIER_FEATURES["founder_lifetime"] ?? []).map((f) => (
                  <li key={f} className="text-sm text-muted-foreground flex gap-2">
                    <Check className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-400" />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between gap-3">
                <span className="text-lg font-bold text-foreground">{founderPlan.amount_display}</span>
                {tier === "founder" ? (
                  <Badge variant="outline" className="border-amber-400 text-amber-400">Founder</Badge>
                ) : slotsLeft > 0 ? (
                  <Button
                    size="sm"
                    className="bg-amber-500 hover:bg-amber-600 text-black"
                    onClick={() => handleSelect("founder_lifetime")}
                    disabled={loadingKey === "founder_lifetime"}
                    data-testid="btn-select-founder"
                  >
                    {loadingKey === "founder_lifetime" ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      "Secure your slot"
                    )}
                  </Button>
                ) : (
                  <Button size="sm" disabled variant="outline">Slots filled</Button>
                )}
              </div>
            </div>
          )}

          {byokPlan && (
            <div className="border border-border rounded-xl p-5 mb-4 bg-card">
              <div className="flex items-center gap-2 mb-2">
                <Key className="w-4 h-4 text-muted-foreground" />
                <h3 className="font-semibold text-foreground">{byokPlan.name}</h3>
                <span className="text-sm text-muted-foreground ml-auto">{byokPlan.amount_display}</span>
              </div>
              <p className="text-sm text-muted-foreground mb-3">
                Bring your own API keys for Grok, Gemini, or other providers.
                Your keys — your inference costs. Available as an add-on to any paid tier.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleSelect("byok_addon")}
                disabled={loadingKey === "byok_addon"}
                data-testid="btn-select-byok"
              >
                {loadingKey === "byok_addon" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Add BYOK"
                )}
              </Button>
            </div>
          )}

          <DonationButton isAdmin={!!isAdmin} />

          {isPaid && (
            <div className="border border-border rounded-xl p-4 flex items-center justify-between gap-3 bg-card mb-4">
              <div>
                <p className="text-sm font-medium text-foreground">Manage subscription</p>
                <p className="text-xs text-muted-foreground">Update payment method, cancel, or view invoices</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => portalMutation.mutate()}
                disabled={portalMutation.isPending}
                data-testid="btn-manage-subscription"
              >
                {portalMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Manage"
                )}
              </Button>
            </div>
          )}

          <div className="mt-8 text-center">
            <div className="flex items-center justify-center gap-2 text-muted-foreground mb-2">
              <Users className="w-4 h-4" />
              <span className="text-xs">The Way governs all tiers equally.</span>
            </div>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Higher tiers don't bypass principles — they deepen the alignment scope available
              within the same ethical framework.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
// 305:0
