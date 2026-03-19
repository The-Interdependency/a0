import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export type Persona = "free" | "legal" | "researcher" | "political";

export const PERSONA_META: Record<Persona, { label: string; icon: string; desc: string; color: string }> = {
  free: {
    label: "Explorer",
    icon: "🧭",
    desc: "Full access to all console views. No domain-specific framing.",
    color: "text-muted-foreground",
  },
  legal: {
    label: "Legal Analyst",
    icon: "⚖️",
    desc: "EDCM metrics remapped to legal constructs. Prompt tuned for statutory analysis and case framing.",
    color: "text-blue-400",
  },
  researcher: {
    label: "Researcher",
    icon: "🔬",
    desc: "Academic framing. Prompt tuned for literature, methodology, and hypothesis analysis.",
    color: "text-purple-400",
  },
  political: {
    label: "Political Analyst",
    icon: "🏛️",
    desc: "Policy and political science framing. Prompt tuned for stakeholder and discourse analysis.",
    color: "text-orange-400",
  },
};

export function usePersona() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery<{ persona: Persona; isOwner: boolean }>({
    queryKey: ["/api/user/persona"],
  });

  const mutation = useMutation({
    mutationFn: (persona: Persona) =>
      apiRequest("PATCH", "/api/user/persona", { persona }),
    onSuccess: (_data, persona) => {
      queryClient.setQueryData(["/api/user/persona"], { persona });
      queryClient.invalidateQueries({ queryKey: ["/api/user/persona"] });
      toast({ title: `Persona set to ${PERSONA_META[persona].label}` });
    },
    onError: (e: any) => {
      toast({ title: "Failed to update persona", description: e.message, variant: "destructive" });
    },
  });

  return {
    persona: data?.persona ?? "free",
    isOwner: data?.isOwner ?? false,
    isLoading,
    setPersona: mutation.mutate,
    isPending: mutation.isPending,
  };
}
