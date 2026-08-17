// 421:6 0:1 0:12
// N:M
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bot, Zap, GitMerge, Loader2, Clock, Radio, Plus, Trash2, ChevronDown, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import TabShell from "@/components/TabShell";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useBillingStatus } from "@/hooks/use-billing-status";
import { InstanceDrawer, type ModelInstance } from "@/components/InstanceDrawer";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ModelRosterEntry {
  vendor: string;
  models: Array<{
    provider_id: string;
    model_id: string;
    label: string;
    vendor: string;
    supports_thinking: boolean;
    supports_vision: boolean;
    min_tier: string;
  }>;
}

interface AgentRow {
  name: string;
  slot: string;
  status: string;
  is_persistent: boolean;
  uptime_s?: number;
  tools?: string[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SLOTS = ["conduct", "perform", "practice", "record", "derive", "edcm"] as const;
type Slot = typeof SLOTS[number];

const SLOT_META: Record<Slot, { label: string; color: string; desc: string }> = {
  conduct: {
    label: "Conduct",
    color: "border-emerald-500/30 bg-emerald-500/5 text-emerald-400",
    desc: "Primary reasoning. Drives main conversation turns and generates assistant replies.",
  },
  perform: {
    label: "Perform",
    color: "border-amber-500/30 bg-amber-500/5 text-amber-400",
    desc: "Active execution. Handles tool calls and agentic work during task runs.",
  },
  practice: {
    label: "Practice",
    color: "border-blue-500/30 bg-blue-500/5 text-blue-400",
    desc: "Shadow / calibration. Runs in parallel with conduct for comparison and bandit scoring.",
  },
  record: {
    label: "Record",
    color: "border-slate-500/30 bg-slate-500/5 text-slate-400",
    desc: "Structured logging. Responsible for note-taking, output formatting, and record-keeping.",
  },
  derive: {
    label: "Derive",
    color: "border-violet-500/30 bg-violet-500/5 text-violet-400",
    desc: "Synthesis. Post-turn derivation, PCNA reward signals, and aggregate analysis.",
  },
  edcm: {
    label: "EDCMbone",
    color: "border-rose-500/30 bg-rose-500/5 text-rose-400",
    desc: "Transcript analysis. Called for EDCMbone scoring and explanation generation.",
  },
};

const VENDOR_COLORS: Record<string, string> = {
  google: "bg-green-500",
  openai: "bg-blue-500",
  anthropic: "bg-orange-500",
  xai: "bg-purple-400",
};

function VendorDot({ vendor }: { vendor: string }) {
  return <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${VENDOR_COLORS[vendor] ?? "bg-muted-foreground"}`} />;
}

function fmtUptime(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

// ── Create Instance Dialog ────────────────────────────────────────────────────

function CreateDialog({
  model, onClose,
}: { model: { provider_id: string; model_id: string; vendor: string; label: string } | null; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [kind, setKind] = useState("zfae");

  const create = useMutation({
    mutationFn: async () => {
      if (!model) return;
      const r = await apiRequest("POST", "/api/v1/agents/instances", {
        kind, vendor: model.vendor, model_id: model.model_id,
      });
      return r.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/v1/agents/instances"] });
      toast({ title: "Instance created", description: data?.canonical_name });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={!!model} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">Instantiate model</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <p className="text-xs text-muted-foreground font-mono">{model?.model_id}</p>
          <div className="flex gap-1.5">
            {(["zfae", "bare", "remote"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`text-xs px-3 py-1 rounded border transition-colors ${
                  kind === k ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"
                }`}
                data-testid={`kind-${k}`}
              >{k}</button>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground/70">
            {kind === "zfae" && "Full PCNA pipeline — memory, EDCM, tensor reward."}
            {kind === "bare" && "Direct API call, no pipeline wrapper."}
            {kind === "remote" && "Forward to a peer a0 deployment."}
          </p>
        </div>
        <DialogFooter>
          <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending} data-testid="btn-confirm-create">
            {create.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function AgentsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { isAdmin } = useBillingStatus();

  const [selectedInstance, setSelectedInstance] = useState<ModelInstance | null>(null);
  const [createModel, setCreateModel] = useState<{ provider_id: string; model_id: string; vendor: string; label: string } | null>(null);
  const [openVendors, setOpenVendors] = useState<Set<string>>(new Set());

  const instancesQ = useQuery<ModelInstance[]>({ queryKey: ["/api/v1/agents/instances"], refetchInterval: 30_000 });
  const rosterQ = useQuery<ModelRosterEntry[]>({ queryKey: ["/api/v1/agents/models"] });
  const agentsQ = useQuery<AgentRow[]>({ queryKey: ["/api/v1/agents"], refetchInterval: 10_000 });

  const instances = instancesQ.data ?? [];
  const slottedMap = Object.fromEntries(instances.filter((i) => i.role_slot).map((i) => [i.role_slot!, i]));
  const stable = instances.filter((i) => !i.role_slot);
  const subAgents = (agentsQ.data ?? []).filter((a) => !a.is_persistent);

  const slotMut = useMutation({
    mutationFn: async ({ id, slot }: { id: string; slot: string | null }) => {
      const r = await apiRequest("PATCH", `/api/v1/agents/instances/${id}/slot`, { role_slot: slot });
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/v1/agents/instances"] }),
    onError: (e: Error) => toast({ title: "Assign failed", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/v1/agents/instances/${id}`, {});
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/v1/agents/instances"] }),
    onError: (e: Error) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const mergeMut = useMutation({
    mutationFn: async (name: string) => {
      const r = await apiRequest("POST", `/api/v1/agents/${name}/merge`, {});
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/v1/agents"] }),
    onError: (e: Error) => toast({ title: "Merge failed", description: e.message, variant: "destructive" }),
  });

  const toggleVendor = (v: string) => {
    setOpenVendors((prev) => {
      const next = new Set(prev);
      next.has(v) ? next.delete(v) : next.add(v);
      return next;
    });
  };

  return (
    <TabShell label="Agents" icon="Bot"
      onRefresh={async () => { await Promise.all([instancesQ.refetch(), rosterQ.refetch(), agentsQ.refetch()]); }}
      isRefreshing={instancesQ.isFetching || agentsQ.isFetching}
    >
      <div className="flex flex-col gap-6">

        {/* ── Party Slots ── */}
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3" data-testid="section-header-party">
            Party Slots
          </h3>
          <div className="grid grid-cols-1 gap-2">
            {SLOTS.map((slot) => {
              const inst = slottedMap[slot];
              const meta = SLOT_META[slot];
              return (
                <Card
                  key={slot}
                  className={`p-3 border ${inst ? meta.color : "border-dashed border-border/60"} transition-all`}
                  data-testid={`slot-card-${slot}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-semibold uppercase tracking-widest shrink-0 ${inst ? meta.color.split(" ").find((c) => c.startsWith("text-")) : "text-muted-foreground/40"}`}>
                          {meta.label}
                        </span>
                        {inst ? (
                          <button
                            type="button"
                            className="flex items-center gap-1.5 min-w-0 hover:opacity-80 transition-opacity"
                            onClick={() => setSelectedInstance(inst)}
                            data-testid={`btn-open-slot-${slot}`}
                          >
                            <VendorDot vendor={inst.vendor} />
                            <span className="font-mono text-xs truncate">{inst.canonical_name}</span>
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground/50 italic">Empty</span>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground/60 leading-snug">{meta.desc}</span>
                    </div>
                    {isAdmin && (
                      <div className="flex items-center gap-1 shrink-0">
                        {inst && (
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground"
                            onClick={() => slotMut.mutate({ id: inst.id, slot: null })}
                            title="Unassign" data-testid={`btn-unassign-${slot}`}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                        {stable.length > 0 && (
                          <Select onValueChange={(id) => slotMut.mutate({ id, slot })}>
                            <SelectTrigger className="h-6 w-24 text-[10px]" data-testid={`select-assign-${slot}`}>
                              <SelectValue placeholder="Assign" />
                            </SelectTrigger>
                            <SelectContent>
                              {stable.map((i) => (
                                <SelectItem key={i.id} value={i.id} className="text-xs font-mono">
                                  {i.canonical_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>

        <Separator />

        {/* ── Stable ── */}
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3" data-testid="section-header-stable">
            Stable ({stable.length})
          </h3>
          {instancesQ.isLoading ? (
            <div className="flex items-center justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : stable.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center border border-dashed border-border rounded-md">
              No unassigned instances. Instantiate a model from the roster below.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {stable.map((inst) => (
                <Card key={inst.id} className="p-3" data-testid={`card-instance-${inst.id}`}>
                  <div className="flex items-start justify-between gap-2">
                    <button type="button" className="flex items-center gap-2 min-w-0 hover:opacity-80 transition-opacity"
                      onClick={() => setSelectedInstance(inst)} data-testid={`btn-open-instance-${inst.id}`}>
                      <VendorDot vendor={inst.vendor} />
                      <div className="min-w-0 text-left">
                        <p className="font-mono text-xs font-medium truncate">{inst.canonical_name}</p>
                        <p className="text-[10px] text-muted-foreground">{inst.model_id} · {inst.kind}</p>
                        <div className="flex gap-2 text-[10px] text-muted-foreground/70 mt-0.5">
                          <span>{inst.memory_count} mem</span>
                          <span>{inst.open_task_count} tasks</span>
                        </div>
                      </div>
                    </button>
                    {isAdmin && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Select onValueChange={(slot) => slotMut.mutate({ id: inst.id, slot })}>
                          <SelectTrigger className="h-6 w-24 text-[10px]" data-testid={`select-slot-${inst.id}`}>
                            <SelectValue placeholder="Slot" />
                          </SelectTrigger>
                          <SelectContent>
                            {SLOTS.map((s) => (
                              <SelectItem key={s} value={s} className="text-xs capitalize">{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button size="icon" variant="ghost" className="h-6 w-6"
                          onClick={() => deleteMut.mutate(inst.id)} data-testid={`btn-delete-${inst.id}`}>
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        <Separator />

        {/* ── Model Roster ── */}
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3" data-testid="section-header-roster">
            Model Roster
          </h3>
          {rosterQ.isLoading ? (
            <div className="flex items-center justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="flex flex-col gap-1">
              {(rosterQ.data ?? []).map((group) => {
                const isOpen = openVendors.has(group.vendor);
                const instanceCount = instances.filter((i) => i.vendor === group.vendor).length;
                return (
                  <div key={group.vendor} className="border border-border rounded-md overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleVendor(group.vendor)}
                      className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-accent/40 transition-colors"
                      data-testid={`roster-vendor-${group.vendor}`}
                    >
                      <div className="flex items-center gap-2">
                        <VendorDot vendor={group.vendor} />
                        <span className="font-medium capitalize">{group.vendor}</span>
                        <span className="text-muted-foreground">({group.models.length} models)</span>
                        {instanceCount > 0 && (
                          <Badge variant="secondary" className="text-[9px] h-4">{instanceCount} instances</Badge>
                        )}
                      </div>
                      {isOpen ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                    </button>
                    {isOpen && (
                      <div className="border-t border-border divide-y divide-border/50">
                        {group.models.map((m) => {
                          const cnt = instances.filter((i) => i.model_id === m.model_id).length;
                          return (
                            <div key={m.model_id} className="flex items-center justify-between px-3 py-2 gap-2 text-xs" data-testid={`roster-model-${m.model_id}`}>
                              <div className="min-w-0">
                                <span className="font-mono text-foreground/80 truncate block">{m.model_id}</span>
                                <span className="text-muted-foreground/70 text-[10px]">{m.label}</span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {cnt > 0 && <Badge variant="outline" className="text-[9px] h-4">{cnt}×</Badge>}
                                {m.min_tier !== "free" && <Badge variant="secondary" className="text-[9px] h-4">{m.min_tier}</Badge>}
                                {isAdmin && (
                                  <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1 px-2"
                                    onClick={() => setCreateModel(m)} data-testid={`btn-instantiate-${m.model_id}`}>
                                    <Plus className="h-2.5 w-2.5" /> Instantiate
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <Separator />

        {/* ── PCNA Sub-agents ── */}
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3" data-testid="section-header-subagents">
            PCNA Sub-agents ({subAgents.length})
          </h3>
          {subAgents.length === 0 ? (
            <div className="text-xs text-muted-foreground py-4 text-center border border-dashed border-border rounded-md" data-testid="subagents-empty">
              No active sub-agents.
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
                        {sa.uptime_s !== undefined && (
                          <span className="flex items-center gap-0.5"><Clock className="h-2.5 w-2.5" />{fmtUptime(sa.uptime_s)}</span>
                        )}
                        {false && (
                          <span className="flex items-center gap-0.5"><Radio className="h-2.5 w-2.5" /></span>
                        )}
                      </div>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1 shrink-0"
                    onClick={() => mergeMut.mutate(sa.name)} disabled={mergeMut.isPending}
                    data-testid={`btn-merge-${sa.name}`}>
                    {mergeMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <GitMerge className="h-3 w-3" />}
                    Merge
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </div>

      </div>

      <InstanceDrawer instance={selectedInstance} open={!!selectedInstance} onClose={() => setSelectedInstance(null)} />
      <CreateDialog model={createModel} onClose={() => setCreateModel(null)} />
    </TabShell>
  );
}
// N:M
// 421:6 0:1 0:12
