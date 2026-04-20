// 33:0
import { useQuery } from "@tanstack/react-query";

export interface BillingStatus {
  plan: string;
  status: string;
  is_admin: boolean;
  user_id: string | null;
}

const TIER_LABELS: Record<string, string> = {
  free: "Free",
  supporter: "Supporter",
  ws: "WS",
  admin: "Admin",
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
    tierLabel: isAdmin && plan === "free" ? "Admin" : (TIER_LABELS[plan] ?? "Free"),
    isAdmin,
    isWs: WS_TIERS.has(plan) || isAdmin,
    isPaid: plan === "supporter",
    userId: data?.user_id ?? null,
  };
}
// 33:0
