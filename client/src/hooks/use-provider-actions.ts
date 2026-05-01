// 46:0
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Preset, RouteConfig } from "@/components/provider-panel";

const PROVIDERS_KEY = ["/api/energy/providers"] as const;

export function useProviderActions(providerId: string, label: string) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const patchSeed = useMutation({
    mutationFn: async (body: Partial<RouteConfig>) => {
      const r = await apiRequest("PATCH", `/api/energy/providers/${providerId}/seed`, body);
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PROVIDERS_KEY });
      toast({ title: `${label} updated` });
    },
    onError: (err: Error) =>
      toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });

  const applyPreset = useMutation({
    mutationFn: async (preset: Preset) => {
      const r = await apiRequest("POST", `/api/energy/providers/${providerId}/optimize`, { preset });
      return r.json();
    },
    onSuccess: (_, preset) => {
      qc.invalidateQueries({ queryKey: PROVIDERS_KEY });
      toast({ title: `Applied "${preset}" preset to ${label}` });
    },
    onError: (err: Error) =>
      toast({ title: "Preset apply failed", description: err.message, variant: "destructive" }),
  });

  const refreshPricing = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/energy/refresh-pricing/${providerId}`, {});
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PROVIDERS_KEY });
      toast({ title: `${label} pricing refreshed from manifest` });
    },
    onError: (err: Error) =>
      toast({ title: "Refresh failed", description: err.message, variant: "destructive" }),
  });

  return { patchSeed, applyPreset, refreshPricing };
}
// 46:0
