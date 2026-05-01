// 33:4
import { useQuery } from "@tanstack/react-query";

export interface BillingStatus {
  plan: string;
  status: string;
  is_admin: boolean;
  user_id: string | null;
}

// a0p reframed itself as a research instrument — there is no longer a paid
// "Supporter" tier for new users. The label is retained ONLY for grandfathered
// rows whose recurring Stripe subscription pre-dates the reframe; the hook
// surfaces that fact so the UI can show the self-cancel path.
const TIER_LABELS: Record<string, string> = {
  free: "Open access",
  supporter: "Supporter (grandfathered)",
  ws: "WS",
  admin: "Owner",
};

const WS_TIERS = new Set(["ws"]);

export function useBillingStatus() {
  const { data, isLoading, error } = useQuery<BillingStatus>({
    queryKey: ["/api/v1/billing/status"],
    staleTime: 5 * 60 * 1000,
  });

  const plan = data?.plan ?? "free";
  const isAdmin = data?.is_admin ?? false;
  return {
    status: data,
    isLoading,
    error,
    tier: plan,
    tierLabel: isAdmin ? "Owner" : (TIER_LABELS[plan] ?? "Open access"),
    isAdmin,
    isWs: WS_TIERS.has(plan) || isAdmin,
    isGrandfatheredSupporter: plan === "supporter",
    userId: data?.user_id ?? null,
  };
}
// 33:4
