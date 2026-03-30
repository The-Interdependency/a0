import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Brain, Cpu, Shield, Activity, Clock, Zap, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

type AgentSeed = {
  index: number;
  label: string;
  value: number;
  summary: string;
  isSentinel: boolean;
};

type ZfaeObs = {
  ts: string;
  coherence: number;
  winner: string;
  confidence: number;
  note: string;
};

type AgentInstance = {
  id: number;
  name: string;
  slot: string;
  directives: string;
  tools: string[];
  status: string;
  seeds: AgentSeed[] | null;
  sentinelSeedIndices: number[] | null;
  zfaeObservations: ZfaeObs[] | null;
  lastOutput: string | null;
  lastTickAt: string | null;
  isPersistent: boolean;
  banditArmId: number | null;
  createdAt: string;
};

function CoherenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = value >= 0.7 ? "bg-green-500" : value >= 0.4 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground w-8">{pct}%</span>
    </div>
  );
}

function ObsMiniChart({ obs }: { obs: ZfaeObs[] }) {
  if (obs.length === 0) return <span className="text-xs text-muted-foreground">no observations</span>;
  const recent = obs.slice(-20);
  const max = Math.max(...recent.map(o => o.coherence), 0.01);
  return (
    <div className="flex items-end gap-0.5 h-6">
      {recent.map((o, i) => {
        const h = Math.round((o.coherence / max) * 24);
        const color = o.coherence >= 0.7 ? "bg-green-500" : o.coherence >= 0.4 ? "bg-yellow-500" : "bg-red-500";
        return (
          <div
            key={i}
            className={cn("w-1.5 rounded-sm opacity-80", color)}
            style={{ height: `${Math.max(2, h)}px` }}
            title={`${new Date(o.ts).toLocaleTimeString()} coherence=${o.coherence.toFixed(3)} winner=${o.winner}`}
          />
        );
      })}
    </div>
  );
}

function AgentCard({ agent }: { agent: AgentInstance }) {
  const [expanded, setExpanded] = useState(false);

  const sentinels = (agent.seeds || []).filter(s => s.isSentinel);
  const obs = agent.zfaeObservations || [];
  const lastObs = obs[obs.length - 1];
  const isRunning = agent.status === "running";
  const isError = agent.status === "error";

  const statusColor = isRunning
    ? "bg-blue-500 animate-pulse"
    : isError
    ? "bg-red-500"
    : agent.isPersistent
    ? "bg-green-500"
    : "bg-muted-foreground";

  return (
    <Card className="border border-border" data-testid={`card-agent-${agent.name}`}>
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={cn("w-2 h-2 rounded-full", statusColor)} />
            <CardTitle className="text-sm font-semibold">{agent.name}</CardTitle>
            {agent.isPersistent && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">persistent</Badge>
            )}
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-mono">{agent.slot}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{obs.length} obs</span>
            <button
              onClick={() => setExpanded(e => !e)}
              className="text-muted-foreground hover:text-foreground transition-colors"
              data-testid={`button-expand-agent-${agent.name}`}
            >
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-3 space-y-2">
        {/* ZFAE coherence sparkline */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Zap className="w-3 h-3" />ZFAE</span>
            {lastObs && <span className="font-mono">{lastObs.winner} · {lastObs.coherence.toFixed(3)}</span>}
          </div>
          <ObsMiniChart obs={obs} />
          {lastObs && <CoherenceBar value={lastObs.coherence} />}
        </div>

        {/* Sentinel seeds */}
        <div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
            <Shield className="w-3 h-3" />
            <span>Sentinels</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {sentinels.length > 0 ? sentinels.map(s => (
              <div key={s.index} className="bg-muted rounded px-2 py-1 text-[10px]" data-testid={`sentinel-${agent.name}-${s.index}`}>
                <div className="font-mono text-muted-foreground">{s.label}</div>
                <div className="font-semibold tabular-nums">{(s.value || 0).toFixed(3)}</div>
                {s.summary && <div className="truncate text-muted-foreground mt-0.5">{s.summary}</div>}
              </div>
            )) : <span className="text-xs text-muted-foreground col-span-3">no seeds yet</span>}
          </div>
        </div>

        {/* Last output */}
        {agent.lastOutput && (
          <div className="text-xs text-muted-foreground bg-muted/40 rounded px-2 py-1 font-mono truncate" data-testid={`text-last-output-${agent.name}`}>
            {agent.lastOutput}
          </div>
        )}

        {/* Last tick */}
        {agent.lastTickAt && (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span>Last tick: {new Date(agent.lastTickAt).toLocaleTimeString()}</span>
          </div>
        )}

        {/* Expanded: directives, tools, recent observations */}
        {expanded && (
          <div className="space-y-2 pt-1 border-t border-border">
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                <Brain className="w-3 h-3" />Directives
              </div>
              <p className="text-xs leading-relaxed text-foreground/80 line-clamp-4">{agent.directives}</p>
            </div>
            {(agent.tools || []).length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                  <Cpu className="w-3 h-3" />Tools
                </div>
                <div className="flex flex-wrap gap-1">
                  {(agent.tools || []).map(t => (
                    <Badge key={t} variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-mono">{t}</Badge>
                  ))}
                </div>
              </div>
            )}
            {obs.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                  <Activity className="w-3 h-3" />Recent ZFAE observations
                </div>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {obs.slice(-10).reverse().map((o, i) => (
                    <div key={i} className="text-[10px] font-mono bg-muted/50 rounded px-2 py-1">
                      <span className="text-muted-foreground">{new Date(o.ts).toLocaleTimeString()}</span>
                      {" "}
                      <span className={cn("font-semibold", o.coherence >= 0.7 ? "text-green-600 dark:text-green-400" : o.coherence >= 0.4 ? "text-yellow-600 dark:text-yellow-400" : "text-red-600 dark:text-red-400")}>
                        {o.coherence.toFixed(3)}
                      </span>
                      {" "}<span className="text-muted-foreground">[{o.winner}]</span>
                      {" "}{o.note}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function AgentsTab() {
  const { data: agents = [], isLoading, error } = useQuery<AgentInstance[]>({
    queryKey: ["/api/v1/agents"],
    refetchInterval: 15000,
  });

  const persistent = agents.filter(a => a.isPersistent);
  const spawned = agents.filter(a => !a.isPersistent);

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold" data-testid="text-agents-title">Sub-agents</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {agents.length} instance{agents.length !== 1 ? "s" : ""} · ZFAE-observed · UCB bandit selection
          </p>
        </div>
        <Badge variant="outline" className="text-xs">
          {persistent.length} persistent · {spawned.length} spawned
        </Badge>
      </div>

      {isLoading && (
        <div className="text-sm text-muted-foreground animate-pulse">Loading agents…</div>
      )}
      {error && (
        <div className="text-sm text-red-500">Failed to load agents</div>
      )}

      {persistent.length > 0 && (
        <div>
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Bandit Trio</div>
          <div className="space-y-3">
            {persistent.map(a => <AgentCard key={a.id} agent={a} />)}
          </div>
        </div>
      )}

      {spawned.length > 0 && (
        <div>
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Spawned</div>
          <div className="space-y-3">
            {spawned.map(a => <AgentCard key={a.id} agent={a} />)}
          </div>
        </div>
      )}

      {!isLoading && agents.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
          <Brain className="w-8 h-8 mb-3 opacity-30" />
          <p className="text-sm">No agent instances found.</p>
          <p className="text-xs mt-1">Use the <code className="font-mono bg-muted px-1 rounded">spawn_agent</code> tool to create one.</p>
        </div>
      )}
    </div>
  );
}
