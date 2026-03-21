import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Package, Zap } from "lucide-react";

type BuiltinTool = { name: string; description: string; required: string[] };

export function BuiltinTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: tools = [], isLoading: toolsLoading } = useQuery<BuiltinTool[]>({
    queryKey: ["/api/v1/agent/tools"],
    staleTime: 60000,
  });

  const { data: toggles = {}, isLoading: togglesLoading } = useQuery<Record<string, boolean>>({
    queryKey: ["/api/v1/agent/tool-toggles"],
    staleTime: 10000,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ name, enabled }: { name: string; enabled: boolean }) =>
      apiRequest("PATCH", "/api/v1/agent/tool-toggles", { updates: { [name]: enabled } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/agent/tool-toggles"] });
    },
    onError: (e: any) => toast({ title: "Toggle failed", description: e.message, variant: "destructive" }),
  });

  const disabledCount = Object.values(toggles).filter(v => !v).length;

  return (
    <div className="h-full w-full overflow-y-auto overflow-x-hidden px-3 py-3 space-y-3">
      <div className="flex items-center gap-2">
        <Package className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold" data-testid="text-builtin-title">Built-in Tools</h3>
        <Badge variant="outline" className="text-xs ml-auto">{tools.length} tools</Badge>
        {disabledCount > 0 && (
          <Badge variant="destructive" className="text-xs">{disabledCount} disabled</Badge>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Toggle individual tools on/off. Disabled tools are excluded from the agent's available actions.
      </p>

      {(toolsLoading || togglesLoading) ? (
        <div className="space-y-2">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-16" />)}</div>
      ) : (
        <div className="space-y-1.5">
          {tools.map((tool) => {
            const enabled = toggles[tool.name] !== false;
            return (
              <div
                key={tool.name}
                className="rounded-lg border border-border bg-card p-3 space-y-1.5"
                data-testid={`tool-${tool.name}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Zap className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    <span className="text-xs font-mono font-medium truncate">{tool.name}</span>
                  </div>
                  <Switch
                    checked={enabled}
                    onCheckedChange={v => toggleMutation.mutate({ name: tool.name, enabled: v })}
                    disabled={toggleMutation.isPending}
                    data-testid={`switch-tool-${tool.name}`}
                  />
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{tool.description}</p>
                {tool.required?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {tool.required.map(p => (
                      <Badge key={p} variant="secondary" className="text-xs">{p}</Badge>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
