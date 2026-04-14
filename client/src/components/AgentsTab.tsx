// 138:0
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bot, Zap, GitMerge, Plus, Loader2, Radio, CheckCircle2, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import TabShell from "@/components/TabShell";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface AgentInstance {
  name: string;
  slot: string;
  status: string;
  is_persistent: boolean;
  energy_provider: string;
  uptime_s?: number;
  tools?: string[];
  sentinel_seeds?: number[];
}

interface EnergyProvider {
  id: string;
  label: string;
  available: boolean;
  active: boolean;
}

function fmtUptime(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${Math.floor(s % 60)}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

export default function AgentsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [spawnProvider, setSpawnProvider] = useState<string>("");

  const { data: agents = [], isLoading: agentsLoading, refetch: refetchAgents } = useQuery<AgentInstance[]>({
    queryKey: ["/api/v1/agents"],
    refetchInterval: 5000,
  });

  const { data: providers = [], isLoading: providersLoading } = useQuery<EnergyProvider[]>({
    queryKey: ["/api/v1/agents/energy-providers"],
    refetchInterval: 15000,
  });

  const activeProvider = providers.find((p) => p.active)?.id ?? "";

  const spawnMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/v1/agents/spawn", {
        provider: spawnProvider || undefined,
      });
      return res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/v1/agents"] });
      toast({ title: "Sub-agent spawned", description: data.sub_agent_name });
      setSpawnProvider("");
    },
    onError: (e: Error) => toast({ title: "Spawn failed", description: e.message, variant: "destructive" }),
  });

  const mergeMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", `/api/v1/agents/${encodeURIComponent(name)}/merge`, {});
      return res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/v1/agents"] });
      toast({ title: "Merged", description: `${data.retired_agent} absorbed into primary` });
    },
    onError: (e: Error) => toast({ title: "Merge failed", description: e.message, variant: "destructive" }),
  });

  const setProviderMutation = useMutation({
    mutationFn: async (providerId: string) => {
      const res = await apiRequest("POST", "/api/v1/agents/energy-providers/active", {
        provider_id: providerId,
      });
      return res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/v1/agents/energy-providers"] });
      qc.invalidateQueries({ queryKey: ["/api/v1/agents"] });
      toast({ title: "Provider switched", description: data.agent_name });
    },
    onError: (e: Error) => toast({ title: "Provider switch failed", description: e.message, variant: "destructive" }),
  });

  const primary = agents.find((a) => a.is_persistent);
  const subAgents = agents.filter((a) => !a.is_persistent);

  return (
    <TabShell
      label="Agents"
      icon="Bot"
      onRefresh={async () => { await refetchAgents(); }}
      isRefreshing={agentsLoading}
    >
      <div className="flex flex-col gap-6">

        {/* Primary Agent */}
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3" data-testid="section-header-primary">
            Primary Agent
          </h3>
          {agentsLoading ? (
            <div className="flex items-center justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : primary ? (
            <Card className="p-4" data-testid="card-primary-agent">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Bot className="h-5 w-5 text-primary shrink-0" />
                  <div>
                    <p className="text-sm font-mono font-medium" data-testid="text-primary-name">{primary.name}</p>
                    <p className="text-xs text-muted-foreground">slot: {primary.slot}</p>
                  </div>
                </div>
                <Badge variant="outline" className="text-green-500 border-green-500/30 shrink-0" data-testid="status-primary">
                  <CheckCircle2 className="h-3 w-3 mr-1" /> active
                </Badge>
              </div>
              {primary.tools && (
                <div className="mt-3 flex flex-wrap gap-1" data-testid="tools-primary">
                  {primary.tools.map((t) => (
                    <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                  ))}
                </div>
              )}
            </Card>
          ) : (
            <p className="text-xs text-muted-foreground">No primary agent found.</p>
          )}
        </div>

        <Separator />

        {/* Energy Provider */}
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3" data-testid="section-header-energy">
            Energy Provider
          </h3>
          {providersLoading ? (
            <div className="flex items-center justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="flex flex-col gap-2">
              {providers.map((p) => (
                <Card
                  key={p.id}
                  className={`p-3 flex items-center justify-between gap-2 transition-colors ${p.active ? "border-primary/40 bg-primary/5" : ""}`}
                  data-testid={`card-provider-${p.id}`}
                >
                  <div className="flex items-center gap-2">
                    <Radio className={`h-3.5 w-3.5 ${p.active ? "text-primary" : "text-muted-foreground"}`} />
                    <span className="text-sm font-mono">{p.id}</span>
                    {p.label && p.label !== p.id && (
                      <span className="text-xs text-muted-foreground">{p.label}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {!p.available && (
                      <Badge variant="destructive" className="text-[10px]">unavailable</Badge>
                    )}
                    {p.active ? (
                      <Badge variant="outline" className="text-primary border-primary/30 text-[10px]">active</Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-xs"
                        disabled={!p.available || setProviderMutation.isPending}
                        onClick={() => setProviderMutation.mutate(p.id)}
                        data-testid={`btn-set-provider-${p.id}`}
                      >
                        {setProviderMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Switch"}
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        <Separator />

        {/* Sub-agents */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider" data-testid="section-header-subagents">
              PCNA Sub-agents ({subAgents.length})
            </h3>
            <div className="flex items-center gap-2">
              <Select
                value={spawnProvider}
                onValueChange={setSpawnProvider}
              >
                <SelectTrigger className="h-7 text-xs w-28" data-testid="select-spawn-provider">
                  <SelectValue placeholder={activeProvider || "provider"} />
                </SelectTrigger>
                <SelectContent>
                  {providers.filter((p) => p.available).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => spawnMutation.mutate()}
                disabled={spawnMutation.isPending}
                data-testid="btn-spawn-subagent"
              >
                {spawnMutation.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Plus className="h-3 w-3" />
                )}
                Spawn
              </Button>
            </div>
          </div>

          {subAgents.length === 0 ? (
            <div className="text-xs text-muted-foreground py-4 text-center border border-dashed border-border rounded-md" data-testid="subagents-empty">
              No active sub-agents. Spawn one above.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {subAgents.map((sa) => (
                <Card key={sa.name} className="p-3 flex items-center justify-between gap-3" data-testid={`card-subagent-${sa.name}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <Zap className="h-4 w-4 text-yellow-500 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-mono font-medium truncate" data-testid={`text-subagent-name-${sa.name}`}>{sa.name}</p>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span>slot: {sa.slot}</span>
                        {sa.uptime_s !== undefined && (
                          <span className="flex items-center gap-0.5">
                            <Clock className="h-2.5 w-2.5" />
                            {fmtUptime(sa.uptime_s)}
                          </span>
                        )}
                        <span className="flex items-center gap-0.5">
                          <Radio className="h-2.5 w-2.5" />
                          {sa.energy_provider}
                        </span>
                      </div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1 shrink-0"
                    onClick={() => mergeMutation.mutate(sa.name)}
                    disabled={mergeMutation.isPending}
                    data-testid={`btn-merge-${sa.name}`}
                  >
                    {mergeMutation.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <GitMerge className="h-3 w-3" />
                    )}
                    Merge
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </div>

      </div>
    </TabShell>
  );
}
// 138:0
