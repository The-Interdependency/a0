// 539:0
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bot, Zap, GitMerge, Plus, Loader2, Radio, CheckCircle2, Clock,
  ChevronDown, ChevronRight, Cpu, RefreshCw, ArrowDownUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import TabShell from "@/components/TabShell";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const ROLES = ["conduct", "perform", "practice", "record", "derive"] as const;
type Role = typeof ROLES[number];

const ROLE_LABELS: Record<Role, string> = {
  conduct: "Cnd",
  perform: "Prf",
  practice: "Prc",
  record: "Rec",
  derive: "Drv",
};

const PRESETS = ["speed", "depth", "price", "balance", "creativity"] as const;
type Preset = typeof PRESETS[number];

const PRESET_COLORS: Record<Preset, string> = {
  speed: "text-blue-500 border-blue-500/40",
  depth: "text-purple-500 border-purple-500/40",
  price: "text-green-500 border-green-500/40",
  balance: "text-orange-500 border-orange-500/40",
  creativity: "text-pink-500 border-pink-500/40",
};

interface AgentInstance {
  name: string;
  slot: string;
  status: string;
  is_persistent: boolean;
  energy_provider: string;
  uptime_s?: number;
  tools?: string[];
}

interface EnergyAvailability {
  id: string;
  label: string;
  available: boolean;
  active: boolean;
}

interface AvailableModel {
  id: string;
  context_window?: number;
  pricing?: { input_per_1m?: number; output_per_1m?: number };
  capabilities?: string[];
}

interface RouteConfig {
  model_assignments: Record<Role, string>;
  available_models: AvailableModel[];
  capabilities: Record<string, boolean>;
  presets: Record<Preset, Record<Role, string>>;
  pricing_url?: string;
  context_addendum?: string;
  enabled_tools?: string[];
  sub_agent_model?: string;
}

interface ProviderSeed {
  id: number;
  slug: string;
  provider_id: string;
  name: string;
  description: string;
  status: string;
  route_config: RouteConfig;
  pcna?: { infer_count: number; last_coherence: number; last_winner: string } | null;
}

function shortModelId(id: string): string {
  if (id.length <= 16) return id;
  const parts = id.split("-");
  if (parts.length <= 2) return id.slice(0, 14) + "…";
  return parts.slice(-2).join("-");
}

function fmtUptime(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${Math.floor(s % 60)}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

interface RoleCircleProps {
  role: Role;
  model: string;
  availableModels: AvailableModel[];
  onSelect: (model: string) => void;
  disabled?: boolean;
}

function RoleCircle({ role, model, availableModels, onSelect, disabled }: RoleCircleProps) {
  return (
    <div className="flex flex-col items-center gap-1 min-w-0">
      <div
        className="w-14 h-14 rounded-full border-2 border-primary/30 bg-primary/5 flex items-center justify-center text-[10px] font-bold text-primary shrink-0"
        data-testid={`circle-role-${role}`}
      >
        {ROLE_LABELS[role]}
      </div>
      <Select value={model} onValueChange={onSelect} disabled={disabled}>
        <SelectTrigger
          className="h-6 text-[9px] w-[72px] px-1 font-mono truncate"
          data-testid={`select-model-${role}`}
        >
          <SelectValue>{shortModelId(model)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {availableModels.map((m) => (
            <SelectItem key={m.id} value={m.id} className="text-xs font-mono">
              {m.id}
            </SelectItem>
          ))}
          {availableModels.length === 0 && (
            <SelectItem value={model} className="text-xs">{model}</SelectItem>
          )}
        </SelectContent>
      </Select>
      <span className="text-[8px] text-muted-foreground capitalize">{role}</span>
    </div>
  );
}

interface ProviderSeedCardProps {
  seed: ProviderSeed;
  isActive: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  availabilityInfo?: EnergyAvailability;
}

function ProviderSeedCard({ seed, isActive, isExpanded, onToggleExpand, availabilityInfo }: ProviderSeedCardProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const pid = seed.provider_id;
  const rc = seed.route_config || {} as RouteConfig;
  const assignments = rc.model_assignments || {} as Record<Role, string>;
  const available = rc.available_models || [];

  const patchMutation = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const res = await apiRequest("PATCH", `/api/energy/providers/${pid}/route_config`, { patch });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/energy/providers"] });
      toast({ title: "Model updated" });
    },
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const optimizeMutation = useMutation({
    mutationFn: async (preset: string) => {
      const res = await apiRequest("POST", `/api/energy/optimize/${pid}`, { preset });
      return res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/energy/providers"] });
      toast({ title: `Preset applied`, description: data.preset_applied });
    },
    onError: (e: Error) => toast({ title: "Preset failed", description: e.message, variant: "destructive" }),
  });

  const discoverMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/energy/discover/${pid}`, {});
      return res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/energy/providers"] });
      toast({ title: "Models refreshed", description: `${data.available_models?.length ?? 0} models` });
    },
    onError: (e: Error) => toast({ title: "Discover failed", description: e.message, variant: "destructive" }),
  });

  const convergeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/energy/converge/${pid}`, {});
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "PCNA merged", description: `coherence: ${data.main_coherence}` });
    },
    onError: (e: Error) => toast({ title: "Converge failed", description: e.message, variant: "destructive" }),
  });

  const setActiveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/v1/agents/energy-providers/active", { provider_id: pid });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/v1/agents/energy-providers"] });
      qc.invalidateQueries({ queryKey: ["/api/v1/agents"] });
      toast({ title: "Provider switched", description: pid });
    },
    onError: (e: Error) => toast({ title: "Switch failed", description: e.message, variant: "destructive" }),
  });

  const isUnavailable = availabilityInfo && !availabilityInfo.available;

  return (
    <Card
      className={`overflow-hidden transition-colors ${isActive ? "border-primary/50 bg-primary/5" : ""} ${isUnavailable ? "opacity-60" : ""}`}
      data-testid={`card-provider-seed-${pid}`}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between gap-2 px-4 py-3 cursor-pointer select-none"
        onClick={onToggleExpand}
        data-testid={`header-provider-${pid}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Cpu className={`h-4 w-4 shrink-0 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
          <span className="text-sm font-medium truncate">{seed.name}</span>
          {isActive && (
            <Badge variant="outline" className="text-primary border-primary/30 text-[10px] shrink-0" data-testid={`badge-active-${pid}`}>
              active
            </Badge>
          )}
          {isUnavailable && (
            <Badge variant="destructive" className="text-[10px] shrink-0">no key</Badge>
          )}
          {seed.pcna && (
            <span className="text-[10px] text-muted-foreground font-mono shrink-0">
              Φ{seed.pcna.last_coherence.toFixed(3)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!isActive && availabilityInfo?.available && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-xs px-2"
              onClick={(e) => { e.stopPropagation(); setActiveMutation.mutate(); }}
              disabled={setActiveMutation.isPending}
              data-testid={`btn-set-active-${pid}`}
            >
              {setActiveMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Use"}
            </Button>
          )}
          {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>

      {isExpanded && (
        <div className="px-4 pb-4 flex flex-col gap-4 border-t border-border/50 pt-3">
          {/* Optimizer presets */}
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 font-semibold">Optimizer preset</p>
            <div className="flex gap-1 flex-wrap">
              {PRESETS.map((p) => (
                <Button
                  key={p}
                  size="sm"
                  variant="outline"
                  className={`h-6 text-[10px] px-2 capitalize border ${PRESET_COLORS[p]}`}
                  onClick={() => optimizeMutation.mutate(p)}
                  disabled={optimizeMutation.isPending}
                  data-testid={`btn-preset-${pid}-${p}`}
                >
                  {optimizeMutation.isPending ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : p}
                </Button>
              ))}
            </div>
          </div>

          {/* Role circles */}
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3 font-semibold">Task roles → models</p>
            <div className="flex gap-3 justify-between">
              {ROLES.map((role) => (
                <RoleCircle
                  key={role}
                  role={role}
                  model={assignments[role] || ""}
                  availableModels={available}
                  onSelect={(model) => patchMutation.mutate({ model_assignments: { [role]: model } })}
                  disabled={patchMutation.isPending}
                />
              ))}
            </div>
            {rc.sub_agent_model && (
              <p className="text-[10px] text-muted-foreground mt-2 font-mono">
                sub-agent: {rc.sub_agent_model}
              </p>
            )}
          </div>

          {/* Capabilities */}
          {rc.capabilities && Object.keys(rc.capabilities).length > 0 && (
            <div className="flex flex-wrap gap-1">
              {Object.entries(rc.capabilities)
                .filter(([, v]) => v)
                .map(([cap]) => (
                  <Badge key={cap} variant="secondary" className="text-[9px]">
                    {cap.replace(/_/g, " ")}
                  </Badge>
                ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1"
              onClick={() => discoverMutation.mutate()}
              disabled={discoverMutation.isPending}
              data-testid={`btn-discover-${pid}`}
            >
              {discoverMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Discover
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1"
              onClick={() => convergeMutation.mutate()}
              disabled={convergeMutation.isPending}
              data-testid={`btn-converge-${pid}`}
            >
              {convergeMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowDownUp className="h-3 w-3" />}
              Converge
            </Button>
            {rc.pricing_url && (
              <a
                href={rc.pricing_url}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto text-[10px] text-muted-foreground underline underline-offset-2 self-center"
                data-testid={`link-pricing-${pid}`}
              >
                pricing ↗
              </a>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

export default function AgentsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [spawnProvider, setSpawnProvider] = useState<string>("");
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set(["openai"]));

  const { data: agents = [], isLoading: agentsLoading, refetch: refetchAgents } = useQuery<AgentInstance[]>({
    queryKey: ["/api/v1/agents"],
    refetchInterval: 5000,
  });

  const { data: availabilityList = [], isLoading: availLoading } = useQuery<EnergyAvailability[]>({
    queryKey: ["/api/v1/agents/energy-providers"],
    refetchInterval: 15000,
  });

  const { data: providerSeeds = [], isLoading: seedsLoading } = useQuery<ProviderSeed[]>({
    queryKey: ["/api/energy/providers"],
    refetchInterval: 30000,
  });

  const activeProviderId = availabilityList.find((p) => p.active)?.id ?? "";

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

  const primary = agents.find((a) => a.is_persistent);
  const subAgents = agents.filter((a) => !a.is_persistent);

  const toggleExpand = (pid: string) => {
    setExpandedProviders((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid);
      else next.add(pid);
      return next;
    });
  };

  const availabilityMap = Object.fromEntries(availabilityList.map((a) => [a.id, a]));
  const isLoadingProviders = availLoading || seedsLoading;

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
                    <p className="text-xs text-muted-foreground">slot: {primary.slot} · {primary.energy_provider}</p>
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

        {/* Energy Providers — seed+circles layout */}
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3" data-testid="section-header-energy">
            Energy Providers
          </h3>
          {isLoadingProviders ? (
            <div className="flex items-center justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : providerSeeds.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center border border-dashed border-border rounded-md">
              No provider seeds found. They will be created on next server restart.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {providerSeeds.map((seed) => (
                <ProviderSeedCard
                  key={seed.slug}
                  seed={seed}
                  isActive={seed.provider_id === activeProviderId}
                  isExpanded={expandedProviders.has(seed.provider_id)}
                  onToggleExpand={() => toggleExpand(seed.provider_id)}
                  availabilityInfo={availabilityMap[seed.provider_id]}
                />
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
              <Select value={spawnProvider} onValueChange={setSpawnProvider}>
                <SelectTrigger className="h-7 text-xs w-28" data-testid="select-spawn-provider">
                  <SelectValue placeholder={activeProviderId || "provider"} />
                </SelectTrigger>
                <SelectContent>
                  {availabilityList.filter((p) => p.available).map((p) => (
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
// 539:0
