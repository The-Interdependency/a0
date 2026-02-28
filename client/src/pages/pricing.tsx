import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Check, Crown, Heart, CreditCard, LogIn, LogOut, User, Loader } from "lucide-react";

interface StripeProduct {
  product_id: string;
  product_name: string;
  product_description: string;
  product_metadata: Record<string, string>;
  price_id: string;
  unit_amount: number;
  currency: string;
  recurring: { interval: string } | null;
}

export default function PricingPage() {
  const { user, isAuthenticated, logout } = useAuth();
  const { toast } = useToast();
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  const { data: products = [], isLoading } = useQuery<StripeProduct[]>({
    queryKey: ["/api/stripe/products"],
  });

  const coreProduct = products.find((p) => p.product_metadata?.tier === "core");
  const founderProduct = products.find((p) => p.product_metadata?.tier === "founder");
  const supportProducts = products.filter((p) => p.product_metadata?.tier === "support");
  const creditProducts = products.filter((p) => p.product_metadata?.tier === "credit");

  async function handleCheckout(priceId: string) {
    if (!isAuthenticated) {
      window.location.href = "/api/login";
      return;
    }
    setCheckoutLoading(priceId);
    try {
      const res = await apiRequest("POST", "/api/stripe/checkout", { priceId });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setCheckoutLoading(null);
    }
  }

  const params = new URLSearchParams(window.location.search);
  const success = params.get("success");
  const canceled = params.get("canceled");

  return (
    <ScrollArea className="h-full">
      <div className="px-3 py-4 space-y-6 pb-8 max-w-lg mx-auto">
        {success && (
          <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4 text-center">
            <Check className="w-8 h-8 text-green-400 mx-auto mb-2" />
            <p className="font-semibold text-sm">Payment successful!</p>
            <p className="text-xs text-muted-foreground">Thank you for supporting a0p.</p>
          </div>
        )}
        {canceled && (
          <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4 text-center text-sm">
            Payment canceled. No charge was made.
          </div>
        )}

        {!isAuthenticated ? (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-center">
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
          <div className="rounded-lg border border-border bg-card p-4 flex items-center gap-3">
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
            <Button variant="ghost" size="sm" onClick={() => logout()} data-testid="button-logout">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <>
            <div className="rounded-lg border-2 border-primary bg-card overflow-hidden">
              <div className="bg-primary/10 px-4 py-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-base">Core Access</h3>
                  <div className="text-right">
                    <span className="text-2xl font-bold">$15</span>
                    <span className="text-xs text-muted-foreground"> / month</span>
                  </div>
                </div>
              </div>
              <div className="p-4 space-y-2">
                {[
                  "Full console access",
                  "EDCM instrumentation",
                  "Hourly heartbeat",
                  "BYO API keys",
                  "Cost telemetry",
                ].map((f) => (
                  <div key={f} className="flex items-center gap-2 text-xs">
                    <Check className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                    <span>{f}</span>
                  </div>
                ))}
                <Button
                  className="w-full mt-3"
                  onClick={() => coreProduct?.price_id && handleCheckout(coreProduct.price_id)}
                  disabled={!coreProduct?.price_id || checkoutLoading === coreProduct?.price_id}
                  data-testid="button-subscribe-core"
                >
                  {checkoutLoading === coreProduct?.price_id ? (
                    <Loader className="w-4 h-4 animate-spin mr-1" />
                  ) : null}
                  Subscribe
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <Heart className="w-4 h-4 text-pink-400" />
                Optional Support
              </h3>
              <p className="text-xs text-muted-foreground mb-3">One-time or recurring</p>
              <div className="flex gap-2">
                {supportProducts.sort((a, b) => a.unit_amount - b.unit_amount).map((p) => (
                  <Button
                    key={p.price_id}
                    variant="secondary"
                    className="flex-1"
                    onClick={() => handleCheckout(p.price_id)}
                    disabled={checkoutLoading === p.price_id}
                    data-testid={`button-donate-${p.unit_amount / 100}`}
                  >
                    {checkoutLoading === p.price_id ? (
                      <Loader className="w-3 h-3 animate-spin mr-1" />
                    ) : null}
                    +${p.unit_amount / 100}
                  </Button>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Crown className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-base">Founder</h3>
                <Badge variant="secondary" className="text-[10px]">Limited to 53</Badge>
              </div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-2xl font-bold">$153</span>
                <span className="text-xs text-muted-foreground">one-time</span>
              </div>
              <div className="space-y-2 mb-3">
                {[
                  "Founder registry listing",
                  "Founder badge",
                  "Locked $15 base rate while active",
                  "Early refinement channel",
                ].map((f) => (
                  <div key={f} className="flex items-center gap-2 text-xs">
                    <Crown className="w-3 h-3 text-amber-400 flex-shrink-0" />
                    <span>{f}</span>
                  </div>
                ))}
              </div>
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => founderProduct?.price_id && handleCheckout(founderProduct.price_id)}
                disabled={!founderProduct?.price_id || checkoutLoading === founderProduct?.price_id}
                data-testid="button-founder"
              >
                {checkoutLoading === founderProduct?.price_id ? (
                  <Loader className="w-4 h-4 animate-spin mr-1" />
                ) : null}
                Claim Founder Spot
              </Button>
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-blue-400" />
                Compute Credits
              </h3>
              <p className="text-xs text-muted-foreground mb-3">API cost + infrastructure overhead</p>
              <div className="flex gap-2">
                {creditProducts.sort((a, b) => a.unit_amount - b.unit_amount).map((p) => (
                  <Button
                    key={p.price_id}
                    variant="secondary"
                    className="flex-1 flex-col h-auto py-3"
                    onClick={() => handleCheckout(p.price_id)}
                    disabled={checkoutLoading === p.price_id}
                    data-testid={`button-credit-${p.unit_amount / 100}`}
                  >
                    {checkoutLoading === p.price_id ? (
                      <Loader className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <span className="text-lg font-bold">${p.unit_amount / 100}</span>
                        <span className="text-[10px] text-muted-foreground">block</span>
                      </>
                    )}
                  </Button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </ScrollArea>
  );
}
