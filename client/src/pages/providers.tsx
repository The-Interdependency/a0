// 77:0
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useSEO } from "@/hooks/use-seo";
import { Loader2 } from "lucide-react";
import { ProviderPanel, type Provider } from "@/components/provider-panel";
import { cn } from "@/lib/utils";

export default function ProvidersPage() {
  useSEO({
    title: "Providers — a0p",
    description: "Visual provider and model routing controls.",
  });
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { data: providers, isLoading } = useQuery<Provider[]>({
    queryKey: ["/api/energy/providers"],
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const list = providers || [];
  const selected =
    list.find((p) => p.id === selectedId) ||
    list.find((p) => p.active) ||
    list[0] ||
    null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto" data-testid="page-providers">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Providers</h1>
          <p className="text-sm text-muted-foreground">
            Five role tasks · per-provider model assignments · optimizer presets
          </p>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-border pb-2">
          {list.map((p) => {
            const isSel = (selected?.id || "") === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedId(p.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors hover-elevate",
                  isSel ? "bg-accent/10 text-accent-foreground" : "text-muted-foreground",
                )}
                data-testid={`tab-provider-${p.id}`}
              >
                <span>{p.label}</span>
                {p.active && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" aria-label="active" />
                )}
                {!p.available && (
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-amber-500"
                    aria-label="no api key"
                  />
                )}
              </button>
            );
          })}
        </div>

        {selected ? (
          <ProviderPanel key={selected.id} p={selected} isAdmin={isAdmin} />
        ) : (
          <div className="text-sm text-muted-foreground">No providers configured.</div>
        )}
      </div>
    </div>
  );
}
// 77:0
