// 40:0
import { useQuery } from "@tanstack/react-query";

export interface BillingStatus {
  plan: string;
  status: string;
  provider_pool: string;
  byok_enabled: boolean;
  founder_slot: number | null;
  is_admin: boolean;
  user_id: string | null;
}

const TIER_LABELS: Record<string, string> = {
  free: "Free",
  ws: "WS",
  pro: "Pro",
  admin: "Admin",
  seeker: "Seeker",
  operator: "Operator",
  patron: "Patron",
  founder: "Founder",
};

const WS_TIERS = new Set(["ws", "pro", "admin", "seeker", "operator", "patron", "founder"]);

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
    isPaid: plan !== "free" || isAdmin,
    userId: data?.user_id ?? null,
  };
}
// 40:0
