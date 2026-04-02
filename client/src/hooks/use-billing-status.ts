import { useQuery } from "@tanstack/react-query";

export interface BillingStatus {
  tier: string;
  status: string;
  byok_enabled: boolean;
  founder_slot: number | null;
  is_admin: boolean;
}

const TIER_LABELS: Record<string, string> = {
  free: "Free",
  seeker: "Seeker",
  operator: "Operator",
  patron: "Patron",
  founder: "Founder",
};

export function useBillingStatus() {
  const { data, isLoading, error } = useQuery<BillingStatus>({
    queryKey: ["/api/v1/billing/status"],
    staleTime: 5 * 60 * 1000,
  });

  return {
    status: data,
    isLoading,
    error,
    tier: data?.tier ?? "free",
    tierLabel: TIER_LABELS[data?.tier ?? "free"] ?? "Free",
    isAdmin: data?.is_admin ?? false,
    isPaid: data ? data.tier !== "free" : false,
  };
}
