import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Save, Sliders } from "lucide-react";

export function ControlTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: behavior, isLoading: behaviorLoading } = useQuery<{ maxToolRounds: number; pursueToCompletion: boolean; heartbeatEnabled: boolean }>({
    queryKey: ["/api/v1/agent/behavior"],
    staleTime: 10000,
  });

  const { data: extraToggle } = useQuery<{ commands?: string[] }>({
    queryKey: ["/api/v1/allowed-commands-extra"],
    staleTime: 15000,
  });

  const [maxRounds, setMaxRounds] = useState<number | null>(null);
  const [pursue, setPursue] = useState<boolean | null>(null);
  const [heartbeatEnabled, setHeartbeatEnabled] = useState<boolean | null>(null);
  const [cmdText, setCmdText] = useState<string | null>(null);

  const effectiveRounds = maxRounds ?? behavior?.maxToolRounds ?? 25;
  const effectivePursue = pursue ?? behavior?.pursueToCompletion ?? false;
  const effectiveHeartbeat = heartbeatEnabled ?? behavior?.heartbeatEnabled ?? true;
  const effectiveCmds = cmdText ?? (extraToggle?.commands || []).join("\n");

  const behaviorMutation = useMutation({
    mutationFn: (data: { maxToolRounds?: number; pursueToCompletion?: boolean; heartbeatEnabled?: boolean }) =>
      apiRequest("PATCH", "/api/v1/agent/behavior", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/agent/behavior"] });
      toast({ title: "Behavior updated" });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const cmdsMutation = useMutation({
    mutationFn: (commands: string[]) =>
      apiRequest("POST", "/api/v1/allowed-commands-extra", { commands }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/allowed-commands-extra"] });
      toast({ title: "Commands updated" });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  function saveBehavior() {
    behaviorMutation.mutate({ maxToolRounds: effectiveRounds, pursueToCompletion: effectivePursue, heartbeatEnabled: effectiveHeartbeat });
  }

  function saveCommands() {
    const cmds = effectiveCmds.split("\n").map(s => s.trim()).filter(Boolean);
    cmdsMutation.mutate(cmds);
  }

  if (behaviorLoading) return <div className="p-4"><Skeleton className="h-60" /></div>;

  return (
    <div className="h-full w-full overflow-y-auto overflow-x-hidden px-3 py-3 space-y-4">
      <div className="flex items-center gap-2">
        <Sliders className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold" data-testid="text-control-title">Agent Behavior Control</h3>
      </div>

      <div className="rounded-lg border border-border bg-card p-3 space-y-4">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tool Round Limit</h4>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs">Max Tool Rounds</span>
            <Badge variant="outline" data-testid="text-max-rounds">{effectiveRounds}</Badge>
          </div>
          <Slider
            min={5}
            max={50}
            step={1}
            value={[effectiveRounds]}
            onValueChange={([v]) => setMaxRounds(v)}
            data-testid="slider-max-rounds"
          />
          <p className="text-xs text-muted-foreground">Maximum consecutive tool calls per agent turn (5–50).</p>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-3 space-y-3">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Execution Flags</h4>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Agent Enabled (Heartbeat)</p>
            <p className="text-xs text-muted-foreground">Globally enable or disable the autonomous heartbeat scheduler.</p>
          </div>
          <Switch
            checked={effectiveHeartbeat}
            onCheckedChange={v => setHeartbeatEnabled(v)}
            data-testid="switch-heartbeat-enabled"
          />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Pursue to Completion</p>
            <p className="text-xs text-muted-foreground">Agent keeps working until task is done or rounds exhausted.</p>
          </div>
          <Switch
            checked={effectivePursue}
            onCheckedChange={v => setPursue(v)}
            data-testid="switch-pursue-completion"
          />
        </div>
      </div>

      <Button
        size="sm"
        className="w-full"
        onClick={saveBehavior}
        disabled={behaviorMutation.isPending}
        data-testid="button-save-behavior"
      >
        <Save className="w-3.5 h-3.5 mr-1.5" />
        Save Behavior
      </Button>

      <div className="rounded-lg border border-border bg-card p-3 space-y-3">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Allowed Commands (Extra)</h4>
        <p className="text-xs text-muted-foreground">One command prefix per line. These are added to the default allowlist.</p>
        <Textarea
          className="text-xs font-mono min-h-[120px]"
          placeholder={"git\nnpm\npython"}
          value={effectiveCmds}
          onChange={e => setCmdText(e.target.value)}
          data-testid="textarea-allowed-commands"
        />
        <Button
          size="sm"
          variant="outline"
          className="w-full"
          onClick={saveCommands}
          disabled={cmdsMutation.isPending}
          data-testid="button-save-commands"
        >
          <Save className="w-3.5 h-3.5 mr-1.5" />
          Save Commands
        </Button>
      </div>
    </div>
  );
}
