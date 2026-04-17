// 237:0
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bot, Zap, GitMerge, Plus, Loader2, Radio, CheckCircle2, Clock,
  RefreshCw, ChevronDown, ChevronUp, Settings2, Cpu, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
}

interface EnergyAvailability {
  id: string;
  label: string;
  available: boolean;
  active: boolean;
}

interface ModelInfo {
  id: string;
  context_window?: number;
  pricing?: { input_per_1m?: number; output_per_1m?: number; cached_per_1m?: number };
  capabilities?: Record<string, boolean>;
  stale?: boolean;
  note?: string;
}

interface ProviderSeed {
  id: string;
  label: string;
  vendor: string;
  available: boolean;
  active: boolean;
  route_config: {
    model_assignments?: Record<string, string>;
    available_models?: ModelInfo[];
    enabled_tools?: string[];
    capabilities?: Record<string, boolean>;
    presets?: Record<string, Record<string, string>>;
    active_preset?: string;
    prices_updated_at?: number | null;
  };
  seed_updated_at?: string | null;
}

const ROLES = ["record", "practice", "conduct", "perform", "derive"] as const;
type Role = typeof ROLES[number];

const ROLE_COLORS: Record<Role, string> = {
  record: "bg-slate-500/20 text-slate-300 border-slate-500/40",
  practice: "bg-blue-500/20 text-blue-300 border-blue-500/40",
  conduct: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  perform: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  derive: "bg-violet-500/20 text-violet-300 border-violet-500/40",
};

const OPTIMIZER_MODES = ["speed", "depth", "price", "balance", "creativity"] as const;
type OptimizerMode = typeof OPTIMIZER_MODES[number];

const MODE_COLORS: Record<OptimizerMode, string> = {
  speed: "text-cyan-400 border-cyan-500/40 bg-cyan-500/10",
  depth: "text-violet-400 border-violet-500/40 bg-violet-500/10",
  price: "text-green-400 border-green-500/40 bg-green-500/10",
  balance: "text-blue-400 border-blue-500/40 bg-blue-500/10",
  creativity: "text-pink-400 border-pink-500/40 bg-pink-500/10",
};
function fmtUptime(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${Math.floor(s % 60)}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

function fmtPrice(p?: number): string {
  if (p == null) return "—";
  if (p < 0.01) return `$${(p * 1000).toFixed(2)}/1B`;
  return `$${p.toFixed(2)}/1M`;
}

function fmtContext(n?: number): string {
  if (!n) return "";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

function CapBadges({ caps }: { caps?: Record<string, boolean> }) {
  if (!caps) return null;
  const active = Object.entries(caps).filter(([, v]) => v).map(([k]) => k);
  if (!active.length) return null;
  const labels: Record<string, string> = {
    reasoning: "reason",
    search: "search",
    grounding: "ground",
    extended_thinking: "think",
    multi_agent: "multi",
    native_search: "search",
    streaming: "stream",
  };
  return (
    <div className="flex flex-wrap gap-0.5 mt-1">
      {active.slice(0, 3).map((k) => (
        <span key={k} className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary/70 border border-primary/20">
          {labels[k] || k}
        </span>
      ))}
    </div>
  );
}

interface ModelCircleProps {
  model: ModelInfo;
  roles: Role[];
  allModels: ModelInfo[];
  onRoleClick: (role: Role) => void;
  onRoleReassign: (role: Role, newModel: string) => void;
}

function ModelCircle({ model, roles, allModels, onRoleClick, onRoleReassign }: ModelCircleProps) {
  const [openRole, setOpenRole] = useState<Role | null>(null);

  return (
    <div
      className={`relative rounded-xl border p-3 flex flex-col gap-1.5 transition-all ${
        roles.length > 0
          ? "border-primary/30 bg-primary/5"
          : "border-border bg-card/40"
      } ${model.stale ? "opacity-60" : ""}`}
      data-testid={`card-model-${model.id}`}
    >
      {model.stale && (
        <span className="absolute top-1.5 right-1.5 text-[9px] px-1 py-0 rounded bg-destructive/20 text-destructive border border-destructive/30">stale</span>
      )}

      <div className="font-mono text-[11px] font-medium text-foreground truncate pr-6" title={model.id}>
        {model.id}
      </div>

      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        {model.context_window ? (
          <span title="context window">{fmtContext(model.context_window)} ctx</span>
        ) : null}
        {model.pricing?.input_per_1m != null ? (
          <span title="input cost per 1M tokens">in {fmtPrice(model.pricing.input_per_1m)}</span>
        ) : null}
        {model.pricing?.output_per_1m != null ? (
          <span title="output cost per 1M tokens">out {fmtPrice(model.pricing.output_per_1m)}</span>
        ) : null}
      </div>

      <CapBadges caps={model.capabilities} />

      {/* Role tags */}
      {roles.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-0.5">
          {roles.map((role) => (
            <Popover
              key={role}
              open={openRole === role}
              onOpenChange={(o) => setOpenRole(o ? role : null)}
            >
              <PopoverTrigger asChild>
                <button
                  className={`text-[10px] px-1.5 py-0.5 rounded border cursor-pointer hover:opacity-80 transition-opacity ${ROLE_COLORS[role]}`}
                  data-testid={`role-tag-${role}-${model.id}`}
                  onClick={() => onRoleClick(role)}
                >
                  {role}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-2" align="start">
                <p className="text-xs text-muted-foreground mb-1.5">Reassign <span className="font-medium text-foreground">{role}</span> to:</p>
                <div className="flex flex-col gap-1">
                  {allModels.filter((m) => m.id !== model.id).map((m) => (
                    <button
                      key={m.id}
                      className="text-left text-xs px-2 py-1 rounded hover:bg-accent transition-colors font-mono truncate"
                      data-testid={`reassign-${role}-to-${m.id}`}
                      onClick={() => {
                        onRoleReassign(role, m.id);
                        setOpenRole(null);
                      }}
                    >
                      {m.id}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          ))}
        </div>
      )}

      {model.note && (
        <p className="text-[9px] text-muted-foreground/60 italic">{model.note}</p>
      )}
    </div>
  );
}

interface ProviderPanelProps {
  provider: ProviderSeed;
  onSetActive: (id: string) => void;
  isSettingActive: boolean;
}

function ProviderPanel({ provider, onSetActive, isSettingActive }: ProviderPanelProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [collapsed, setCollapsed] = useState(false);

  const rc = provider.route_config || {};
  const assignments: Record<string, string> = rc.model_assignments || {};
  const availableModels: ModelInfo[] = rc.available_models || [];
  const activePreset: string = rc.active_preset || "balance";

  // Compute which roles map to each model
  const modelRoles: Record<string, Role[]> = {};
  for (const role of ROLES) {
    const modelId = assignments[role];
    if (modelId) {
      if (!modelRoles[modelId]) modelRoles[modelId] = [];
      modelRoles[modelId].push(role);
    }
  }

  const optimizeMutation = useMutation({
    mutationFn: async (mode: string) => {
      const res = await apiRequest("POST", `/api/energy/providers/${provider.id}/optimize`, { mode });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/energy/providers"] });
      qc.invalidateQueries({ queryKey: ["/api/v1/agents"] });
      toast({ title: "Optimizer applied", description: `${provider.id} set to ${optimizeMutation.variables}` });
    },
    onError: (e: Error) => toast({ title: "Optimize failed", description: e.message, variant: "destructive" }),
  });

  const discoverMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/energy/discover/${provider.id}`, {});
      return res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/energy/providers"] });
      toast({ title: "Discovery complete", description: `${data.discovered} models found for ${provider.id}` });
    },
    onError: (e: Error) => toast({ title: "Discovery failed", description: e.message, variant: "destructive" }),
  });

  const convergeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/energy/converge/${provider.id}`, {});
      return res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/energy/providers"] });
      qc.invalidateQueries({ queryKey: ["/api/v1/agents"] });
      toast({ title: "PCNA merged", description: `coherence: ${data.main_coherence}` });
    },
    onError: (e: Error) => toast({ title: "Converge failed", description: e.message, variant: "destructive" }),
  });

  const handleSetActive = () => {
    onSetActive(provider.id);
  };

  const isUnavailable = !provider.available;

  const reassignMutation = useMutation({
    mutationFn: async ({ newAssignments }: { newAssignments: Record<string, string> }) => {
      const res = await apiRequest("PATCH", `/api/energy/providers/${provider.id}/seed`, {
        model_assignments: newAssignments,
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/energy/providers"] });
    },
    onError: (e: Error) => toast({ title: "Reassign failed", description: e.message, variant: "destructive" }),
  });

  const handleRoleReassign = (role: Role, newModelId: string) => {
    const newAssignments = { ...assignments, [role]: newModelId };
    reassignMutation.mutate({ newAssignments });
  };

  const pricesTs = rc.prices_updated_at;
  const pricesAge = pricesTs ? Math.round((Date.now() / 1000 - pricesTs) / 3600) : null;

  return (
    <Card
      className={`overflow-hidden transition-all ${
        provider.active ? "border-primary/40 shadow-sm shadow-primary/10" : "border-border"
      }`}
      data-testid={`card-provider-${provider.id}`}
    >
      {/* Provider Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <Radio className={`h-3.5 w-3.5 shrink-0 ${provider.active ? "text-primary" : "text-muted-foreground"}`} />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-medium">{provider.id}</span>
              <span className="text-xs text-muted-foreground">{provider.label}</span>
              {isUnavailable && (
                <Badge variant="destructive" className="text-[10px]">no key</Badge>
              )}
            </div>
            {pricesAge != null && (
              <p className="text-[10px] text-muted-foreground/60">prices updated {pricesAge}h ago</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={() => discoverMutation.mutate()}
            disabled={discoverMutation.isPending || isUnavailable}
            title="Refresh model list"
            data-testid={`btn-discover-${provider.id}`}
          >
            {discoverMutation.isPending
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>

          {provider.active ? (
            <Badge variant="outline" className="text-primary border-primary/30 text-[10px] h-6">active</Badge>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-xs"
              disabled={isUnavailable || isSettingActive}
              onClick={handleSetActive}
              data-testid={`btn-set-provider-${provider.id}`}
            >
              {isSettingActive ? <Loader2 className="h-3 w-3 animate-spin" /> : "Use"}
            </Button>
          )}

          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-muted-foreground"
            onClick={() => setCollapsed(!collapsed)}
            data-testid={`btn-collapse-${provider.id}`}
          >
            {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {!collapsed && (
        <div className="p-4 flex flex-col gap-4">
          {/* Optimizer selector */}
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Optimizer</p>
            <div className="flex gap-1 flex-wrap">
              {OPTIMIZER_MODES.map((mode) => (
                <button
                  key={mode}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                    activePreset === mode
                      ? MODE_COLORS[mode]
                      : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
                  }`}
                  onClick={() => optimizeMutation.mutate(mode)}
                  disabled={optimizeMutation.isPending}
                  data-testid={`btn-optimize-${provider.id}-${mode}`}
                >
                  {optimizeMutation.isPending && optimizeMutation.variables === mode
                    ? <Loader2 className="h-2.5 w-2.5 animate-spin inline" />
                    : mode}
                </button>
              ))}
            </div>
          </div>

          {/* Role assignment summary (compact) */}
          {Object.keys(assignments).length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Role → Model</p>
              <div className="flex flex-col gap-1">
                {ROLES.map((role) => {
                  const modelId = assignments[role];
                  return (
                    <div key={role} className="flex items-center gap-2 text-xs">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border w-14 text-center shrink-0 ${ROLE_COLORS[role]}`}>
                        {role}
                      </span>
                      <span className="font-mono text-muted-foreground truncate">{modelId || "—"}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Model circles */}
          {availableModels.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Models ({availableModels.length})
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {availableModels.map((model) => (
                  <ModelCircle
                    key={model.id}
                    model={model}
                    roles={modelRoles[model.id] || []}
                    allModels={availableModels}
                    onRoleClick={() => {}}
                    onRoleReassign={handleRoleReassign}
                  />
                ))}
              </div>
            </div>
          )}
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

  const activeProvider = providerSeeds.find((p) => p.active)?.id ?? "";

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
      qc.invalidateQueries({ queryKey: ["/api/energy/providers"] });
      qc.invalidateQueries({ queryKey: ["/api/v1/agents"] });
      toast({ title: "Provider switched", description: data.agent_name });
    },
    onError: (e: Error) => toast({ title: "Provider switch failed", description: e.message, variant: "destructive" }),
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

        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3" data-testid="section-header-energy">
            Energy Providers
          </h3>
          {isLoadingProviders ? (
            <div className="flex items-center justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : providerSeeds.length > 0 ? (
            <div className="flex flex-col gap-3">
              {providerSeeds.map((seed) => (
                <ProviderPanel
                  key={seed.id}
                  provider={seed}
                  onSetActive={(id) => setProviderMutation.mutate(id)}
                  isSettingActive={setProviderMutation.isPending}
                />
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground py-4 text-center border border-dashed border-border rounded-md">
              No provider seeds found. They will be created on next server restart.
            </p>
          )}
        </div>

        <Separator />

        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider" data-testid="section-header-subagents">
              PCNA Sub-agents ({subAgents.length})
            </h3>
            <div className="flex items-center gap-2">
              <Select value={spawnProvider} onValueChange={setSpawnProvider}>
                <SelectTrigger className="h-7 text-xs w-28" data-testid="select-spawn-provider">
                  <SelectValue placeholder={activeProvider || "provider"} />
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
// 237:0
