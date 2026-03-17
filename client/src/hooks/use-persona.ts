import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

export type Persona = "free" | "legal" | "researcher" | "political";

export const PERSONA_META: Record<Persona, { label: string; tagline: string; color: string; groups: string[] }> = {
  free: {
    label: "Free",
    tagline: "Core agent access — workflow, tools, and context.",
    color: "text-muted-foreground",
    groups: ["agent", "tools"],
  },
  legal: {
    label: "Legal",
    tagline: "Legal research mode with doctrine-aware EDCM labels.",
    color: "text-blue-400",
    groups: ["agent", "memory", "tools"],
  },
  researcher: {
    label: "Researcher",
    tagline: "Evidence-based analysis with full triad instrumentation.",
    color: "text-purple-400",
    groups: ["agent", "memory", "triad", "tools"],
  },
  political: {
    label: "Political",
    tagline: "Full-spectrum access with system-level controls.",
    color: "text-amber-400",
    groups: ["agent", "memory", "triad", "system", "tools"],
  },
};

export function usePersona() {
  const { data, isLoading } = useQuery<{ persona: Persona }>({
    queryKey: ["/api/user/persona"],
  });

  const mutation = useMutation({
    mutationFn: (persona: Persona) =>
      apiRequest("PATCH", "/api/user/persona", { persona }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/persona"] });
    },
  });

  return {
    persona: data?.persona ?? "free",
    isLoading,
    setPersona: (p: Persona) => mutation.mutateAsync(p),
    isPending: mutation.isPending,
  };
}
