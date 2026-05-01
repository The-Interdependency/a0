// 323:9
import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { loadStripe } from "@stripe/stripe-js";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { Loader2, Sparkles, X } from "lucide-react";

type Credits = {
  free_remaining: number;
  paid_remaining: number;
  lifetime_purchased: number;
  total_remaining: number;
  pack_price_cents?: number;
  pack_size?: number;
};

type Citation = { claim: string; quote: string; round: number };

type Explanation = {
  id: number;
  report_id: number;
  body: string;
  citations: Citation[];
  paid_with: "free" | "paid";
  cost_cents: number;
  prompt_tokens: number;
  completion_tokens: number;
  model_id: string;
  created_at: string;
};

type ExplainResp = {
  explanation: Explanation;
  credits: Credits;
  cached: boolean;
};

interface BillingConfig {
  stripe_publishable_key: string;
}

// Typed error so we can distinguish the 402-no-credits case from other
// failures without resorting to `any` casts on the mutation error.
class NoCreditsError extends Error {
  readonly code = "no_credits" as const;
  constructor(message: string) {
    super(message);
    this.name = "NoCreditsError";
  }
}

export function ExplainerCard({ reportId }: { reportId: number }) {
  const { toast } = useToast();
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [stripePromise, setStripePromise] =
    useState<ReturnType<typeof loadStripe> | null>(null);

  const { data: credits } = useQuery<Credits>({
    queryKey: ["/api/v1/transcripts/explainer/credits"],
  });

  // Cached explanation, if any. 404 → no explanation yet (empty state).
  const {
    data: cachedExplanation,
    isLoading: cachedLoading,
  } = useQuery<Explanation | null>({
    queryKey: ["/api/v1/transcripts/reports", reportId, "explanation"],
    queryFn: async () => {
      const r = await fetch(
        `/api/v1/transcripts/reports/${reportId}/explanation`,
        { credentials: "include" },
      );
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
      return r.json();
    },
  });

  const { data: stripeConfig } = useQuery<BillingConfig>({
    queryKey: ["/api/v1/billing/config"],
    staleTime: Infinity,
  });

  const explainMut = useMutation({
    mutationFn: async () => {
      const r = await fetch(
        `/api/v1/transcripts/reports/${reportId}/explain`,
        { method: "POST", credentials: "include" },
      );
      if (r.status === 402) {
        const body: { detail?: { message?: string } } = await r
          .json()
          .catch(() => ({}));
        throw new NoCreditsError(
          body?.detail?.message || "Out of explanation credits.",
        );
      }
      if (!r.ok) {
        const text = await r.text();
        throw new Error(`${r.status}: ${text}`);
      }
      return r.json() as Promise<ExplainResp>;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(
        ["/api/v1/transcripts/reports", reportId, "explanation"],
        data.explanation,
      );
      queryClient.setQueryData(
        ["/api/v1/transcripts/explainer/credits"],
        data.credits,
      );
      if (!data.cached) {
        toast({
          title: "Explanation written",
          description: `${data.explanation.body.split(/\s+/).length} words, ${data.explanation.citations.length} citations.`,
        });
      }
    },
    onError: (err: Error) => {
      if (err instanceof NoCreditsError) {
        // Don't toast — we render the buy-pack inline below.
        return;
      }
      toast({
        title: "Explainer failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const checkoutMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/v1/billing/explainer-checkout", {
        return_url: `${window.location.origin}/transcripts?explainer_checkout=success`,
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (!stripeConfig?.stripe_publishable_key) {
        toast({
          title: "Stripe not configured",
          variant: "destructive",
        });
        return;
      }
      setStripePromise(loadStripe(stripeConfig.stripe_publishable_key));
      setClientSecret(data.client_secret);
      setCheckoutOpen(true);
    },
    onError: (err: Error) => {
      toast({
        title: "Checkout error",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const fetchClientSecret = useCallback(
    () => Promise.resolve(clientSecret!),
    [clientSecret],
  );

  // After a successful Stripe return, refetch credits so the new pack
  // shows up immediately. The webhook is the source of truth, but the
  // refetch covers the round-trip latency between Stripe redirect and
  // webhook arrival.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("explainer_checkout") === "success") {
      queryClient.invalidateQueries({
        queryKey: ["/api/v1/transcripts/explainer/credits"],
      });
      // Strip the query param so a refresh doesn't re-trigger.
      const url = new URL(window.location.href);
      url.searchParams.delete("explainer_checkout");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  const explanation = cachedExplanation ?? null;
  const noCredits =
    credits != null && credits.total_remaining === 0 && !explanation;
  const showOutOfCreditsBanner =
    noCredits ||
    (explainMut.isError && explainMut.error instanceof NoCreditsError);

  return (
    <>
      <Card className="p-4 space-y-3" data-testid="card-explainer">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              EDCMbone explanation
            </div>
            <div className="text-sm text-foreground">
              {explanation
                ? `${explanation.body.split(/\s+/).length} words, ${explanation.citations.length} citations · model ${explanation.model_id}`
                : "Get a plain-English reading of this report, with quoted spans backing every claim."}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {credits && (
              <Badge variant="secondary" data-testid="badge-explainer-credits">
                {credits.total_remaining} left
                {credits.free_remaining > 0
                  ? ` (${credits.free_remaining} free)`
                  : ""}
              </Badge>
            )}
            {!explanation && (
              <Button
                size="sm"
                onClick={() => explainMut.mutate()}
                disabled={explainMut.isPending || cachedLoading || noCredits}
                data-testid="button-explain-report"
              >
                {explainMut.isPending ? (
                  <>
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    Writing…
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3 h-3 mr-1" />
                    Explain this report
                  </>
                )}
              </Button>
            )}
          </div>
        </div>

        {showOutOfCreditsBanner && (
          <div
            className="rounded-md border border-border bg-muted/40 p-3 text-xs space-y-2"
            data-testid="panel-out-of-credits"
          >
            <div className="text-foreground">
              You're out of explanation credits. A $50 pack adds 3
              explanations (~$16.67 each, ~1 minute of model time per shot).
            </div>
            <Button
              size="sm"
              onClick={() => checkoutMut.mutate()}
              disabled={checkoutMut.isPending}
              data-testid="button-buy-explainer-pack"
            >
              {checkoutMut.isPending ? (
                <>
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  Opening checkout…
                </>
              ) : (
                "Buy a pack ($50)"
              )}
            </Button>
          </div>
        )}

        {explanation && (
          <div className="space-y-3">
            <div
              className="text-sm leading-relaxed whitespace-pre-wrap text-foreground"
              data-testid="text-explanation-body"
            >
              {explanation.body}
            </div>
            {explanation.citations.length > 0 && (
              <div
                className="border-t border-border pt-2 space-y-2"
                data-testid="list-explanation-citations"
              >
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Citations ({explanation.citations.length})
                </div>
                {explanation.citations.map((c, i) => (
                  <div
                    key={i}
                    className="text-xs space-y-1"
                    data-testid={`citation-explanation-${i}`}
                  >
                    <div className="text-muted-foreground">
                      <Badge variant="outline" className="mr-1 text-[9px]">
                        round {c.round}
                      </Badge>
                      {c.claim}
                    </div>
                    <blockquote className="border-l-2 border-primary/50 pl-2 italic text-foreground/80">
                      "{c.quote}"
                    </blockquote>
                  </div>
                ))}
              </div>
            )}
            <div className="text-[10px] text-muted-foreground">
              Paid with {explanation.paid_with} credit · {explanation.prompt_tokens}{" "}
              prompt + {explanation.completion_tokens} output tokens · ${" "}
              {(explanation.cost_cents / 100).toFixed(2)} model cost
            </div>
          </div>
        )}
      </Card>

      <Dialog
        open={checkoutOpen}
        onOpenChange={(open) => {
          if (!open) setCheckoutOpen(false);
        }}
      >
        <DialogContent
          className="max-w-lg p-0 gap-0 overflow-hidden"
          data-testid="dialog-explainer-checkout"
        >
          <DialogHeader className="px-4 pt-4 pb-2 border-b border-border">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-sm font-medium">
                Buy an explanation pack
              </DialogTitle>
              <button
                onClick={() => setCheckoutOpen(false)}
                className="text-muted-foreground hover:text-foreground"
                data-testid="button-close-explainer-checkout"
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
    </>
  );
}
// 323:9
