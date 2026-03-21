import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { BarChart2, Save, Settings, ToggleLeft, ToggleRight } from "lucide-react";

type BuiltinTool = { name: string; description: string };

export function PermissionsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [cmdText, setCmdText] = useState<string | null>(null);

  const { data: tools = [], isLoading: toolsLoading } = useQuery<BuiltinTool[]>({
    queryKey: ["/api/v1/agent/tools"],
    staleTime: 60000,
  });

  const { data: toggles = {}, isLoading: togglesLoading } = useQuery<Record<string, boolean>>({
    queryKey: ["/api/v1/agent/tool-toggles"],
    staleTime: 10000,
  });

  const { data: extraCmds } = useQuery<{ commands?: string[] }>({
    queryKey: ["/api/v1/allowed-commands-extra"],
    staleTime: 15000,
  });

  const { data: auditData } = useQuery<{ logs: any[] }>({
    queryKey: ["/api/v1/audit?page=1&domain=all&search="],
    staleTime: 60000,
  });

  const toolFireCounts = useMemo(() => {
    if (!auditData?.logs) return [];
    const counts: Record<string, number> = {};
    for (const entry of auditData.logs) {
      const toolName = entry.params?.tool || entry.params?.toolName || entry.params?.name ||
        entry.params?.toolCall?.name || entry.params?.tool_name;
      if (toolName && typeof toolName === "string") {
        counts[toolName] = (counts[toolName] ?? 0) + 1;
      }
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [auditData]);

  const toggleMutation = useMutation({
    mutationFn: (updates: Record<string, boolean>) =>
      apiRequest("PATCH", "/api/v1/agent/tool-toggles", { updates }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/agent/tool-toggles"] });
      toast({ title: "Toggles updated" });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const cmdsMutation = useMutation({
    mutationFn: (commands: string[]) =>
      apiRequest("POST", "/api/v1/allowed-commands-extra", { commands }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/allowed-commands-extra"] });
      toast({ title: "Commands saved" });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  function enableAll() {
    const updates: Record<string, boolean> = {};
    tools.forEach(t => { updates[t.name] = true; });
    toggleMutation.mutate(updates);
  }

  function disableAll() {
    const updates: Record<string, boolean> = {};
    tools.forEach(t => { updates[t.name] = false; });
    toggleMutation.mutate(updates);
  }

  function saveCommands() {
    const cmds = effectiveCmds.split("\n").map(s => s.trim()).filter(Boolean);
    cmdsMutation.mutate(cmds);
  }

  const effectiveCmds = cmdText ?? (extraCmds?.commands || []).join("\n");
  const enabledCount = Object.values(toggles).filter(v => v).length;
  const disabledCount = Object.values(toggles).filter(v => !v).length;

  return (
    <div className="h-full w-full overflow-y-auto overflow-x-hidden px-3 py-3 space-y-4">
      <div className="flex items-center gap-2">
        <Settings className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold" data-testid="text-permissions-title">Tool Permissions</h3>
      </div>

      <div className="rounded-lg border border-border bg-card p-3 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Bulk Toggle</h4>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{enabledCount} enabled</span>
            <span>·</span>
            <span>{disabledCount} disabled</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="flex-1 h-7 text-xs"
            onClick={enableAll}
            disabled={toggleMutation.isPending}
            data-testid="button-enable-all-tools"
          >
            <ToggleRight className="w-3.5 h-3.5 mr-1" />Enable All
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 h-7 text-xs"
            onClick={disableAll}
            disabled={toggleMutation.isPending}
            data-testid="button-disable-all-tools"
          >
            <ToggleLeft className="w-3.5 h-3.5 mr-1" />Disable All
          </Button>
        </div>
      </div>

      {(toolsLoading || togglesLoading) ? (
        <div className="space-y-1.5">{[1,2,3].map(i => <Skeleton key={i} className="h-10" />)}</div>
      ) : (
        <div className="space-y-1">
          {tools.map(tool => {
            const enabled = toggles[tool.name] !== false;
            return (
              <div
                key={tool.name}
                className="flex items-center justify-between rounded border border-border bg-card px-3 py-2"
                data-testid={`perm-tool-${tool.name}`}
              >
                <span className="text-xs font-mono truncate flex-1">{tool.name}</span>
                <Switch
                  checked={enabled}
                  onCheckedChange={v => toggleMutation.mutate({ [tool.name]: v })}
                  disabled={toggleMutation.isPending}
                  data-testid={`switch-perm-${tool.name}`}
                />
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-lg border border-border bg-card p-3 space-y-2">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Allowed Commands (Extra)</h4>
        <p className="text-xs text-muted-foreground">One command prefix per line.</p>
        <Textarea
          className="text-xs font-mono min-h-[100px]"
          placeholder={"git\nnpm\npython"}
          value={effectiveCmds}
          onChange={e => setCmdText(e.target.value)}
          data-testid="textarea-extra-cmds"
        />
        <Button
          size="sm"
          variant="outline"
          className="w-full h-7 text-xs"
          onClick={saveCommands}
          disabled={cmdsMutation.isPending}
          data-testid="button-save-extra-cmds"
        >
          <Save className="w-3.5 h-3.5 mr-1" />Save Commands
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-card p-3 space-y-2">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-3.5 h-3.5 text-muted-foreground" />
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tool Fire Frequency (Heartbeat)</h4>
        </div>
        {toolFireCounts.length === 0 ? (
          <p className="text-xs text-muted-foreground">No tool-fire events found in recent heartbeat logs.</p>
        ) : (
          <div className="space-y-1" data-testid="tool-fire-analytics">
            {toolFireCounts.map(([name, count]) => {
              const max = toolFireCounts[0]?.[1] ?? 1;
              const pct = Math.round((count / max) * 100);
              return (
                <div key={name} className="flex items-center gap-2" data-testid={`fire-row-${name}`}>
                  <span className="text-xs font-mono w-36 truncate flex-shrink-0">{name}</span>
                  <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
                    <div className="bg-primary h-full rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <Badge variant="outline" className="text-xs flex-shrink-0">{count}</Badge>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
