// 664:21
// N:M
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Loader2, Plus, Play, Trash2, Trophy, X, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useSEO } from "@/hooks/use-seo";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { MarkdownContent } from "@/components/chat-messages";

interface Benchmark {
  id: number;
  user_id: string;
  name: string;
  prompt: string;
  mode: string;
  judge_enabled: boolean;
  judge_model: string | null;
  contestant_count?: number;
}
interface Contestant {
  id: number;
  benchmark_id: number;
  slot: number;
  label: string;
  provider_id: string;
  model_id: string;
  agent_id: number | null;
  orchestration_mode: string;
  providers: string[];
}
interface BenchmarkDetail {
  benchmark: Benchmark;
  contestants: Contestant[];
  runs: { id: string; status: string; started_at: string | null; finished_at: string | null }[];
}
interface ContestantRun {
  id: string;
  contestant_id: number;
  slot: number;
  label: string;
  provider_id: string;
  model_id: string;
  orchestration_mode: string;
  status: string;
  content: string;
  error: string | null;
  latency_ms: number | null;
  prompt_tokens: number;
  completion_tokens: number;
  cost_usd: number;
}
interface RunDetail {
  run: { id: string; status: string; prompt_snapshot: string; started_at: string | null; finished_at: string | null };
  contestant_runs: ContestantRun[];
  judgment: { winner_contestant_id: number | null; rationale: string } | null;
}
interface ModelOpt {
  id: string;
  label: string;
  model: string;
  vendor: string;
  available: boolean;
}
interface AgentOpt {
  id: number;
  name: string;
  model_id: string;
  provider: string;
}

const ORCH_OPTIONS = [
  { value: "single", label: "Single (model voice)" },
  { value: "fan_out", label: "Fan-out" },
  { value: "council", label: "Council" },
  { value: "daisy_chain", label: "Daisy chain" },
];
const MODE_OPTIONS = [
  { value: "one_shot", label: "One-shot" },
  { value: "conversational", label: "Conversational (T006)" },
];
const MAX_CONTESTANTS = 6;

function fmtMs(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}
function fmtCost(c: number): string {
  return c > 0 ? `$${c.toFixed(5)}` : "—";
}

// ─────────────────────────────────────────────────────────────────────────────
// Contestant editor dialog
// ─────────────────────────────────────────────────────────────────────────────
function ContestantDialog({
  benchmarkId, contestant, models, agents, open, onClose,
}: {
  benchmarkId: number;
  contestant: Contestant | null;
  models: ModelOpt[];
  agents: AgentOpt[];
  open: boolean;
  onClose: () => void;
}) {
  const isEdit = !!contestant;
  const { toast } = useToast();
  const [label, setLabel] = useState("");
  const [providerId, setProviderId] = useState<string>("");
  const [orchMode, setOrchMode] = useState("single");
  const [agentId, setAgentId] = useState<string>("__none__");
  const [providers, setProviders] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setLabel(contestant?.label ?? "");
      setProviderId(contestant?.provider_id ?? (models[0]?.id ?? ""));
      setOrchMode(contestant?.orchestration_mode ?? "single");
      setAgentId(contestant?.agent_id ? String(contestant.agent_id) : "__none__");
      setProviders(contestant?.providers ?? []);
    }
  }, [open, contestant, models]);

  const isMulti = orchMode !== "single";
  const agentBlocksMulti = agentId !== "__none__" && isMulti;

  const save = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        label,
        provider_id: providerId,
        model_id: models.find((m) => m.id === providerId)?.model ?? "",
        agent_id: agentId === "__none__" ? null : Number(agentId),
        orchestration_mode: orchMode,
        providers: isMulti ? providers : [],
      };
      if (isEdit && contestant) {
        await apiRequest("PATCH", `/api/v1/fleet/contestants/${contestant.id}`, body);
      } else {
        await apiRequest("POST", `/api/v1/fleet/benchmarks/${benchmarkId}/contestants`, body);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/fleet/benchmarks", benchmarkId] });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const toggleProvider = (id: string) => {
    setProviders((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg" data-testid="contestant-dialog">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit contestant" : "Add contestant"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div>
            <label className="text-xs font-medium block mb-1">Label (optional)</label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. baseline grok"
              data-testid="input-contestant-label"
            />
          </div>

          <div>
            <label className="text-xs font-medium block mb-1">Provider / model</label>
            <Select value={providerId} onValueChange={setProviderId}>
              <SelectTrigger data-testid="select-provider"><SelectValue /></SelectTrigger>
              <SelectContent>
                {models.map((m) => (
                  <SelectItem key={m.id} value={m.id} disabled={!m.available}>
                    <span className="flex items-center gap-2">
                      <span>{m.label}</span>
                      <span className="text-[10px] text-muted-foreground">{m.vendor} · {m.model}</span>
                      {!m.available && <span className="text-[10px] text-destructive">no key</span>}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-medium block mb-1">Orchestration</label>
            <Select value={orchMode} onValueChange={setOrchMode}>
              <SelectTrigger data-testid="select-orch"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ORCH_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isMulti && (
            <div>
              <label className="text-xs font-medium block mb-1">Providers in chain ({providers.length} selected)</label>
              <div className="flex flex-wrap gap-1">
                {models.filter((m) => m.available).map((m) => (
                  <Badge
                    key={m.id}
                    variant={providers.includes(m.id) ? "default" : "outline"}
                    className="cursor-pointer text-[10px]"
                    onClick={() => toggleProvider(m.id)}
                    data-testid={`chip-provider-${m.id}`}
                  >
                    {m.label}
                  </Badge>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                Pick 2+ providers. The first is the primary; the rest participate per the chosen mode.
              </p>
            </div>
          )}

          <div>
            <label className="text-xs font-medium block mb-1">Forge agent (optional)</label>
            <Select value={agentId} onValueChange={setAgentId}>
              <SelectTrigger data-testid="select-agent"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None — raw model voice</SelectItem>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {agentBlocksMulti && (
              <p className="text-[10px] text-destructive mt-1 flex items-start gap-1">
                <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                Forge agents cannot ride multi-model orchestration. Pick "Single" or remove the agent.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} data-testid="btn-cancel-contestant">Cancel</Button>
          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending || !providerId || agentBlocksMulti || (isMulti && providers.length < 2)}
            data-testid="btn-save-contestant"
          >
            {save.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
            {isEdit ? "Save" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Contestant card (used in editor + as result column header)
// ─────────────────────────────────────────────────────────────────────────────
interface CardShape {
  slot: number;
  label: string;
  provider_id: string;
  model_id: string;
  orchestration_mode: string;
  agent_id?: number | null;
  providers?: string[];
}
function ContestantCard({
  c, agents, onEdit, onDelete, compact,
}: {
  c: CardShape;
  agents: AgentOpt[];
  onEdit?: () => void;
  onDelete?: () => void;
  compact?: boolean;
}) {
  const agent = c.agent_id ? agents.find((a) => a.id === c.agent_id) : null;
  return (
    <div
      className="rounded-lg border border-border bg-card p-3 flex flex-col gap-1.5"
      data-testid={`contestant-card-${c.slot}`}
    >
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="text-[10px] h-5">slot {c.slot}</Badge>
        {c.label && <span className="text-xs font-semibold truncate flex-1">{c.label}</span>}
        {!c.label && <span className="text-xs font-semibold truncate flex-1 opacity-60">(unnamed)</span>}
        {!compact && onEdit && (
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onEdit} data-testid={`btn-edit-contestant-${c.slot}`}>
            <span className="text-[10px]">edit</span>
          </Button>
        )}
        {!compact && onDelete && (
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onDelete} data-testid={`btn-delete-contestant-${c.slot}`}>
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
      </div>
      <div className="text-base font-semibold leading-tight" data-testid={`contestant-model-${c.slot}`}>
        {c.provider_id}
      </div>
      {c.model_id && (
        <div className="text-[10px] font-mono text-muted-foreground truncate">{c.model_id}</div>
      )}
      <div className="flex flex-wrap gap-1 mt-0.5">
        <Badge variant="outline" className="text-[9px] h-4">{c.orchestration_mode}</Badge>
        {agent && <Badge variant="outline" className="text-[9px] h-4 border-primary/40 text-primary">agent: {agent.name}</Badge>}
        {!agent && <Badge variant="outline" className="text-[9px] h-4 opacity-60">no persona</Badge>}
        {c.orchestration_mode !== "single" && c.providers && c.providers.length > 0 && (
          <Badge variant="outline" className="text-[9px] h-4">{c.providers.length} providers</Badge>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Result column
// ─────────────────────────────────────────────────────────────────────────────
function ResultColumn({ cr, agents, isWinner }: { cr: ContestantRun; agents: AgentOpt[]; isWinner: boolean }) {
  return (
    <div className="flex flex-col min-w-[280px] max-w-[420px] flex-1 border border-border rounded-lg bg-card overflow-hidden" data-testid={`result-column-${cr.slot}`}>
      <div className={cn("border-b border-border", isWinner && "bg-amber-500/10 border-amber-500/40")}>
        <ContestantCard c={cr} agents={agents} compact />
        {isWinner && (
          <div className="px-3 pb-2 flex items-center gap-1 text-[10px] text-amber-500 font-semibold uppercase">
            <Trophy className="h-3 w-3" /> Judge winner
          </div>
        )}
      </div>
      <div className="flex-1 overflow-auto p-3 text-xs min-h-[120px] max-h-[60vh]">
        {cr.status === "running" ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> running…
          </div>
        ) : cr.status === "error" ? (
          <div className="text-destructive">
            <div className="font-semibold mb-1">Error</div>
            <pre className="whitespace-pre-wrap text-[10px]">{cr.error ?? "unknown"}</pre>
          </div>
        ) : (
          <MarkdownContent content={cr.content} isUser={false} />
        )}
      </div>
      <div className="border-t border-border px-3 py-2 grid grid-cols-3 gap-1 text-[10px] text-muted-foreground tabular-nums">
        <div>
          <div className="opacity-60">latency</div>
          <div className="font-semibold text-foreground">{fmtMs(cr.latency_ms)}</div>
        </div>
        <div>
          <div className="opacity-60">tokens</div>
          <div className="font-semibold text-foreground">{cr.prompt_tokens + cr.completion_tokens}</div>
        </div>
        <div>
          <div className="opacity-60">cost</div>
          <div className="font-semibold text-foreground">{fmtCost(cr.cost_usd)}</div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────
export default function FleetPage() {
  useSEO({ title: "a0p — Fleet", description: "Side-by-side benchmarking of model/agent/orchestration tuples." });
  const { toast } = useToast();
  const [selId, setSelId] = useState<number | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Contestant | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const benchQ = useQuery<Benchmark[]>({ queryKey: ["/api/v1/fleet/benchmarks"] });
  const detailQ = useQuery<BenchmarkDetail>({
    queryKey: ["/api/v1/fleet/benchmarks", selId],
    enabled: selId != null,
  });
  const modelsQ = useQuery<{ models: ModelOpt[] }>({ queryKey: ["/api/v1/forge/models"] });
  const agentsQ = useQuery<{ agents: AgentOpt[] }>({ queryKey: ["/api/v1/forge/agents"] });

  const runQ = useQuery<RunDetail>({
    queryKey: ["/api/v1/fleet/runs", activeRunId],
    enabled: activeRunId != null,
    refetchInterval: (q) => {
      const d = q.state.data as RunDetail | undefined;
      if (!d) return 1000;
      // Stop only when the run itself is terminal AND we have at least one
      // contestant row that is also terminal. An empty contestant_runs array
      // right after run creation must NOT stop polling (every() is true on []).
      const runTerminal = d.run.status === "complete" || d.run.status === "failed";
      const haveRows = d.contestant_runs.length > 0;
      const allRowsTerminal = haveRows && d.contestant_runs.every(
        (cr) => cr.status === "complete" || cr.status === "error",
      );
      return runTerminal && allRowsTerminal ? false : 1500;
    },
  });

  // Auto-select first benchmark
  useEffect(() => {
    if (!selId && benchQ.data && benchQ.data.length > 0) {
      setSelId(benchQ.data[0].id);
    }
  }, [benchQ.data, selId]);

  const createBench = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/v1/fleet/benchmarks", {
        name: "New benchmark", prompt: "", mode: "one_shot",
      });
      return await r.json();
    },
    onSuccess: (b: Benchmark) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/fleet/benchmarks"] });
      setSelId(b.id);
    },
    onError: (e: Error) => toast({ title: "Create failed", description: e.message, variant: "destructive" }),
  });

  const deleteBench = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/v1/fleet/benchmarks/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/fleet/benchmarks"] });
      setSelId(null);
      setActiveRunId(null);
    },
  });

  const updateBench = useMutation({
    mutationFn: async (patch: Partial<Benchmark>) => {
      if (!selId) return;
      await apiRequest("PATCH", `/api/v1/fleet/benchmarks/${selId}`, patch);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/fleet/benchmarks", selId] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/fleet/benchmarks"] });
    },
  });

  const deleteContestant = useMutation({
    mutationFn: async (cid: number) => { await apiRequest("DELETE", `/api/v1/fleet/contestants/${cid}`); },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/v1/fleet/benchmarks", selId] }),
  });

  const startRun = useMutation({
    mutationFn: async () => {
      // Force-flush any pending edits so the run uses what the user sees,
      // not the last-blurred saved value.
      if (bench && (nameDraft !== bench.name || promptDraft !== bench.prompt)) {
        await apiRequest("PATCH", `/api/v1/fleet/benchmarks/${selId}`, {
          name: nameDraft, prompt: promptDraft,
        });
        await queryClient.invalidateQueries({ queryKey: ["/api/v1/fleet/benchmarks", selId] });
      }
      const r = await apiRequest("POST", `/api/v1/fleet/benchmarks/${selId}/run`, {
        prompt: promptDraft,
      });
      return await r.json();
    },
    onSuccess: (d: { run_id: string }) => {
      setActiveRunId(d.run_id);
      toast({ title: "Run started", description: d.run_id.slice(0, 16) });
    },
    onError: (e: Error) => toast({ title: "Run failed", description: e.message, variant: "destructive" }),
  });

  const detail = detailQ.data;
  const bench = detail?.benchmark;
  const contestants = detail?.contestants ?? [];
  const models = useMemo(() => modelsQ.data?.models ?? [], [modelsQ.data]);
  const agents = useMemo(() => agentsQ.data?.agents ?? [], [agentsQ.data]);
  const winnerCid = runQ.data?.judgment?.winner_contestant_id ?? null;

  // Local editable copies (debounce-on-blur via uncontrolled save)
  const [nameDraft, setNameDraft] = useState("");
  const [promptDraft, setPromptDraft] = useState("");
  useEffect(() => {
    if (bench) {
      setNameDraft(bench.name);
      setPromptDraft(bench.prompt);
    }
  }, [bench?.id, bench?.name, bench?.prompt]);

  return (
    <div className="flex flex-col h-full" data-testid="fleet-page">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-card">
        <h1 className="text-sm font-semibold">Fleet · Benchmarks</h1>
        <span className="text-[10px] text-muted-foreground">
          Side-by-side compare across (model, agent, orchestration) tuples.
        </span>
      </div>

      <div className="flex-1 flex min-h-0 flex-col md:flex-row">
        {/* Left rail */}
        <div className="md:w-64 border-b md:border-b-0 md:border-r border-border flex flex-col bg-background/50">
          <div className="p-2 border-b border-border">
            <Button
              size="sm" variant="default" className="w-full"
              onClick={() => createBench.mutate()}
              disabled={createBench.isPending}
              data-testid="btn-new-benchmark"
            >
              <Plus className="h-3 w-3 mr-1" /> New benchmark
            </Button>
          </div>
          <div className="flex-1 overflow-auto p-1">
            {benchQ.isLoading ? (
              <div className="p-4 text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" /> loading…
              </div>
            ) : benchQ.error ? (
              <div className="p-4 text-xs text-destructive" data-testid="benchmarks-error">
                Failed to load benchmarks: {(benchQ.error as Error).message}
              </div>
            ) : benchQ.data && benchQ.data.length === 0 ? (
              <div className="p-4 text-xs text-muted-foreground" data-testid="empty-benchmarks">
                No benchmarks yet. Create one to start.
              </div>
            ) : (
              benchQ.data?.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => { setSelId(b.id); setActiveRunId(null); }}
                  className={cn(
                    "w-full text-left px-2 py-1.5 rounded-md hover-elevate text-xs flex items-center gap-2",
                    selId === b.id && "bg-muted",
                  )}
                  data-testid={`btn-benchmark-${b.id}`}
                >
                  <span className="flex-1 truncate font-medium">{b.name}</span>
                  <Badge variant="outline" className="text-[9px] h-4">{b.contestant_count ?? 0}</Badge>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Main */}
        <div className="flex-1 flex flex-col min-h-0 overflow-auto">
          {!selId ? (
            <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
              Pick a benchmark or create a new one.
            </div>
          ) : detailQ.error ? (
            <div className="p-6 text-xs text-destructive" data-testid="detail-error">
              Failed to load benchmark: {(detailQ.error as Error).message}
            </div>
          ) : detailQ.isLoading || !bench ? (
            <div className="p-6 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> loading…
            </div>
          ) : (
            <>
              {/* Editor header */}
              <div className="p-3 border-b border-border space-y-2 bg-card">
                <div className="flex items-center gap-2">
                  <Input
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onBlur={() => nameDraft !== bench.name && updateBench.mutate({ name: nameDraft })}
                    className="text-sm font-semibold"
                    data-testid="input-benchmark-name"
                  />
                  <Select value={bench.mode} onValueChange={(v) => updateBench.mutate({ mode: v })}>
                    <SelectTrigger className="w-44 text-xs" data-testid="select-benchmark-mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MODE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value} disabled={o.value === "conversational"}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="icon" variant="ghost" className="h-7 w-7"
                    onClick={() => { if (confirm(`Delete "${bench.name}"?`)) deleteBench.mutate(bench.id); }}
                    data-testid="btn-delete-benchmark"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
                <Textarea
                  value={promptDraft}
                  onChange={(e) => setPromptDraft(e.target.value)}
                  onBlur={() => promptDraft !== bench.prompt && updateBench.mutate({ prompt: promptDraft })}
                  placeholder="Prompt all contestants will receive…"
                  rows={3}
                  className="text-xs"
                  data-testid="textarea-prompt"
                />
              </div>

              {/* Contestants */}
              <div className="p-3 border-b border-border">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-semibold uppercase text-muted-foreground">
                    Contestants ({contestants.length}/{MAX_CONTESTANTS})
                  </div>
                  <Button
                    size="sm" variant="default"
                    onClick={() => { setEditing(null); setDialogOpen(true); }}
                    disabled={contestants.length >= MAX_CONTESTANTS}
                    data-testid="btn-add-contestant"
                  >
                    <Plus className="h-3 w-3 mr-1" /> Add
                  </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {contestants.map((c) => (
                    <ContestantCard
                      key={c.id}
                      c={c}
                      agents={agents}
                      onEdit={() => { setEditing(c); setDialogOpen(true); }}
                      onDelete={() => { if (confirm(`Remove slot ${c.slot}?`)) deleteContestant.mutate(c.id); }}
                    />
                  ))}
                  {contestants.length === 0 && (
                    <div className="col-span-full text-xs text-muted-foreground italic" data-testid="empty-contestants">
                      No contestants yet. Add 1–{MAX_CONTESTANTS} to enable runs.
                    </div>
                  )}
                </div>
              </div>

              {/* Run controls */}
              <div className="p-3 border-b border-border flex items-center gap-2">
                <Button
                  onClick={() => startRun.mutate()}
                  disabled={startRun.isPending || contestants.length === 0 || !promptDraft.trim()}
                  data-testid="btn-run-benchmark"
                >
                  {startRun.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Play className="h-3 w-3 mr-1" />}
                  Run benchmark
                </Button>
                {activeRunId && (
                  <>
                    <Badge variant="outline" className="text-[10px] font-mono">{activeRunId.slice(0, 16)}</Badge>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px]",
                        runQ.data?.run.status === "complete" && "border-emerald-500/40 text-emerald-500",
                        runQ.data?.run.status === "running" && "border-amber-500/40 text-amber-500",
                      )}
                    >
                      {runQ.data?.run.status ?? "loading"}
                    </Badge>
                    <Button size="icon" variant="ghost" className="h-6 w-6 ml-auto" onClick={() => setActiveRunId(null)} data-testid="btn-close-run">
                      <X className="h-3 w-3" />
                    </Button>
                  </>
                )}
              </div>

              {/* Results */}
              {activeRunId && (
                <div className="p-3 flex gap-2 overflow-x-auto" data-testid="results-strip">
                  {runQ.isLoading || !runQ.data ? (
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      <Loader2 className="h-3 w-3 animate-spin" /> waiting for results…
                    </div>
                  ) : runQ.data.contestant_runs.length === 0 ? (
                    <div className="text-xs text-muted-foreground">No contestant rows yet.</div>
                  ) : (
                    runQ.data.contestant_runs.map((cr) => (
                      <ResultColumn
                        key={cr.id}
                        cr={cr}
                        agents={agents}
                        isWinner={winnerCid === cr.contestant_id}
                      />
                    ))
                  )}
                </div>
              )}

              {runQ.data?.judgment?.rationale && (
                <div className="m-3 p-3 rounded-lg border border-amber-500/40 bg-amber-500/5 text-xs" data-testid="judgment-rationale">
                  <div className="flex items-center gap-1 font-semibold text-amber-500 mb-1">
                    <Trophy className="h-3 w-3" /> Judge rationale
                  </div>
                  <MarkdownContent content={runQ.data.judgment.rationale} isUser={false} />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {selId && (
        <ContestantDialog
          benchmarkId={selId}
          contestant={editing}
          models={models}
          agents={agents}
          open={dialogOpen}
          onClose={() => { setDialogOpen(false); setEditing(null); }}
        />
      )}
    </div>
  );
}
// N:M
// 664:21
