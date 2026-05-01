// 237:0
import { useState, useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { loadStripe } from "@stripe/stripe-js";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { apiRequest } from "@/lib/queryClient";
import { useBillingStatus } from "@/hooks/use-billing-status";
import { useSEO } from "@/hooks/use-seo";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Heart, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface BillingConfig {
  stripe_publishable_key: string;
}

interface DonationTier {
  name: string;
  product_key: string;
  amount?: number;
  amount_min_cents?: number;
  description: string;
  legal_copy?: string;
}

interface PlansResponse {
  tiers: DonationTier[];
  legal_copy: string;
}

export default function PricingPage() {
  useSEO({
    title: "Donate — a0p",
    description:
      "a0p is a research instrument funded by donations. No paywalls, no perks unlocked.",
  });
  const { tier, isAdmin } = useBillingStatus();
  const { toast } = useToast();

  const [donationDollars, setDonationDollars] = useState("5");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [stripePromise, setStripePromise] =
    useState<ReturnType<typeof loadStripe> | null>(null);

  const { data: config } = useQuery<BillingConfig>({
    queryKey: ["/api/v1/billing/config"],
    staleTime: Infinity,
  });

  const { data: plans } = useQuery<PlansResponse>({
    queryKey: ["/api/v1/billing/plans"],
    staleTime: Infinity,
  });

  const donationCents = Math.round(parseFloat(donationDollars || "0") * 100);
  const minCents =
    plans?.tiers.find((t) => t.product_key === "donation")?.amount_min_cents ?? 500;
  const isValidAmount = donationCents >= minCents;

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
      toast({ title: "Portal error", description: err.message, variant: "destructive" });
    },
  });

  const donateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/v1/billing/donate", {
        amount_cents: donationCents,
        return_url: `${window.location.origin}/pricing?donation=success`,
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
      toast({ title: "Donation error", description: err.message, variant: "destructive" });
    },
  });

  const fetchClientSecret = useCallback(
    () => Promise.resolve(clientSecret!),
    [clientSecret]
  );

  const isLegacySupporter = tier === "supporter";
  const legalCopy = plans?.legal_copy;

  return (
    <div className="min-h-screen bg-background pb-20 px-4 pt-6 max-w-lg mx-auto">
      <div className="mb-8 text-center">
        <div className="flex justify-center mb-3">
          <Heart className="w-6 h-6 text-primary" />
        </div>
        <h1
          className="text-2xl font-bold text-foreground mb-2"
          data-testid="text-pricing-title"
        >
          Donate
        </h1>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          a0p is a research instrument. Every tab is free for everyone. Donations
          fund the work — they don't unlock anything you didn't already have.
        </p>
      </div>

      <div
        className="rounded-xl border border-border bg-card p-5 mb-4"
        data-testid="card-donation"
      >
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="font-semibold text-foreground">One-off donation</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              No tier change. No perks. Pure support.
            </p>
          </div>
        </div>

        <div className="mb-3">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            Amount (USD)
          </label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">$</span>
            <input
              type="number"
              min={(minCents / 100).toString()}
              step="1"
              value={donationDollars}
              onChange={(e) => setDonationDollars(e.target.value)}
              className="flex-1 bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="5"
              data-testid="input-donation-amount"
            />
          </div>
          {donationCents > 0 && donationCents < minCents && (
            <p className="text-xs text-destructive mt-1" data-testid="text-min-error">
              Minimum is ${(minCents / 100).toFixed(2)}
            </p>
          )}
        </div>

        <Button
          className="w-full"
          onClick={() => donateMutation.mutate()}
          disabled={!isValidAmount || donateMutation.isPending}
          data-testid="button-donate"
        >
          {donateMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            `Donate $${(donationCents / 100).toFixed(2)}`
          )}
        </Button>
      </div>

      {legalCopy && (
        <div
          className="rounded-xl border border-border bg-muted/30 p-4 mb-4"
          data-testid="card-legal-copy"
        >
          <p className="text-xs text-muted-foreground leading-relaxed">{legalCopy}</p>
        </div>
      )}

      {(isLegacySupporter || isAdmin) && (
        <div
          className="rounded-xl border border-border bg-card p-4 mb-4"
          data-testid="card-legacy-supporter"
        >
          <p className="text-xs text-muted-foreground mb-2">
            {isLegacySupporter
              ? "You have a legacy Supporter subscription from before the Supporter tier was retired. You can manage or cancel it via the Stripe portal."
              : "Manage existing Stripe subscriptions."}
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => portalMutation.mutate()}
            disabled={portalMutation.isPending}
            className="w-full"
            data-testid="button-manage-subscription"
          >
            {portalMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              "Open Stripe portal"
            )}
          </Button>
        </div>
      )}

      <div className="mt-8 text-center">
        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
          Free is the default tier and gives full access to every tab. Two-tier
          write access (admin + interdependentway.org operators) governs
          state-modifying actions; donations don't change that.
        </p>
      </div>

      <Dialog
        open={checkoutOpen}
        onOpenChange={(open) => {
          if (!open) setCheckoutOpen(false);
        }}
      >
        <DialogContent
          className="max-w-lg p-0 gap-0 overflow-hidden"
          data-testid="dialog-checkout"
        >
          <DialogHeader className="px-4 pt-4 pb-2 border-b border-border">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-sm font-medium">
                Complete your donation
              </DialogTitle>
              <button
                onClick={() => setCheckoutOpen(false)}
                className="text-muted-foreground hover:text-foreground"
                data-testid="button-close-checkout"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </DialogHeader>
          <div className="min-h-[400px]">
            {stripePromise && clientSecret && (
              <EmbeddedCheckoutProvider
                stripe={stripePromise}
                options={{ fetchClientSecret }}
              >
                <EmbeddedCheckout />
              </EmbeddedCheckoutProvider>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
// 237:0
