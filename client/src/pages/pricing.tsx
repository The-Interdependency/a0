// 306:0
import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { loadStripe } from "@stripe/stripe-js";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { apiRequest } from "@/lib/queryClient";
import { useBillingStatus } from "@/hooks/use-billing-status";
import { useSEO } from "@/hooks/use-seo";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Loader2, Check, X, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface BillingConfig {
  stripe_publishable_key: string;
  intervals: { interval_key: string; label: string; weeks_per_period: number }[];
}

const INTERVAL_KEYS = ["week", "month", "quarter", "biannual", "annual"] as const;
type IntervalKey = typeof INTERVAL_KEYS[number];

const INTERVAL_LABELS: Record<IntervalKey, string> = {
  week: "Weekly",
  month: "Monthly",
  quarter: "Quarterly",
  biannual: "Bi-annually",
  annual: "Annually",
};

const WEEKS_PER_PERIOD: Record<IntervalKey, number> = {
  week: 1,
  month: 4,
  quarter: 11.25,
  biannual: 21,
  annual: 39,
};

function formatAmount(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function calcTotal(weeklyCents: number, interval: IntervalKey): number {
  return Math.ceil(weeklyCents * WEEKS_PER_PERIOD[interval]);
}

export default function PricingPage() {
  useSEO({ title: "Pricing — a0p", description: "Support The Interdependent Way. Choose your contribution." });
  const [, navigate] = useLocation();
  const { tier, isPaid, isAdmin, isWs } = useBillingStatus();
  const { toast } = useToast();

  const [weeklyDollars, setWeeklyDollars] = useState("5");
  const [interval, setInterval] = useState<IntervalKey>("month");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [stripePromise, setStripePromise] = useState<ReturnType<typeof loadStripe> | null>(null);

  const { data: config } = useQuery<BillingConfig>({
    queryKey: ["/api/v1/billing/config"],
    staleTime: Infinity,
  });

  const weeklyCents = Math.round(parseFloat(weeklyDollars || "0") * 100);
  const isValidAmount = weeklyCents >= 100;

  const portalMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/v1/billing/portal", {
        return_url: `${window.location.origin}/pricing`,
      });
      return res.json();
    },
    onSuccess: (data) => { window.location.href = data.url; },
    onError: (err: Error) => {
      toast({ title: "Portal error", description: err.message, variant: "destructive" });
    },
  });

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/v1/billing/checkout", {
        weekly_amount_cents: weeklyCents,
        interval,
        return_url: `${window.location.origin}/pricing?billing=success`,
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (!config?.stripe_publishable_key) {
        toast({ title: "Stripe not configured", variant: "destructive" });
        return;
      }
      setStripePromise(loadStripe(config.stripe_publishable_key));
      setClientSecret(data.client_secret);
      setCheckoutOpen(true);
    },
    onError: (err: Error) => {
      toast({ title: "Checkout error", description: err.message, variant: "destructive" });
    },
  });

  const fetchClientSecret = useCallback(() => Promise.resolve(clientSecret!), [clientSecret]);

  const isCurrent = tier === "supporter";
  const isWsTier = tier === "ws";

  return (
    <div className="min-h-screen bg-background pb-20 px-4 pt-6 max-w-lg mx-auto">
      <div className="mb-8 text-center">
        <div className="flex justify-center mb-3">
          <Heart className="w-6 h-6 text-primary" />
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">Support the Way</h1>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          a0p is built for The Interdependent Way. Your contribution keeps it running and evolving.
        </p>
      </div>

      <div className="space-y-4">
        <div
          className="rounded-xl border border-border bg-card p-5"
          data-testid="plan-card-free"
        >
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="font-semibold text-foreground">Free</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Full access, always</p>
            </div>
            <span className="text-lg font-bold text-foreground">$0</span>
          </div>
          <ul className="space-y-1.5">
            {[
              "Full console — every tab unlocked",
              "ZFAE agent with EDCM awareness",
              "PCNA alignment engine active",
              "Bandit model routing",
            ].map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                <Check className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
          {tier === "free" && !isAdmin && (
            <div className="mt-3">
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                Current plan
              </span>
            </div>
          )}
        </div>

        <div
          className={cn(
            "rounded-xl border p-5 transition-all",
            isCurrent
              ? "border-primary bg-primary/5 shadow-[0_0_0_1px_hsl(var(--primary)/0.3)]"
              : "border-border bg-card"
          )}
          data-testid="plan-card-supporter"
        >
          <div className="flex items-start justify-between mb-1">
            <div>
              <h3 className="font-semibold text-foreground">Supporter</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Choose your own contribution</p>
            </div>
            {isCurrent && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full border border-primary text-primary">
                Active
              </span>
            )}
          </div>

          <ul className="space-y-1.5 mb-4">
            {[
              "Everything in Free",
              "Extended inference context",
              "Supporter badge in the app",
              "Direct impact on development",
            ].map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                <Check className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" />
                <span>{f}</span>
              </li>
            ))}
          </ul>

          {!isCurrent && (
            <>
              <div className="mb-3">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Weekly amount
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">$</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={weeklyDollars}
                    onChange={(e) => setWeeklyDollars(e.target.value)}
                    className="flex-1 bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="5"
                    data-testid="input-weekly-amount"
                  />
                  <span className="text-xs text-muted-foreground">/week</span>
                </div>
                {weeklyCents > 0 && weeklyCents < 100 && (
                  <p className="text-xs text-destructive mt-1">Minimum is $1.00/week</p>
                )}
              </div>

              <div className="mb-4">
                <label className="text-xs font-medium text-muted-foreground mb-2 block">
                  Billing interval
                </label>
                <div className="grid grid-cols-1 gap-1.5">
                  {INTERVAL_KEYS.map((key) => {
                    const total = calcTotal(weeklyCents || 500, key);
                    const isSelected = interval === key;
                    const weeklyEquiv = key === "week"
                      ? null
                      : WEEKS_PER_PERIOD[key] / (key === "annual" ? 12 : key === "biannual" ? 6 : key === "quarter" ? 3 : 1);
                    return (
                      <button
                        key={key}
                        onClick={() => setInterval(key)}
                        className={cn(
                          "flex items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors",
                          isSelected
                            ? "border-primary bg-primary/5 text-foreground"
                            : "border-border text-muted-foreground hover:border-muted-foreground/40"
                        )}
                        data-testid={`btn-interval-${key}`}
                      >
                        <span className="text-sm font-medium">{INTERVAL_LABELS[key]}</span>
                        <div className="text-right">
                          <span className="text-sm font-semibold text-foreground">
                            {formatAmount(calcTotal(weeklyCents || 500, key))}
                          </span>
                          {weeklyEquiv && (
                            <span className="text-xs text-muted-foreground ml-1">
                              (≈{weeklyEquiv.toFixed(2)}w/mo)
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <Button
                className="w-full"
                onClick={() => checkoutMutation.mutate()}
                disabled={!isValidAmount || checkoutMutation.isPending}
                data-testid="btn-subscribe"
              >
                {checkoutMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  `Subscribe — ${formatAmount(calcTotal(weeklyCents || 500, interval))} ${interval === "annual" ? "/ year" : interval === "biannual" ? "/ 6 mo" : interval === "quarter" ? "/ quarter" : interval === "month" ? "/ month" : "/ week"}`
                )}
              </Button>
            </>
          )}

          {isCurrent && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => portalMutation.mutate()}
              disabled={portalMutation.isPending}
              className="w-full mt-2"
              data-testid="btn-manage-subscription"
            >
              {portalMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Manage subscription"}
            </Button>
          )}
        </div>

        {(isWsTier || isAdmin) && (
          <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-5" data-testid="plan-card-ws">
            <div className="flex items-start justify-between mb-2">
              <h3 className="font-semibold text-foreground">WS Access</h3>
              <span className="text-xs font-medium px-2 py-0.5 rounded-full border border-violet-500/40 text-violet-400">
                {isAdmin ? "Admin" : "Active"}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {isAdmin
                ? "Admin access — full platform control."
                : "Granted to @interdependentway.org accounts — full ws-tier access."}
            </p>
          </div>
        )}
      </div>

      <div className="mt-10 text-center">
        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
          All tiers operate under the same principles. Higher contribution deepens the context available — the Way governs equally.
        </p>
      </div>

      <Dialog open={checkoutOpen} onOpenChange={(open) => { if (!open) setCheckoutOpen(false); }}>
        <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden" data-testid="checkout-dialog">
          <DialogHeader className="px-4 pt-4 pb-2 border-b border-border">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-sm font-medium">Complete your subscription</DialogTitle>
              <button
                onClick={() => setCheckoutOpen(false)}
                className="text-muted-foreground hover:text-foreground"
                data-testid="btn-close-checkout"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </DialogHeader>
          <div className="min-h-[400px]">
            {stripePromise && clientSecret && (
              <EmbeddedCheckoutProvider stripe={stripePromise} options={{ fetchClientSecret }}>
                <EmbeddedCheckout />
              </EmbeddedCheckoutProvider>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
// 306:0
