import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Activity, AlertTriangle, Brain, ChevronDown, ChevronRight, DollarSign, Download, FileText, Filter,
  Heart, Key, OctagonX, Play, RefreshCw, ScrollText, Shield, Upload, Zap, Check, X, Wrench, Plus, Trash2, ToggleLeft, TestTube,
  Clock, Sparkles, Target, Settings, Lock, Eye, EyeOff, ArrowUpDown, ArrowLeftRight, Cpu, GitBranch, Star, Gauge, ShoppingBag, TrendingDown, TrendingUp,
} from "lucide-react";
import { useSliderOrientation } from "@/hooks/use-slider-orientation";
import { usePersona, type Persona } from "@/hooks/use-persona";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

type TabId = "workflow" | "bandit" | "metrics" | "edcm" | "memory" | "brain" | "system" | "heartbeat" | "tools" | "credentials" | "export" | "logs" | "context" | "omega" | "psi" | "api" | "s17" | "deals";

const TAB_GROUPS = [
  {
    id: "agent", label: "Agent", icon: Activity,
    tabs: [
      { id: "workflow" as TabId, label: "Workflow", icon: Activity },
      { id: "bandit" as TabId, label: "Bandit", icon: Target },
      { id: "metrics" as TabId, label: "Metrics", icon: DollarSign },
      { id: "deals" as TabId, label: "Deals", icon: ShoppingBag },
    ],
  },
  {
    id: "memory", label: "Memory", icon: Brain,
    tabs: [
      { id: "memory" as TabId, label: "Memory", icon: Brain },
      { id: "edcm" as TabId, label: "EDCM", icon: Cpu },
      { id: "brain" as TabId, label: "Brain", icon: GitBranch },
      { id: "s17" as TabId, label: "S17", icon: Zap },
    ],
  },
  {
    id: "triad", label: "Triad", icon: Star,
    tabs: [
      { id: "psi" as TabId, label: "Psi Ψ", icon: Eye },
      { id: "omega" as TabId, label: "Omega Ω", icon: Gauge },
      { id: "heartbeat" as TabId, label: "Heartbeat", icon: Clock },
    ],
  },
  {
    id: "system", label: "System", icon: Settings,
    tabs: [
      { id: "system" as TabId, label: "System", icon: Settings },
      { id: "logs" as TabId, label: "Logs", icon: ScrollText },
    ],
  },
  {
    id: "tools", label: "Tools", icon: Wrench,
    tabs: [
      { id: "tools" as TabId, label: "Tools", icon: Wrench },
      { id: "credentials" as TabId, label: "Keys", icon: Lock },
      { id: "context" as TabId, label: "Context", icon: FileText },
      { id: "api" as TabId, label: "API", icon: Cpu },
      { id: "export" as TabId, label: "Export", icon: Download },
    ],
  },
] as const;

const TAB_TO_GROUP: Record<TabId, string> = {
  workflow: "agent", bandit: "agent", metrics: "agent", deals: "agent",
  memory: "memory", edcm: "memory", brain: "memory", s17: "memory",
  psi: "triad", omega: "triad", heartbeat: "triad",
  system: "system", logs: "system",
  tools: "tools", credentials: "tools", context: "tools", api: "tools", export: "tools",
};

type TabGroup = { id: string; label: string; icon: any; tabs: Array<{ id: TabId; label: string; icon: any }> };

const ALL_GROUPS: TabGroup[] = [...TAB_GROUPS];

type MetricLabelMap = Record<string, { label: string; desc: string }>;
const DEFAULT_METRIC_LABELS: MetricLabelMap = {
  CM: { label: "Constraint Mismatch", desc: "1 - Jaccard(C_declared, C_observed)" },
  DA: { label: "Dissonance Accum.", desc: "sigmoid(w·contradictions + retractions + repeats)" },
  DRIFT: { label: "Drift", desc: "1 - cosine_similarity(x_t, goal)" },
  DVG: { label: "Divergence", desc: "entropy(topic_distribution) normalized" },
  INT: { label: "Intensity", desc: "clamp01(caps + punct + lex + tempo)" },
  TBF: { label: "Turn-Balance", desc: "Gini coefficient on actor token shares" },
};

const PERSONA_METRIC_LABELS: Record<Persona, MetricLabelMap> = {
  free: DEFAULT_METRIC_LABELS,
  legal: {
    CM: { label: "Regulatory Compliance Gap", desc: "Deviation from declared statutory constraints" },
    DA: { label: "Contradictory Precedent", desc: "Accumulation of conflicting case law signals" },
    DRIFT: { label: "Argumentation Drift", desc: "Divergence from original legal theory" },
    DVG: { label: "Jurisdictional Divergence", desc: "Entropy across applicable jurisdictions" },
    INT: { label: "Adversarial Tone", desc: "Intensity of adversarial rhetorical markers" },
    TBF: { label: "Examination Balance", desc: "Equity of examination across parties" },
  },
  researcher: {
    CM: { label: "Methodological Inconsistency", desc: "Gap between declared and observed methodology" },
    DA: { label: "Conflicting Findings", desc: "Accumulation of contradictory empirical signals" },
    DRIFT: { label: "Hypothesis Drift", desc: "Divergence from original research question" },
    DVG: { label: "Theoretical Divergence", desc: "Entropy across theoretical frameworks cited" },
    INT: { label: "Citation Density", desc: "Intensity of reference and evidence markers" },
    TBF: { label: "Dialogue Equity", desc: "Balance of voice across cited perspectives" },
  },
  political: {
    CM: { label: "Policy Constraint Violation", desc: "Gap between stated and enacted policy constraints" },
    DA: { label: "Narrative Contradiction", desc: "Accumulation of conflicting political signals" },
    DRIFT: { label: "Position Drift", desc: "Divergence from initial stated political position" },
    DVG: { label: "Ideological Divergence", desc: "Entropy across competing ideological framings" },
    INT: { label: "Rhetoric Intensity", desc: "Intensity of partisan rhetorical markers" },
    TBF: { label: "Discourse Equity", desc: "Balance of voice across political actors" },
  },
};

/** Tab IDs visible per persona. Free = all. Others get curated sets. */
const PERSONA_VISIBLE_TABS: Record<Persona, TabId[] | null> = {
  free: null, // null = show all
  legal: ["workflow", "metrics", "deals", "edcm", "memory", "context", "logs", "credentials", "export"],
  researcher: ["workflow", "metrics", "deals", "edcm", "memory", "brain", "omega", "context", "logs", "credentials", "export"],
  political: ["workflow", "metrics", "deals", "edcm", "memory", "context", "logs", "credentials", "export"],
};

export default function ConsolePage() {
  const { persona } = usePersona();

  const visibleGroups = useMemo<TabGroup[]>(() => {
    const allowed = PERSONA_VISIBLE_TABS[persona];
    if (!allowed) return ALL_GROUPS;
    return ALL_GROUPS
      .map(g => ({ ...g, tabs: g.tabs.filter(t => allowed.includes(t.id)) }))
      .filter(g => g.tabs.length > 0);
  }, [persona]);

  const metricLabels = PERSONA_METRIC_LABELS[persona] ?? DEFAULT_METRIC_LABELS;

  const defaultTab = visibleGroups[0]?.tabs[0]?.id ?? "edcm";

  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const saved = localStorage.getItem("a0p-console-tab") as TabId;
    const inGroup = visibleGroups.some(g => g.tabs.some(t => t.id === saved));
    return inGroup ? saved : defaultTab;
  });
  const [activeGroup, setActiveGroup] = useState<string>(() => {
    const saved = localStorage.getItem("a0p-console-tab") as TabId;
    const owning = visibleGroups.find(g => g.tabs.some(t => t.id === saved));
    return owning?.id ?? visibleGroups[0]?.id ?? "agent";
  });

  // Keep active tab valid when persona changes
  useEffect(() => {
    const stillVisible = visibleGroups.some(g => g.tabs.some(t => t.id === activeTab));
    if (!stillVisible) {
      const first = visibleGroups[0]?.tabs[0]?.id ?? "workflow";
      setActiveTab(first);
      setActiveGroup(visibleGroups[0]?.id ?? "agent");
    }
  }, [persona, visibleGroups]);

  const { orientation, toggleOrientation, isVertical } = useSliderOrientation();

  function selectGroup(groupId: string) {
    setActiveGroup(groupId);
    const group = visibleGroups.find(g => g.id === groupId);
    if (group && !group.tabs.find(t => t.id === activeTab)) {
      const firstTab = group.tabs[0].id;
      setActiveTab(firstTab);
      localStorage.setItem("a0p-console-tab", firstTab);
    }
  }

  function selectTab(tabId: TabId) {
    setActiveTab(tabId);
    localStorage.setItem("a0p-console-tab", tabId);
  }

  const currentGroup = visibleGroups.find(g => g.id === activeGroup) ?? visibleGroups[0];

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card flex-shrink-0">
        <Shield className="w-4 h-4 text-primary flex-shrink-0" />
        <span className="font-semibold text-sm flex-1">Console</span>
        <Button
          size="icon"
          variant="ghost"
          onClick={toggleOrientation}
          data-testid="button-toggle-slider-orientation"
        >
          {isVertical ? <ArrowUpDown className="w-4 h-4" /> : <ArrowLeftRight className="w-4 h-4" />}
        </Button>
      </header>

      <div className="flex gap-1 px-2 py-1 bg-card border-b border-border flex-shrink-0 overflow-x-auto">
        {visibleGroups.map((group) => (
          <button
            key={group.id}
            onClick={() => selectGroup(group.id)}
            className={cn(
              "flex items-center gap-1 px-3 py-2 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors flex-shrink-0 min-h-[36px]",
              activeGroup === group.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            )}
            data-testid={`group-${group.id}`}
          >
            <group.icon className="w-3 h-3" />
            {group.label}
          </button>
        ))}
      </div>

      <div className="flex border-b border-border bg-card overflow-x-auto flex-shrink-0">
        {currentGroup?.tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => selectTab(tab.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors min-h-[40px]",
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground"
            )}
            data-testid={`tab-${tab.id}`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-hidden">
        {activeTab === "workflow" && <WorkflowTab />}
        {activeTab === "bandit" && <BanditTab orientation={orientation} isVertical={isVertical} />}
        {activeTab === "metrics" && <MetricsTab orientation={orientation} isVertical={isVertical} />}
        {activeTab === "edcm" && <EdcmTab />}
        {activeTab === "memory" && <MemoryTab orientation={orientation} isVertical={isVertical} />}
        {activeTab === "brain" && <BrainTab orientation={orientation} isVertical={isVertical} />}
        {activeTab === "system" && <SystemTab orientation={orientation} isVertical={isVertical} />}
        {activeTab === "heartbeat" && <HeartbeatTab orientation={orientation} isVertical={isVertical} />}
        {activeTab === "tools" && <CustomToolsTab />}
        {activeTab === "credentials" && <CredentialsTab />}
        {activeTab === "export" && <ExportTab />}
        {activeTab === "logs" && <LogsTab />}
        {activeTab === "context" && <ContextTab />}
        {activeTab === "api" && <ApiModelTab />}
        {activeTab === "omega" && <OmegaTab orientation={orientation} isVertical={isVertical} />}
        {activeTab === "psi" && <PsiTab />}
        {activeTab === "s17" && <S17Tab />}
        {activeTab === "deals" && <DealsTab />}
      </div>
    </div>
  );
}

// ============ DEALS TAB ============
function DealsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | "active" | "won" | "lost" | "abandoned">("all");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCeiling, setNewCeiling] = useState("");
  const [newWalkAway, setNewWalkAway] = useState("");
  const [newGoals, setNewGoals] = useState("");

  const { data: deals = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/deals"],
  });

  const filtered = filter === "all" ? deals : deals.filter((d: any) => d.status === filter);

  const createMut = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/deals", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/deals"] }); setNewOpen(false); setNewTitle(""); setNewCeiling(""); setNewWalkAway(""); setNewGoals(""); toast({ title: "Deal opened" }); },
    onError: () => toast({ title: "Failed to create deal", variant: "destructive" }),
  });

  const closeMut = useMutation({
    mutationFn: ({ id, status, outcome }: any) => apiRequest("POST", `/api/deals/${id}/close`, { status, outcome }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/deals"] }); toast({ title: "Deal closed" }); },
    onError: () => toast({ title: "Failed to close deal", variant: "destructive" }),
  });

  const statusColor: Record<string, string> = {
    active: "bg-blue-500/20 text-blue-300 border-blue-500/40",
    won: "bg-green-500/20 text-green-300 border-green-500/40",
    lost: "bg-red-500/20 text-red-300 border-red-500/40",
    abandoned: "bg-zinc-500/20 text-zinc-400 border-zinc-500/40",
  };

  function handleCreate() {
    if (!newTitle.trim()) return;
    createMut.mutate({
      title: newTitle.trim(),
      ceiling: newCeiling ? parseFloat(newCeiling) : null,
      walkAway: newWalkAway ? parseFloat(newWalkAway) : null,
      myGoals: newGoals ? newGoals.split("\n").map(s => s.trim()).filter(Boolean) : [],
    });
  }

  return (
    <div className="h-full flex flex-col gap-3 p-3 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-2">
        <ShoppingBag className="w-4 h-4 text-zinc-400" />
        <span className="text-sm font-semibold text-zinc-200">Merchant Deals</span>
        <span className="text-xs text-zinc-500 ml-auto">{deals.filter((d: any) => d.status === "active").length} active</span>
        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setNewOpen(!newOpen)} data-testid="button-new-deal">
          <Plus className="w-3 h-3 mr-1" /> New Deal
        </Button>
      </div>

      {/* New deal form */}
      {newOpen && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 flex flex-col gap-2">
          <span className="text-xs font-medium text-zinc-300">Open Negotiation</span>
          <Input
            placeholder="Deal title (e.g. AWS contract renewal)"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            className="h-8 text-xs bg-zinc-800 border-zinc-600"
            data-testid="input-deal-title"
          />
          <div className="flex gap-2">
            <Input
              placeholder="Ceiling (max $)"
              type="number"
              value={newCeiling}
              onChange={e => setNewCeiling(e.target.value)}
              className="h-8 text-xs bg-zinc-800 border-zinc-600"
              data-testid="input-deal-ceiling"
            />
            <Input
              placeholder="Walk-away ($)"
              type="number"
              value={newWalkAway}
              onChange={e => setNewWalkAway(e.target.value)}
              className="h-8 text-xs bg-zinc-800 border-zinc-600"
              data-testid="input-deal-walkaway"
            />
          </div>
          <Textarea
            placeholder="Goals — one per line (e.g. price under $2000)"
            value={newGoals}
            onChange={e => setNewGoals(e.target.value)}
            className="text-xs bg-zinc-800 border-zinc-600 min-h-[56px]"
            data-testid="input-deal-goals"
          />
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setNewOpen(false)}>Cancel</Button>
            <Button size="sm" className="h-7 text-xs" onClick={handleCreate} disabled={!newTitle.trim() || createMut.isPending} data-testid="button-submit-deal">
              {createMut.isPending ? "Opening..." : "Open Deal"}
            </Button>
          </div>
        </div>
      )}

      {/* Filter row */}
      <div className="flex gap-1 flex-wrap">
        {(["all", "active", "won", "lost", "abandoned"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            data-testid={`filter-deal-${f}`}
            className={cn(
              "px-2 py-0.5 rounded text-xs border transition-colors",
              filter === f
                ? "bg-zinc-700 text-zinc-100 border-zinc-500"
                : "bg-zinc-900 text-zinc-500 border-zinc-700 hover:border-zinc-600"
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Deals list */}
      {isLoading ? (
        <div className="flex flex-col gap-2">{[1, 2].map(i => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-zinc-600 text-sm">
          {filter === "all" ? "No deals yet — tell a0 what you want to negotiate." : `No ${filter} deals.`}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((deal: any) => {
            const isExp = expanded === deal.id;
            const goals: string[] = deal.myGoals || [];
            const history: any[] = deal.counterHistory || [];
            return (
              <div
                key={deal.id}
                className="rounded-lg border border-zinc-700 bg-zinc-900 overflow-hidden"
                data-testid={`card-deal-${deal.id}`}
              >
                {/* Deal header */}
                <div
                  className="flex items-start gap-2 p-3 cursor-pointer select-none"
                  onClick={() => setExpanded(isExp ? null : deal.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-zinc-200 truncate">{deal.title}</span>
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-medium", statusColor[deal.status] || statusColor.abandoned)}>
                        {deal.status}
                      </span>
                      {history.length > 0 && (
                        <span className="text-[10px] text-zinc-500">{history.length} moves</span>
                      )}
                    </div>
                    <div className="flex gap-3 mt-1 text-[11px] text-zinc-500 flex-wrap">
                      {deal.ceiling != null && (
                        <span className="flex items-center gap-0.5">
                          <TrendingDown className="w-3 h-3 text-amber-400" /> ceiling: {deal.ceiling.toLocaleString()}
                        </span>
                      )}
                      {deal.walkAway != null && (
                        <span className="flex items-center gap-0.5">
                          <TrendingUp className="w-3 h-3 text-red-400" /> walk-away: {deal.walkAway.toLocaleString()}
                        </span>
                      )}
                    </div>
                    {goals.length > 0 && !isExp && (
                      <div className="mt-1 text-[10px] text-zinc-600 truncate">Goals: {goals.join(" · ")}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {deal.status === "active" && (
                      <>
                        <Button
                          size="sm" variant="ghost"
                          className="h-6 px-1.5 text-[10px] text-green-400 hover:text-green-300"
                          onClick={e => { e.stopPropagation(); closeMut.mutate({ id: deal.id, status: "won", outcome: "Closed as won" }); }}
                          data-testid={`button-close-won-${deal.id}`}
                          title="Mark won"
                        >
                          <Check className="w-3 h-3" />
                        </Button>
                        <Button
                          size="sm" variant="ghost"
                          className="h-6 px-1.5 text-[10px] text-red-400 hover:text-red-300"
                          onClick={e => { e.stopPropagation(); closeMut.mutate({ id: deal.id, status: "lost", outcome: "Closed as lost" }); }}
                          data-testid={`button-close-lost-${deal.id}`}
                          title="Mark lost"
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </>
                    )}
                    {isExp ? <ChevronDown className="w-3.5 h-3.5 text-zinc-500" /> : <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />}
                  </div>
                </div>

                {/* Expanded detail */}
                {isExp && (
                  <div className="border-t border-zinc-800 px-3 pb-3 pt-2 flex flex-col gap-3">
                    {goals.length > 0 && (
                      <div>
                        <div className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1">Goals</div>
                        <ul className="flex flex-col gap-0.5">
                          {goals.map((g, i) => (
                            <li key={i} className="text-xs text-zinc-300 flex gap-1.5 items-start">
                              <span className="text-zinc-600 mt-0.5">·</span>{g}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {history.length > 0 && (
                      <div>
                        <div className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1">Negotiation History ({history.length})</div>
                        <div className="flex flex-col gap-2">
                          {history.map((h: any, i: number) => {
                            const isUs = h.side === "us";
                            const edcm = h.edcm || {};
                            return (
                              <div
                                key={i}
                                data-testid={`deal-move-${deal.id}-${i}`}
                                className={cn(
                                  "rounded p-2 text-xs border",
                                  isUs
                                    ? "bg-blue-950/40 border-blue-800/40 ml-4"
                                    : "bg-zinc-800/60 border-zinc-700/60"
                                )}
                              >
                                <div className="flex items-center gap-2 mb-1">
                                  <span className={cn("font-medium text-[10px]", isUs ? "text-blue-300" : "text-amber-300")}>
                                    {isUs ? "Our move" : "Their offer"}
                                  </span>
                                  <span className="text-zinc-600 text-[10px] ml-auto">
                                    {new Date(h.timestamp).toLocaleDateString()}
                                  </span>
                                </div>
                                {h.text && <p className="text-zinc-400 mb-1 line-clamp-3">{h.text}</p>}
                                {Object.keys(edcm).length > 0 && (
                                  <div className="flex gap-2 flex-wrap mt-1">
                                    {Object.entries(edcm).map(([k, v]: any) => (
                                      <span key={k} className={cn("text-[10px] px-1 py-0.5 rounded", v > 0.6 ? "text-red-300 bg-red-900/30" : "text-zinc-400 bg-zinc-800")}>
                                        {k.toUpperCase()} {(v as number).toFixed(2)}
                                      </span>
                                    ))}
                                  </div>
                                )}
                                {h.notes && <p className="text-zinc-500 text-[10px] mt-1 italic">{h.notes}</p>}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {deal.outcome && (
                      <div>
                        <div className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1">Outcome</div>
                        <p className="text-xs text-zinc-300">{deal.outcome}</p>
                      </div>
                    )}

                    {!deal.outcome && history.length === 0 && (
                      <div className="text-[11px] text-zinc-600 italic">No moves logged yet. Ask a0 to analyze an offer and start negotiating.</div>
                    )}
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

function WorkflowTab() {
  const { toast } = useToast();
  const [stopDialogOpen, setStopDialogOpen] = useState(false);

  const { data: status, isLoading } = useQuery<{
    isRunning: boolean;
    emergencyStop: boolean;
    uptime: number;
  }>({
    queryKey: ["/api/a0p/status"],
    refetchInterval: 5000,
  });

  const { data: heartbeats = [] } = useQuery<any[]>({
    queryKey: ["/api/a0p/heartbeat"],
    refetchInterval: 30000,
  });

  const { data: chainStatus } = useQuery<{
    valid: boolean;
    length: number;
    errors: string[];
  }>({
    queryKey: ["/api/a0p/chain/verify"],
    refetchInterval: 60000,
  });

  const stopMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/a0p/emergency-stop"),
    onSuccess: () => {
      toast({ title: "Engine stopped" });
      setStopDialogOpen(false);
    },
  });

  const resumeMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/a0p/resume"),
    onSuccess: () => toast({ title: "Engine resumed" }),
  });

  function handleStopKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      stopMutation.mutate();
    }
  }

  const uptimeStr = status?.uptime
    ? `${Math.floor(status.uptime / 3600)}h ${Math.floor((status.uptime % 3600) / 60)}m`
    : "--";

  return (
    <ScrollArea className="h-full px-3 py-3">
      <div className="space-y-4 pb-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">Engine Status</h3>
            <Badge
              variant={status?.isRunning ? "default" : "destructive"}
              data-testid="status-engine"
            >
              {status?.emergencyStop ? "STOPPED" : status?.isRunning ? "RUNNING" : "OFFLINE"}
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-muted-foreground">Uptime</span>
              <p className="font-mono" data-testid="text-uptime">{uptimeStr}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Heartbeat</span>
              <p className="font-mono">1h interval</p>
            </div>
            <div>
              <span className="text-muted-foreground">Hash Chain</span>
              <p className={cn("font-mono", chainStatus?.valid ? "text-green-400" : "text-red-400")} data-testid="text-chain-status">
                {chainStatus ? `${chainStatus.valid ? "VALID" : "BROKEN"} (${chainStatus.length} events)` : "..."}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Sentinels</span>
              <p className="font-mono">9/9 active</p>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          {status?.isRunning ? (
            <Button
              variant="destructive"
              className="flex-1 gap-2"
              onClick={() => setStopDialogOpen(true)}
              data-testid="button-emergency-stop"
            >
              <OctagonX className="w-4 h-4" />
              Emergency Stop
            </Button>
          ) : (
            <Button
              className="flex-1 gap-2"
              onClick={() => resumeMutation.mutate()}
              disabled={resumeMutation.isPending}
              data-testid="button-resume"
            >
              <Play className="w-4 h-4" />
              Resume Engine
            </Button>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <Heart className="w-4 h-4 text-red-400" />
            Heartbeat Log
          </h3>
          <div className="space-y-2">
            {heartbeats.length === 0 ? (
              <p className="text-xs text-muted-foreground">No heartbeats yet. First one fires 5s after startup, then hourly.</p>
            ) : (
              heartbeats.slice(0, 10).map((hb: any) => (
                <div key={hb.id} className="flex items-center gap-2 text-xs">
                  <span className={cn("w-2 h-2 rounded-full", hb.status === "OK" ? "bg-green-400" : "bg-red-400")} />
                  <span className="font-mono flex-1">{hb.status}</span>
                  <span className="text-muted-foreground">
                    {new Date(hb.createdAt).toLocaleTimeString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <Dialog open={stopDialogOpen} onOpenChange={setStopDialogOpen}>
        <DialogContent className="w-[90vw] max-w-sm" onKeyDown={handleStopKeyDown}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Emergency Stop
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will immediately halt the a0p engine, stop the heartbeat, and prevent all operations.
            Are you sure?
          </p>
          <p className="text-xs text-muted-foreground mt-1">Press Enter to confirm.</p>
          <DialogFooter className="gap-2">
            <Button variant="secondary" onClick={() => setStopDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => stopMutation.mutate()}
              disabled={stopMutation.isPending}
              data-testid="button-confirm-stop"
            >
              <OctagonX className="w-4 h-4 mr-1" />
              Stop Engine
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScrollArea>
  );
}

const BANDIT_DOMAINS = ["tool", "model", "ptca_route", "pcna_route"] as const;

interface SliderOrientationProps {
  orientation: "vertical" | "horizontal";
  isVertical: boolean;
}

function BanditTab({ orientation, isVertical }: SliderOrientationProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: statsData, isLoading } = useQuery<any>({
    queryKey: ["/api/bandit/stats"],
    refetchInterval: 10000,
  });
  const stats: any[] = statsData?.arms || [];

  const { data: correlationsData } = useQuery<any>({
    queryKey: ["/api/bandit/correlations"],
    refetchInterval: 10000,
  });
  const correlations: any[] = Array.isArray(correlationsData) ? correlationsData : [];

  const { data: directiveConfig } = useQuery<any>({
    queryKey: ["/api/edcm/directives"],
    refetchInterval: 10000,
  });

  const { data: edcmHistory } = useQuery<{ snapshots: any[]; directiveHistory: any[] }>({
    queryKey: ["/api/edcm/history"],
    refetchInterval: 10000,
  });

  const toggleArmMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      apiRequest("POST", `/api/bandit/toggle/${id}`, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bandit/stats"] });
    },
  });

  const resetDomainMutation = useMutation({
    mutationFn: (domain: string) => apiRequest("POST", `/api/bandit/reset/${domain}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bandit/stats"] });
      toast({ title: "Domain reset" });
    },
  });

  const updateToggleMutation = useMutation({
    mutationFn: ({ subsystem, enabled, parameters }: { subsystem: string; enabled?: boolean; parameters?: any }) =>
      apiRequest("PATCH", `/api/toggles/${subsystem}`, { enabled, parameters }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/edcm/directives"] });
      queryClient.invalidateQueries({ queryKey: ["/api/toggles"] });
    },
  });

  if (isLoading) return <div className="p-4"><Skeleton className="h-40 w-full" /></div>;

  const armsByDomain: Record<string, any[]> = {};
  for (const arm of stats) {
    if (!armsByDomain[arm.domain]) armsByDomain[arm.domain] = [];
    armsByDomain[arm.domain].push(arm);
  }

  const DIRECTIVE_TYPES = [
    { type: "CONSTRAINT_REFOCUS", metric: "CM", description: "Refocuses when constraint metric exceeds threshold" },
    { type: "DISSONANCE_HALT", metric: "DA", description: "Halts when dissonance metric exceeds threshold" },
    { type: "DRIFT_ANCHOR", metric: "DRIFT", description: "Anchors when drift metric exceeds threshold" },
    { type: "DIVERGENCE_COMMIT", metric: "DVG", description: "Commits when divergence metric exceeds threshold" },
    { type: "INTENSITY_CALM", metric: "INT", description: "Calms when intensity metric exceeds threshold" },
    { type: "BALANCE_CONCISE", metric: "TBF", description: "Concise when balance metric exceeds threshold" },
  ];
  const directives = DIRECTIVE_TYPES.map(d => ({
    ...d,
    enabled: directiveConfig?.directiveToggles?.[d.type] !== false,
    threshold: directiveConfig?.thresholds?.[d.type] ?? 0.8,
    fired: false,
  }));
  const edcmSnapshots = edcmHistory?.snapshots || [];

  return (
    <ScrollArea className="h-full px-3 py-3">
      <div className="space-y-4 pb-4">
        {BANDIT_DOMAINS.map((domain) => {
          const arms = armsByDomain[domain] || [];
          const maxReward = Math.max(0.001, ...arms.map((a: any) => a.avgReward || 0));
          return (
            <div key={domain} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <Target className="w-4 h-4 text-orange-400" />
                  {domain.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                </h3>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => resetDomainMutation.mutate(domain)}
                  disabled={resetDomainMutation.isPending}
                  data-testid={`button-reset-${domain}`}
                >
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Reset
                </Button>
              </div>
              {arms.length === 0 ? (
                <p className="text-xs text-muted-foreground">No arms configured for this domain.</p>
              ) : (
                <div className="space-y-2">
                  {arms.map((arm: any) => (
                    <div
                      key={arm.id}
                      className={cn("rounded-md border border-border p-2.5 space-y-1.5", !arm.enabled && "opacity-50")}
                      data-testid={`bandit-arm-${arm.id}`}
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <Switch
                            checked={arm.enabled}
                            onCheckedChange={(enabled) => toggleArmMutation.mutate({ id: arm.id, enabled })}
                            data-testid={`toggle-arm-${arm.id}`}
                          />
                          <span className="text-xs font-mono font-bold truncate" data-testid={`text-arm-name-${arm.id}`}>
                            {arm.armName}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <Badge variant="secondary" className="text-[9px] font-mono">
                            pulls={arm.pulls}
                          </Badge>
                          <Badge variant="secondary" className="text-[9px] font-mono">
                            UCB={arm.ucbScore?.toFixed(3) || "0.000"}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground w-10 flex-shrink-0">Avg</span>
                        <div className="flex-1 h-2 bg-background rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all"
                            style={{ width: `${maxReward > 0 ? ((arm.avgReward || 0) / maxReward) * 100 : 0}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-mono w-12 text-right">{(arm.avgReward || 0).toFixed(3)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground w-10 flex-shrink-0">EMA</span>
                        <div className="flex-1 h-2 bg-background rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full transition-all"
                            style={{ width: `${maxReward > 0 ? ((arm.emaReward || 0) / maxReward) * 100 : 0}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-mono w-12 text-right">{(arm.emaReward || 0).toFixed(3)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <Brain className="w-4 h-4 text-purple-400" />
            EDCM Directives
          </h3>
          {directives.length === 0 ? (
            <p className="text-xs text-muted-foreground">No directive configuration loaded.</p>
          ) : (
            <div className={cn(isVertical ? "grid grid-cols-2 gap-2" : "space-y-2")}>
              {directives.map((dir: any) => (
                <div key={dir.type} className="rounded-md border border-border p-2.5 space-y-1.5" data-testid={`directive-${dir.type}`}>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <Switch
                        checked={dir.enabled !== false}
                        onCheckedChange={(enabled) => {
                          const params = directiveConfig?.parameters || {};
                          const dirToggles = { ...(params.directiveToggles || {}) };
                          dirToggles[dir.type] = enabled;
                          updateToggleMutation.mutate({
                            subsystem: "edcm_directives",
                            parameters: { ...params, directiveToggles: dirToggles },
                          });
                        }}
                        data-testid={`toggle-directive-${dir.type}`}
                      />
                      <span className="text-xs font-mono font-bold">{dir.type}</span>
                    </div>
                    <Badge
                      variant="secondary"
                      className={cn("text-[9px]", dir.fired ? "bg-red-500/20 text-red-400" : "bg-muted text-muted-foreground")}
                    >
                      {dir.fired ? "FIRED" : "idle"}
                    </Badge>
                  </div>
                  <div className={cn(
                    isVertical ? "flex flex-col items-center gap-1" : "flex items-center gap-2"
                  )}>
                    <span className="text-[10px] text-muted-foreground flex-shrink-0">{isVertical ? "" : "Threshold"}</span>
                    <Slider
                      value={[dir.threshold ?? 0.8]}
                      onValueChange={([val]) => {
                        const params = directiveConfig?.parameters || {};
                        const thresholds = { ...(params.thresholds || {}) };
                        thresholds[dir.metric] = val;
                        updateToggleMutation.mutate({
                          subsystem: "edcm_directives",
                          parameters: { ...params, thresholds },
                        });
                      }}
                      min={0}
                      max={1}
                      step={0.05}
                      orientation={orientation}
                      className={cn(isVertical ? "h-[120px]" : "flex-1")}
                      data-testid={`slider-threshold-${dir.type}`}
                    />
                    <span className="text-[10px] font-mono text-right">{(dir.threshold ?? 0.8).toFixed(2)}</span>
                  </div>
                  <p className="text-[9px] text-muted-foreground">{dir.description || `Fires when ${dir.metric} exceeds threshold`}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-400" />
            EDCM History
          </h3>
          {edcmSnapshots.length === 0 ? (
            <p className="text-xs text-muted-foreground">No EDCM history yet.</p>
          ) : (
            <div className="space-y-2">
              {["CM", "DA", "DRIFT", "DVG", "INT", "TBF"].map((metric) => {
                const keyMap: Record<string, string> = { CM: "cm", DA: "da", DRIFT: "drift", DVG: "dvg", INT: "intVal", TBF: "tbf" };
                const values = edcmSnapshots.slice(0, 20).reverse().map((s: any) => {
                  const val = s[keyMap[metric]] ?? s[metric.toLowerCase()] ?? s[metric] ?? 0;
                  return typeof val === "number" ? val : 0;
                });
                return (
                  <div key={metric} className="flex items-center gap-2" data-testid={`sparkline-${metric}`}>
                    <span className="text-[10px] font-mono w-10 flex-shrink-0">{metric}</span>
                    <div className="flex items-end gap-px flex-1 h-5">
                      {values.map((v: number, i: number) => (
                        <div
                          key={i}
                          className={cn(
                            "flex-1 rounded-t min-w-[2px]",
                            v >= 0.8 ? "bg-red-500" : v <= 0.2 ? "bg-green-500" : "bg-amber-500"
                          )}
                          style={{ height: `${Math.max(2, v * 100)}%` }}
                        />
                      ))}
                    </div>
                    <span className="text-[9px] font-mono w-10 text-right text-muted-foreground">
                      {values.length > 0 ? values[values.length - 1].toFixed(2) : "--"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" />
            Cross-Domain Correlations (Top 10)
          </h3>
          {correlations.length === 0 ? (
            <p className="text-xs text-muted-foreground">No cross-domain correlations recorded yet.</p>
          ) : (
            <div className="space-y-1.5">
              {correlations.slice(0, 10).map((corr: any, i: number) => {
                const maxJoint = Math.max(0.001, ...correlations.slice(0, 10).map((c: any) => c.jointReward || 0));
                return (
                  <div key={corr.id || i} className="flex items-center gap-2 text-xs" data-testid={`correlation-${i}`}>
                    <span className="font-mono text-[9px] w-4 text-muted-foreground flex-shrink-0">{i + 1}</span>
                    <div className="flex items-center gap-1 flex-1 min-w-0 flex-wrap">
                      <Badge variant="secondary" className="text-[8px]">{corr.toolArm}</Badge>
                      <Badge variant="secondary" className="text-[8px]">{corr.modelArm}</Badge>
                      <Badge variant="secondary" className="text-[8px]">{corr.ptcaArm}</Badge>
                      <Badge variant="secondary" className="text-[8px]">{corr.pcnaArm}</Badge>
                    </div>
                    <div className="w-16 h-2 bg-background rounded-full overflow-hidden flex-shrink-0">
                      <div
                        className="h-full bg-amber-500 rounded-full"
                        style={{ width: `${(corr.jointReward / maxJoint) * 100}%` }}
                      />
                    </div>
                    <span className="font-mono text-[9px] w-10 text-right flex-shrink-0">{(corr.jointReward || 0).toFixed(3)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </ScrollArea>
  );
}

function MetricsTab({ orientation, isVertical }: SliderOrientationProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingRate, setEditingRate] = useState<string | null>(null);
  const [rateForm, setRateForm] = useState({ prompt: "", completion: "", cache: "" });
  const [newModelName, setNewModelName] = useState("");
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const { data: summary, isLoading } = useQuery<{
    totalCost: number;
    totalPromptTokens: number;
    totalCompletionTokens: number;
    totalCacheTokens: number;
    costThisMonth: number;
    costToday: number;
    byModel: Record<string, { cost: number; promptTokens: number; completionTokens: number; cacheTokens: number; calls: number }>;
    byStage: Record<string, { cost: number; promptTokens: number; completionTokens: number; calls: number }>;
    byConversation: { conversationId: number; cost: number; tokens: number; calls: number }[];
    dailyUsage: { date: string; promptTokens: number; completionTokens: number; cost: number }[];
  }>({
    queryKey: ["/api/metrics/costs"],
    refetchInterval: 15000,
  });

  const { data: tokenRates } = useQuery<Record<string, { prompt: number; completion: number; cache: number }>>({
    queryKey: ["/api/metrics/token-rates"],
  });

  const { data: spendLimit } = useQuery<{ enabled: boolean; limit: number; mode: string; currentSpend: number }>({
    queryKey: ["/api/metrics/spend-limit"],
    refetchInterval: 30000,
  });

  const updateRatesMutation = useMutation({
    mutationFn: (rates: Record<string, { prompt: number; completion: number; cache: number }>) =>
      apiRequest("POST", "/api/metrics/token-rates", { rates }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/metrics/token-rates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/metrics/costs"] });
      toast({ title: "Token rates updated" });
      setEditingRate(null);
      setNewModelName("");
    },
  });

  const updateSpendLimitMutation = useMutation({
    mutationFn: (data: { enabled: boolean; limit: number; mode: string }) =>
      apiRequest("POST", "/api/metrics/spend-limit", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/metrics/spend-limit"] });
      toast({ title: "Spend limit updated" });
    },
  });

  if (isLoading) return <div className="p-4"><Skeleton className="h-40 w-full" /></div>;

  const totalTokens = (summary?.totalPromptTokens || 0) + (summary?.totalCompletionTokens || 0) + (summary?.totalCacheTokens || 0);
  const maxDailyCost = Math.max(0.0001, ...((summary?.dailyUsage || []).map(d => d.cost)));

  function startEditRate(model: string) {
    const rates = tokenRates || {};
    const r = rates[model] || { prompt: 0, completion: 0, cache: 0 };
    setRateForm({
      prompt: (r.prompt * 1_000_000).toFixed(4),
      completion: (r.completion * 1_000_000).toFixed(4),
      cache: (r.cache * 1_000_000).toFixed(4),
    });
    setEditingRate(model);
  }

  function saveRate(model: string) {
    const updated = { ...(tokenRates || {}) };
    updated[model] = {
      prompt: parseFloat(rateForm.prompt) / 1_000_000,
      completion: parseFloat(rateForm.completion) / 1_000_000,
      cache: parseFloat(rateForm.cache) / 1_000_000,
    };
    updateRatesMutation.mutate(updated);
  }

  function addNewModel() {
    if (!newModelName.trim()) return;
    startEditRate(newModelName.trim());
    setNewModelName("");
  }

  function deleteRate(model: string) {
    const updated = { ...(tokenRates || {}) };
    delete updated[model];
    updateRatesMutation.mutate(updated);
  }

  return (
    <ScrollArea className="h-full px-3 py-3">
      <div className="space-y-4 pb-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-400" />
            Summary
          </h3>
          <div className="grid grid-cols-2 gap-3 text-center">
            <div>
              <p className="text-xl font-bold font-mono" data-testid="text-total-tokens">
                {totalTokens.toLocaleString()}
              </p>
              <p className="text-[10px] text-muted-foreground">Total Tokens</p>
            </div>
            <div>
              <p className="text-xl font-bold font-mono" data-testid="text-total-cost">
                ${(summary?.totalCost || 0).toFixed(4)}
              </p>
              <p className="text-[10px] text-muted-foreground">Total Cost</p>
            </div>
            <div>
              <p className="text-lg font-bold font-mono text-blue-400" data-testid="text-cost-month">
                ${(summary?.costThisMonth || 0).toFixed(4)}
              </p>
              <p className="text-[10px] text-muted-foreground">This Month</p>
            </div>
            <div>
              <p className="text-lg font-bold font-mono text-emerald-400" data-testid="text-cost-today">
                ${(summary?.costToday || 0).toFixed(4)}
              </p>
              <p className="text-[10px] text-muted-foreground">Today</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-3 text-center">
            <div>
              <p className="text-sm font-mono text-blue-400">{(summary?.totalPromptTokens || 0).toLocaleString()}</p>
              <p className="text-[9px] text-muted-foreground">Prompt</p>
            </div>
            <div>
              <p className="text-sm font-mono text-emerald-400">{(summary?.totalCompletionTokens || 0).toLocaleString()}</p>
              <p className="text-[9px] text-muted-foreground">Completion</p>
            </div>
            <div>
              <p className="text-sm font-mono text-amber-400">{(summary?.totalCacheTokens || 0).toLocaleString()}</p>
              <p className="text-[9px] text-muted-foreground">Cache</p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <button
            className="w-full flex items-center justify-between text-sm font-semibold"
            onClick={() => setExpandedSection(expandedSection === "model" ? null : "model")}
            data-testid="button-toggle-model-breakdown"
          >
            <span className="flex items-center gap-2"><Cpu className="w-4 h-4 text-purple-400" /> Per-Model Breakdown</span>
            {expandedSection === "model" ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          {expandedSection === "model" && summary?.byModel && (
            <div className="mt-3 space-y-1.5">
              <div className="grid grid-cols-6 gap-1 text-[9px] font-mono text-muted-foreground px-1">
                <span className="col-span-1">Model</span>
                <span className="text-right">Calls</span>
                <span className="text-right">Prompt</span>
                <span className="text-right">Compl.</span>
                <span className="text-right">Cache</span>
                <span className="text-right">Cost</span>
              </div>
              {Object.entries(summary.byModel).map(([model, data]) => (
                <div key={model} className="grid grid-cols-6 gap-1 text-[10px] font-mono items-center px-1" data-testid={`model-row-${model}`}>
                  <Badge variant="secondary" className="text-[9px] col-span-1 justify-start">{model}</Badge>
                  <span className="text-right">{data.calls}</span>
                  <span className="text-right">{data.promptTokens.toLocaleString()}</span>
                  <span className="text-right">{data.completionTokens.toLocaleString()}</span>
                  <span className="text-right">{(data.cacheTokens || 0).toLocaleString()}</span>
                  <span className="text-right">${data.cost.toFixed(4)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <button
            className="w-full flex items-center justify-between text-sm font-semibold"
            onClick={() => setExpandedSection(expandedSection === "stage" ? null : "stage")}
            data-testid="button-toggle-stage-breakdown"
          >
            <span className="flex items-center gap-2"><GitBranch className="w-4 h-4 text-blue-400" /> Per-Stage Breakdown</span>
            {expandedSection === "stage" ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          {expandedSection === "stage" && summary?.byStage && (
            <div className="mt-3 space-y-1.5">
              {Object.entries(summary.byStage).map(([stage, data]) => (
                <div key={stage} className="flex items-center justify-between gap-2 text-xs" data-testid={`stage-row-${stage}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant="secondary" className="text-[9px]">{stage}</Badge>
                    <span className="text-muted-foreground text-[10px]">{data.calls} calls</span>
                  </div>
                  <span className="font-mono text-[10px] flex-shrink-0">
                    {(data.promptTokens + data.completionTokens).toLocaleString()} tok &middot; ${data.cost.toFixed(4)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <button
            className="w-full flex items-center justify-between text-sm font-semibold"
            onClick={() => setExpandedSection(expandedSection === "conv" ? null : "conv")}
            data-testid="button-toggle-conv-breakdown"
          >
            <span className="flex items-center gap-2"><ScrollText className="w-4 h-4 text-amber-400" /> Per-Conversation Cost</span>
            {expandedSection === "conv" ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          {expandedSection === "conv" && (
            <div className="mt-3 space-y-1">
              {(summary?.byConversation || []).length === 0 ? (
                <p className="text-xs text-muted-foreground">No conversation cost data yet.</p>
              ) : (
                (summary?.byConversation || []).map((conv) => (
                  <div key={conv.conversationId} className="flex items-center justify-between gap-2 text-[10px] font-mono" data-testid={`conv-cost-${conv.conversationId}`}>
                    <span className="text-muted-foreground">Conv #{conv.conversationId}</span>
                    <span>{conv.tokens.toLocaleString()} tok &middot; {conv.calls} calls &middot; ${conv.cost.toFixed(4)}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-400" />
            Daily Usage (30d)
          </h3>
          {(summary?.dailyUsage || []).length === 0 ? (
            <p className="text-xs text-muted-foreground">No daily usage data yet.</p>
          ) : (
            <div className="space-y-1">
              <div className="flex items-end gap-px h-20" data-testid="chart-daily-usage">
                {(summary?.dailyUsage || []).map((day) => (
                  <div
                    key={day.date}
                    className="flex-1 bg-primary rounded-t min-w-[3px] transition-all"
                    style={{ height: `${Math.max(2, (day.cost / maxDailyCost) * 100)}%` }}
                    title={`${day.date}: $${day.cost.toFixed(4)}`}
                  />
                ))}
              </div>
              <div className="flex justify-between text-[9px] text-muted-foreground font-mono">
                <span>{(summary?.dailyUsage || [])[0]?.date?.slice(5) || ""}</span>
                <span>{(summary?.dailyUsage || [])[(summary?.dailyUsage || []).length - 1]?.date?.slice(5) || ""}</span>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <Settings className="w-4 h-4 text-muted-foreground" />
            Rate Cards ($/1M tokens)
          </h3>
          <div className="space-y-2">
            {tokenRates && Object.entries(tokenRates).map(([model, rates]) => (
              <div key={model} className="rounded-md border border-border p-2 space-y-1" data-testid={`rate-card-${model}`}>
                {editingRate === model ? (
                  <div className="space-y-1.5">
                    <span className="text-xs font-mono font-bold">{model}</span>
                    <div className="grid grid-cols-3 gap-1.5">
                      <div>
                        <label className="text-[9px] text-muted-foreground">Prompt</label>
                        <Input
                          value={rateForm.prompt}
                          onChange={(e) => setRateForm({ ...rateForm, prompt: e.target.value })}
                          className="text-xs h-7"
                          data-testid={`input-rate-prompt-${model}`}
                        />
                      </div>
                      <div>
                        <label className="text-[9px] text-muted-foreground">Completion</label>
                        <Input
                          value={rateForm.completion}
                          onChange={(e) => setRateForm({ ...rateForm, completion: e.target.value })}
                          className="text-xs h-7"
                          data-testid={`input-rate-completion-${model}`}
                        />
                      </div>
                      <div>
                        <label className="text-[9px] text-muted-foreground">Cache</label>
                        <Input
                          value={rateForm.cache}
                          onChange={(e) => setRateForm({ ...rateForm, cache: e.target.value })}
                          className="text-xs h-7"
                          data-testid={`input-rate-cache-${model}`}
                        />
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      <Button size="sm" onClick={() => saveRate(model)} disabled={updateRatesMutation.isPending} data-testid={`button-save-rate-${model}`}>
                        <Check className="w-3 h-3 mr-1" /> Save
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => setEditingRate(null)} data-testid={`button-cancel-rate-${model}`}>
                        <X className="w-3 h-3 mr-1" /> Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs font-mono font-bold">{model}</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-[9px] font-mono text-muted-foreground">
                        P=${(rates.prompt * 1_000_000).toFixed(2)} C=${(rates.completion * 1_000_000).toFixed(2)} Ca=${(rates.cache * 1_000_000).toFixed(2)}
                      </span>
                      <Button size="icon" variant="ghost" onClick={() => startEditRate(model)} data-testid={`button-edit-rate-${model}`}>
                        <Settings className="w-3 h-3" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => deleteRate(model)} data-testid={`button-delete-rate-${model}`}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            <div className="flex items-center gap-2">
              <Input
                placeholder="New model name..."
                value={newModelName}
                onChange={(e) => setNewModelName(e.target.value)}
                className="text-xs flex-1"
                data-testid="input-new-rate-model"
              />
              <Button size="sm" onClick={addNewModel} disabled={!newModelName.trim()} data-testid="button-add-rate-model">
                <Plus className="w-3 h-3 mr-1" /> Add
              </Button>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            Spend Limits
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs">Enforcement</span>
              <Switch
                checked={spendLimit?.enabled || false}
                onCheckedChange={(enabled) =>
                  updateSpendLimitMutation.mutate({ enabled, limit: spendLimit?.limit || 50, mode: spendLimit?.mode || "warn" })
                }
                data-testid="toggle-spend-limit"
              />
            </div>
            <div className={cn(!(spendLimit?.enabled) && "opacity-40 pointer-events-none", "space-y-3")}>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span>Mode</span>
                <Select
                  value={spendLimit?.mode || "warn"}
                  onValueChange={(mode) =>
                    updateSpendLimitMutation.mutate({ enabled: spendLimit?.enabled || false, limit: spendLimit?.limit || 50, mode })
                  }
                >
                  <SelectTrigger className="w-32 text-xs" data-testid="select-spend-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="warn">Warn Only</SelectItem>
                    <SelectItem value="hard_stop">Hard Stop</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs mb-2">
                  <span>Monthly limit</span>
                  <span className="font-mono font-bold">${spendLimit?.limit || 50}</span>
                </div>
                <div className={cn(isVertical ? "flex items-center justify-center gap-2" : "")}>
                  <Slider
                    value={[spendLimit?.limit || 50]}
                    onValueChange={([val]) =>
                      updateSpendLimitMutation.mutate({ enabled: spendLimit?.enabled || false, limit: val, mode: spendLimit?.mode || "warn" })
                    }
                    min={1}
                    max={500}
                    step={1}
                    orientation={orientation}
                    className={cn(isVertical ? "h-[160px]" : "")}
                    data-testid="slider-spend-limit"
                  />
                </div>
                <div className={cn("flex text-[10px] text-muted-foreground mt-1", isVertical ? "justify-center gap-3" : "justify-between")}>
                  <span>$1</span>
                  <span>$500</span>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span>Current month usage</span>
                  <span className="font-mono text-[10px]">
                    ${(spendLimit?.currentSpend || 0).toFixed(4)} / ${spendLimit?.limit || 50}
                  </span>
                </div>
                <div className="w-full h-2 bg-background rounded-full overflow-hidden" data-testid="progress-spend">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      (spendLimit?.currentSpend || 0) >= (spendLimit?.limit || 50) ? "bg-red-500" :
                      (spendLimit?.currentSpend || 0) >= (spendLimit?.limit || 50) * 0.8 ? "bg-amber-500" : "bg-emerald-500"
                    )}
                    style={{ width: `${Math.min(100, ((spendLimit?.currentSpend || 0) / (spendLimit?.limit || 50)) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}

const ALERT_NAMES: Record<string, string> = {
  CM: "ALERT_CM_HIGH",
  DA: "ALERT_DA_RISING",
  DVG: "ALERT_DVG_SPLIT",
  INT: "ALERT_INT_SPIKE",
  TBF: "ALERT_TBF_SKEW",
  DRIFT: "ALERT_DRIFT_AWAY",
};

function alertColor(value: number): { bg: string; text: string; label: string } {
  if (value >= 0.80) return { bg: "bg-red-500/20", text: "text-red-400", label: "HIGH" };
  if (value <= 0.20) return { bg: "bg-green-500/20", text: "text-green-400", label: "LOW" };
  return { bg: "bg-amber-500/20", text: "text-amber-400", label: "HYSTERESIS" };
}

function MetricRow({ metricKey, value, evidence }: { metricKey: string; value: number; evidence: string[] }) {
  const { persona } = usePersona();
  const labels = PERSONA_METRIC_LABELS[persona] ?? DEFAULT_METRIC_LABELS;
  const info = labels[metricKey] || { label: metricKey, desc: "" };
  const alert = alertColor(value);
  const pct = Math.round(value * 100);

  return (
    <div className="space-y-1" data-testid={`metric-row-${metricKey}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="font-mono text-xs font-bold w-10 flex-shrink-0">{metricKey}</span>
          <span className="text-[10px] text-muted-foreground truncate">{info.label}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="font-mono text-xs font-bold" data-testid={`text-metric-value-${metricKey}`}>
            {value.toFixed(3)}
          </span>
          <Badge
            variant="secondary"
            className={cn("text-[9px] font-mono", alert.bg, alert.text)}
            data-testid={`badge-alert-${metricKey}`}
          >
            {alert.label}
          </Badge>
        </div>
      </div>
      <div className="w-full h-1.5 bg-background rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", value >= 0.80 ? "bg-red-500" : value <= 0.20 ? "bg-green-500" : "bg-amber-500")}
          style={{ width: `${pct}%` }}
        />
      </div>
      {evidence.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {evidence.map((e, i) => (
            <span key={i} className="text-[9px] font-mono text-muted-foreground">{e}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function TranscriptSourcesSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const [expandedReport, setExpandedReport] = useState<string | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const { data: sources = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/transcripts/sources"],
    refetchInterval: 15000,
  });

  const createMutation = useMutation({
    mutationFn: (displayName: string) => apiRequest("POST", "/api/transcripts/sources", { displayName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transcripts/sources"] });
      setNewName(""); setCreating(false);
      toast({ title: "Source created" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (slug: string) => apiRequest("DELETE", `/api/transcripts/sources/${slug}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transcripts/sources"] });
      toast({ title: "Source deleted" });
    },
  });

  const scanMutation = useMutation({
    mutationFn: (slug: string) => apiRequest("POST", `/api/transcripts/sources/${slug}/scan`),
    onSuccess: (_, slug) => {
      queryClient.invalidateQueries({ queryKey: ["/api/transcripts/sources"] });
      setExpandedReport(slug);
      toast({ title: "Scan complete" });
    },
    onError: (e: any) => toast({ title: "Scan failed", description: (e as any).message, variant: "destructive" }),
  });

  const uploadFiles = async (slug: string, files: FileList) => {
    const formData = new FormData();
    for (const f of Array.from(files)) formData.append("files", f);
    try {
      const res = await fetch(`/api/transcripts/sources/${slug}/upload`, { method: "POST", body: formData });
      if (!res.ok) throw new Error(await res.text());
      queryClient.invalidateQueries({ queryKey: ["/api/transcripts/sources"] });
      toast({ title: `Uploaded ${files.length} file(s)` });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    }
  };

  const METRIC_COLORS: Record<string, string> = {
    CM: "text-yellow-400", DA: "text-red-400", DRIFT: "text-blue-400",
    DVG: "text-purple-400", INT: "text-orange-400", TBF: "text-green-400",
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <FileText className="w-4 h-4 text-blue-400" />
          Transcript Sources
        </h3>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setCreating(v => !v)} data-testid="button-new-source">
          <Plus className="w-3 h-3 mr-1" /> New Source
        </Button>
      </div>

      {creating && (
        <div className="flex gap-2 items-center">
          <Input
            className="h-7 text-xs"
            placeholder="Source name (e.g. ChatGPT, Claude, Work)"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && newName.trim()) createMutation.mutate(newName.trim()); }}
            autoFocus
            data-testid="input-new-source-name"
          />
          <Button size="sm" className="h-7 text-xs" onClick={() => newName.trim() && createMutation.mutate(newName.trim())} disabled={createMutation.isPending} data-testid="button-create-source">
            Create
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setCreating(false)}>
            <X className="w-3 h-3" />
          </Button>
        </div>
      )}

      {isLoading && <Skeleton className="h-12 w-full" />}

      {!isLoading && sources.length === 0 && (
        <p className="text-xs text-muted-foreground">No transcript sources yet. Create one to upload and scan external conversation files.</p>
      )}

      <div className="space-y-2">
        {sources.map((src: any) => {
          const report = src.latestReport;
          const isExpanded = expandedSlug === src.slug;
          const showReport = expandedReport === src.slug && report;
          return (
            <div key={src.slug} className="rounded border border-border bg-background p-3 space-y-2" data-testid={`card-source-${src.slug}`}>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
                  onClick={() => setExpandedSlug(isExpanded ? null : src.slug)}
                  data-testid={`button-expand-source-${src.slug}`}
                >
                  {isExpanded ? <ChevronDown className="w-3 h-3 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
                  <span className="font-medium text-xs truncate">{src.displayName}</span>
                  <Badge variant="secondary" className="text-[9px] ml-1">{src.fileCount} file{src.fileCount !== 1 ? "s" : ""}</Badge>
                  {src.lastScannedAt && <Badge variant="outline" className="text-[9px]">scanned</Badge>}
                </button>
                <div className="flex gap-1 flex-shrink-0">
                  <input
                    type="file"
                    multiple
                    accept=".json,.jsonl,.txt,.csv"
                    ref={el => { fileRefs.current[src.slug] = el; }}
                    className="hidden"
                    onChange={e => { if (e.target.files?.length) uploadFiles(src.slug, e.target.files); e.target.value = ""; }}
                    data-testid={`input-upload-${src.slug}`}
                  />
                  <Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={() => fileRefs.current[src.slug]?.click()} data-testid={`button-upload-${src.slug}`}>
                    <Upload className="w-3 h-3 mr-1" /> Upload
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={() => scanMutation.mutate(src.slug)} disabled={scanMutation.isPending || src.fileCount === 0} data-testid={`button-scan-${src.slug}`}>
                    <Cpu className="w-3 h-3 mr-1" /> {scanMutation.isPending ? "Scanning…" : "Scan"}
                  </Button>
                  {report && (
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px]" onClick={() => setExpandedReport(showReport ? null : src.slug)} data-testid={`button-report-${src.slug}`}>
                      <Eye className="w-3 h-3 mr-1" /> Report
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px] text-destructive" onClick={() => deleteMutation.mutate(src.slug)} data-testid={`button-delete-source-${src.slug}`}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>

              {showReport && report && (
                <div className="border-t border-border pt-2 space-y-2">
                  <div className="flex gap-2 items-center flex-wrap">
                    <span className="text-[10px] text-muted-foreground">{report.messageCount} messages scanned</span>
                    {report.peakMetricName && (
                      <Badge variant="outline" className={`text-[9px] ${METRIC_COLORS[report.peakMetricName] || ""}`}>
                        peak: {report.peakMetricName} {(report.peakMetric * 100).toFixed(0)}%
                      </Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { key: "CM", val: report.avgCm },
                      { key: "DA", val: report.avgDa },
                      { key: "DRIFT", val: report.avgDrift },
                      { key: "DVG", val: report.avgDvg },
                      { key: "INT", val: report.avgInt },
                      { key: "TBF", val: report.avgTbf },
                    ].map(({ key, val }) => {
                      const label = metricLabels[key]?.label ?? key;
                      return (
                      <div key={key} className="text-center p-1.5 rounded bg-card border border-border">
                        <p className={`font-mono font-bold text-[10px] ${METRIC_COLORS[key]}`}>{key}</p>
                        <p className="text-[9px] text-muted-foreground">{label}</p>
                        <p className="font-mono text-xs">{((val || 0) * 100).toFixed(1)}%</p>
                        <div className="w-full bg-muted rounded-full h-1 mt-1">
                          <div className="bg-primary rounded-full h-1" style={{ width: `${(val || 0) * 100}%` }} />
                        </div>
                      </div>
                      );
                    })}
                  </div>
                  {report.directivesFired && Object.keys(report.directivesFired).length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground font-medium">Directives fired:</p>
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(report.directivesFired as Record<string, number>).map(([dir, count]) => (
                          <Badge key={dir} variant="secondary" className="text-[9px]">{dir} ×{count}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {report.topSnippets && (report.topSnippets as any[]).length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground font-medium">Top flagged snippets:</p>
                      {(report.topSnippets as any[]).slice(0, 3).map((s: any, i: number) => (
                        <div key={i} className="text-[9px] bg-muted rounded p-1.5 font-mono leading-relaxed">
                          <span className="text-muted-foreground">[{s.file}] peak={((s.peak || 0) * 100).toFixed(0)}%</span>
                          <br />
                          {s.text}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {isExpanded && !showReport && (
                <p className="text-[10px] text-muted-foreground">
                  {src.fileCount === 0 ? "Upload files to begin." : report ? "Scan complete. Click Report to view results." : "Files ready. Click Scan to generate EDCM report."}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EdcmTab() {
  const { persona } = usePersona();
  const METRIC_LABELS = PERSONA_METRIC_LABELS[persona] ?? DEFAULT_METRIC_LABELS;
  const { data: snapshots = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/edcm/snapshots"],
    refetchInterval: 10000,
  });

  const latest = snapshots[0];
  const ptca = latest?.ptcaState as any;

  const { data: engineReport } = useQuery<any>({
    queryKey: ["/api/a0p/events"],
    refetchInterval: 10000,
    select: (data: any[]) => {
      if (!data || data.length === 0) return null;
      const last = data[0];
      return last?.payload;
    },
  });

  const reportMetrics = engineReport?.edcmMetrics;
  const reportAlerts = engineReport?.alerts;
  const liveSentinelCtx = engineReport?.sentinelContext || engineReport?.sentinel_context;

  return (
    <ScrollArea className="h-full px-3 py-3">
      <div className="space-y-4 pb-4">

        <TranscriptSourcesSection />

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Brain className="w-4 h-4 text-purple-400" />
              EDCM Metric Families
            </h3>
            <Badge variant="secondary" className="text-[9px] font-mono" data-testid="badge-build-version">
              {`v1.0.2-S9`}
            </Badge>
          </div>

          {!latest && !reportMetrics ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">No EDCM evaluations yet. Run a process through the engine to generate metrics.</p>
              <div className="grid grid-cols-3 gap-2 text-xs">
                {Object.entries(METRIC_LABELS).map(([key, info]) => (
                  <div key={key} className="text-center p-2 rounded bg-background">
                    <p className="font-mono font-bold text-muted-foreground">{key}</p>
                    <p className="text-[9px] text-muted-foreground">{info.label}</p>
                    <p className="font-mono text-muted-foreground">--</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {reportMetrics ? (
                Object.entries(reportMetrics as Record<string, number>).map(([key, val]) => {
                  const metricVal = typeof val === "object" ? (val as any).value ?? val : val;
                  const evidence = typeof val === "object" ? ((val as any).evidence || []) : [];
                  return (
                    <MetricRow
                      key={key}
                      metricKey={key}
                      value={typeof metricVal === "number" ? metricVal : 0}
                      evidence={evidence}
                    />
                  );
                })
              ) : (
                Object.entries(METRIC_LABELS).map(([key]) => (
                  <MetricRow key={key} metricKey={key} value={0} evidence={[]} />
                ))
              )}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            80/20 Alert Status
          </h3>
          <div className="text-[10px] text-muted-foreground mb-3">
            TRIGGER (HIGH) at ≥0.80 | CLEAR (LOW) at ≤0.20 | Hysteresis band (0.20, 0.80)
          </div>
          <div className="space-y-1.5">
            {Object.entries(ALERT_NAMES).map(([metric, alertName]) => {
              const val = reportMetrics ? (typeof reportMetrics[metric] === "object" ? (reportMetrics[metric] as any).value : reportMetrics[metric]) : null;
              const numVal = typeof val === "number" ? val : 0;
              const alert = alertColor(val != null ? numVal : 0.5);
              return (
                <div key={metric} className="flex items-center justify-between gap-2 text-xs" data-testid={`alert-row-${metric}`}>
                  <div className="flex items-center gap-2">
                    <span className={cn("w-2 h-2 rounded-full flex-shrink-0",
                      val == null ? "bg-muted-foreground" : numVal >= 0.80 ? "bg-red-500" : numVal <= 0.20 ? "bg-green-500" : "bg-amber-500"
                    )} />
                    <span className="font-mono text-[10px]">{alertName}</span>
                  </div>
                  <span className={cn("font-mono text-[10px]", val != null ? alert.text : "text-muted-foreground")}>
                    {val != null ? `${numVal.toFixed(3)} → ${alert.label}` : "no data"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {latest && (
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <Brain className="w-4 h-4 text-purple-400" />
              Disposition & Operators
            </h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-muted-foreground">Decision</span>
                  <p className="font-mono font-bold" data-testid="text-edcm-decision">
                    {latest.decision}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">BONE Delta</span>
                  <p className="font-mono" data-testid="text-bone-delta">
                    {latest.deltaBone?.toFixed(4)}
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <h4 className="text-xs font-medium text-muted-foreground">Grok Operator Vector</h4>
                <OperatorBar vec={latest.operatorGrok} color="emerald" />
                <h4 className="text-xs font-medium text-muted-foreground">Gemini Operator Vector</h4>
                <OperatorBar vec={latest.operatorGemini} color="blue" />
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="text-center p-2 rounded bg-background">
                  <p className="text-muted-foreground">Grok Align</p>
                  <p className={cn("font-mono font-bold", (latest.deltaAlignGrok || 0) > 0.25 ? "text-red-400" : "text-green-400")}>
                    {latest.deltaAlignGrok?.toFixed(4)}
                  </p>
                </div>
                <div className="text-center p-2 rounded bg-background">
                  <p className="text-muted-foreground">Gemini Align</p>
                  <p className={cn("font-mono font-bold", (latest.deltaAlignGemini || 0) > 0.25 ? "text-red-400" : "text-green-400")}>
                    {latest.deltaAlignGemini?.toFixed(4)}
                  </p>
                </div>
                <div className="text-center p-2 rounded bg-background">
                  <p className="text-muted-foreground">PTCA Energy</p>
                  <p className="font-mono font-bold" data-testid="text-ptca-energy">
                    {ptca?.energy?.toFixed(4) || "--"}
                  </p>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                <p>Thresholds: Merge ≤0.18 | Softfork ≤0.30 | Fork &gt;0.30</p>
                <p>Align Risk: &gt;0.25 | PCNA: 53-node circular | PTCA: Euler dt=0.01</p>
              </div>
            </div>
          </div>
        )}

        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <Zap className="w-4 h-4 text-yellow-400" />
            PTCA Tensor
          </h3>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-muted-foreground">Axes</span>
              <p className="font-mono" data-testid="text-ptca-axes">53 × 11 × 8 × 7</p>
            </div>
            <div>
              <span className="text-muted-foreground">Geometry</span>
              <p className="font-mono">Heptagram 6+1</p>
            </div>
            <div>
              <span className="text-muted-foreground">prime_node</span>
              <p className="font-mono text-[10px]">53 seeds (first 53 primes)</p>
            </div>
            <div>
              <span className="text-muted-foreground">sentinel</span>
              <p className="font-mono text-[10px]">9 channels (S1-S9)</p>
            </div>
            <div>
              <span className="text-muted-foreground">phase</span>
              <p className="font-mono text-[10px]">8 (reserved v2 inter-group)</p>
            </div>
            <div>
              <span className="text-muted-foreground">hept</span>
              <p className="font-mono text-[10px]">7 (6 ring + 1 Z hub)</p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            <div className="text-center p-2 rounded bg-background">
              <p className="text-muted-foreground">α (alpha)</p>
              <p className="font-mono font-bold">0.10</p>
            </div>
            <div className="text-center p-2 rounded bg-background">
              <p className="text-muted-foreground">β (beta)</p>
              <p className="font-mono font-bold">0.20</p>
            </div>
            <div className="text-center p-2 rounded bg-background">
              <p className="text-muted-foreground">γ (gamma)</p>
              <p className="font-mono font-bold">0.10</p>
            </div>
          </div>
          {ptca && (
            <>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="text-center p-2 rounded bg-background">
                  <p className="text-muted-foreground">Heptagram Energy</p>
                  <p className="font-mono font-bold" data-testid="text-heptagram-energy">
                    {ptca.heptagramEnergy?.toFixed(4) || "--"}
                  </p>
                </div>
                <div className="text-center p-2 rounded bg-background">
                  <p className="text-muted-foreground">Total Energy</p>
                  <p className="font-mono font-bold" data-testid="text-total-energy">
                    {ptca.energy?.toFixed(4) || "--"}
                  </p>
                </div>
              </div>
              {ptca.phaseEnergies && (
                <div className="mt-3">
                  <p className="text-[10px] text-muted-foreground mb-1">Phase Energies (8 phases, reserved v2)</p>
                  <div className="flex gap-1">
                    {(ptca.phaseEnergies as number[]).map((e: number, i: number) => (
                      <div key={i} className="flex-1 text-center">
                        <div className="h-8 bg-background rounded relative overflow-hidden" data-testid={`phase-energy-bar-${i}`}>
                          <div
                            className="absolute bottom-0 left-0 right-0 bg-purple-500/40 rounded-b"
                            style={{ height: `${Math.min(100, Math.max(5, e * 500))}%` }}
                          />
                        </div>
                        <span className="text-[8px] font-mono text-muted-foreground">P{i}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {ptca.sentinelIndex && (
                <div className="mt-3">
                  <p className="text-[10px] text-muted-foreground mb-1">Sentinel Channel Index</p>
                  <div className="grid grid-cols-3 gap-1 text-[9px]">
                    {Object.entries(ptca.sentinelIndex as Record<string, string>).map(([idx, name]) => (
                      <div key={idx} className="font-mono text-muted-foreground" data-testid={`sentinel-idx-${idx}`}>
                        <span className="text-purple-400">{idx}</span>: {name}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-400" />
            Sentinel Context
          </h3>
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">S4 Window</span>
              <span className="font-mono" data-testid="text-s4-window">
                {liveSentinelCtx?.S4_context ? `${liveSentinelCtx.S4_context.window?.type || "turns"} / W=${liveSentinelCtx.S4_context.window?.W || 32}` : "turns / W=32"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">S4 Retrieval</span>
              <span className="font-mono">{liveSentinelCtx?.S4_context?.retrieval_mode || "none"}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">S4 Hygiene</span>
              <span className="font-mono">strip_secrets=true, redact_keys=true</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">S5 Identity</span>
              <span className="font-mono">
                {liveSentinelCtx?.S5_identity ? `actor_map ${liveSentinelCtx.S5_identity.actor_map_version} (conf: ${liveSentinelCtx.S5_identity.confidence})` : "actor_map v1 (conf: 0.98)"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">S6 Memory</span>
              <span className="font-mono">
                {liveSentinelCtx?.S6_memory ? `store=${liveSentinelCtx.S6_memory.store_allowed}, retention=${liveSentinelCtx.S6_memory.retention}` : "store=false, retention=session"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">S7 Risk</span>
              <span className="font-mono" data-testid="text-s7-risk">
                {liveSentinelCtx?.S7_risk ? `score=${liveSentinelCtx.S7_risk.score}, flags=[${(liveSentinelCtx.S7_risk.flags || []).join(",")}]` : "score=0.12, flags=[]"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">S8 Audit</span>
              <span className="font-mono">
                {liveSentinelCtx?.S8_audit ? `${liveSentinelCtx.S8_audit.evidence_events?.length || 0} events logged` : "evidence logged"}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4 text-green-400" />
            EDCMBONE Report
          </h3>
          <div className="text-[10px] text-muted-foreground mb-2">
            Minimal canonical skeleton for EDCM evaluation + reporting (v1.0.2-S9 frozen format)
          </div>
          <div className="bg-background rounded p-3 font-mono text-[9px] text-muted-foreground whitespace-pre-wrap max-h-48 overflow-auto" data-testid="text-edcmbone-report">
{(() => {
  const mv = (key: string) => {
    const m = reportMetrics?.[key];
    if (m == null) return "0.000";
    return (typeof m === "object" ? (m as any).value : m).toFixed(3);
  };
  return `{
  "edcmbone": {
    "thread_id": "${latest?.taskId || "thr_..."}",
    "used_context": {
      "window": {"type":"turns","W":32},
      "retrieval": {"mode":"none","sources":[],"top_k":0},
      "hygiene": {"strip_secrets":true,"redact_keys":true}
    },
    "metrics": {
      "CM":    {"value": ${mv("CM")}},
      "DA":    {"value": ${mv("DA")}},
      "DRIFT": {"value": ${mv("DRIFT")}},
      "DVG":   {"value": ${mv("DVG")}},
      "INT":   {"value": ${mv("INT")}},
      "TBF":   {"value": ${mv("TBF")}}
    },
    "alerts": [],
    "recommendations": [],
    "snapshot_id": "snap_...",
    "provenance": {"build":"v1.0.2-S9"}
  }
}`;
})()}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold text-sm mb-3">EDCM History</h3>
          <div className="space-y-2">
            {isLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : snapshots.length === 0 ? (
              <p className="text-xs text-muted-foreground">No history</p>
            ) : (
              snapshots.slice(0, 15).map((s: any) => (
                <div key={s.id} className="flex items-center justify-between text-xs border-b border-border pb-1 last:border-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-[10px]">
                      {s.decision}
                    </Badge>
                    <span className="font-mono">d={s.deltaBone?.toFixed(3)}</span>
                  </div>
                  <span className="text-muted-foreground text-[10px]">
                    {new Date(s.createdAt).toLocaleTimeString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}

function OperatorBar({ vec, color }: { vec: any; color: string }) {
  if (!vec) return null;
  const classes = ["P", "K", "Q", "T", "S"] as const;
  const colorMap: Record<string, string> = {
    emerald: "bg-emerald-500",
    blue: "bg-blue-500",
    purple: "bg-purple-500",
  };
  return (
    <div className="flex gap-1 items-end h-8">
      {classes.map((c) => {
        const val = Math.abs(vec[c] || 0);
        const pct = Math.max(val * 100, 2);
        return (
          <div key={c} className="flex-1 flex flex-col items-center gap-0.5">
            <div
              className={cn("w-full rounded-t", colorMap[color] || "bg-primary")}
              style={{ height: `${pct}%` }}
            />
            <span className="text-[9px] text-muted-foreground">{c}</span>
          </div>
        );
      })}
    </div>
  );
}

const AI_PROVIDERS = [
  { id: "openai", label: "OpenAI", placeholder: "sk-..." },
  { id: "anthropic", label: "Anthropic", placeholder: "sk-ant-..." },
  { id: "mistral", label: "Mistral", placeholder: "..." },
  { id: "cohere", label: "Cohere", placeholder: "..." },
  { id: "perplexity", label: "Perplexity", placeholder: "pplx-..." },
] as const;

interface CustomToolData {
  id: number;
  userId: string;
  name: string;
  description: string;
  parametersSchema: any;
  targetModels: string[] | null;
  handlerType: string;
  handlerCode: string;
  enabled: boolean;
  createdAt: string;
}

const AVAILABLE_MODELS = ["gemini", "grok", "agent", "synthesis"];
const HANDLER_TYPES = [
  { value: "webhook", label: "Webhook (POST URL)" },
  { value: "javascript", label: "JavaScript (eval)" },
  { value: "template", label: "Template ({{vars}})" },
];

function MemoryTab({ orientation, isVertical }: SliderOrientationProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputNodeRef = { current: null as HTMLInputElement | null };
  const [editingSeed, setEditingSeed] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [importSeedIndex, setImportSeedIndex] = useState<number | null>(null);
  const [importText, setImportText] = useState("");

  const { data: memoryState, isLoading } = useQuery<{
    seeds: Array<{
      seedIndex: number;
      label: string;
      summary: string;
      originalSummary: string;
      pinned: boolean;
      enabled: boolean;
      weight: number;
      ptcaValues: number[];
      pcnaWeights: number[];
      sentinelPassCount: number;
      sentinelFailCount: number;
      lastSentinelStatus: string | null;
    }>;
    projectionIn: number[][] | null;
    projectionOut: number[][] | null;
    requestCount: number;
  }>({
    queryKey: ["/api/memory/state"],
    refetchInterval: 10000,
  });

  const { data: driftResults = [] } = useQuery<any[]>({
    queryKey: ["/api/memory/drift"],
    refetchInterval: 30000,
  });

  const { data: memoryHistory = [] } = useQuery<any[]>({
    queryKey: ["/api/memory/history"],
    refetchInterval: 15000,
  });

  const updateSeedMutation = useMutation({
    mutationFn: ({ index, updates }: { index: number; updates: any }) =>
      apiRequest("PATCH", `/api/memory/seeds/${index}`, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/memory/state"] });
      setEditingSeed(null);
    },
  });

  const clearSeedMutation = useMutation({
    mutationFn: (index: number) => apiRequest("POST", `/api/memory/seeds/${index}/clear`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/memory/state"] });
      toast({ title: "Seed cleared" });
    },
  });

  const importSeedMutation = useMutation({
    mutationFn: ({ index, text }: { index: number; text: string }) =>
      apiRequest("POST", `/api/memory/seeds/${index}/import`, { text }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/memory/state"] });
      setImportSeedIndex(null);
      setImportText("");
      toast({ title: "Seed text imported" });
    },
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      const resp = await fetch("/api/memory/export");
      if (!resp.ok) throw new Error("Export failed");
      return resp.json();
    },
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `a0p-memory-identity-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "Memory identity exported" });
    },
    onError: (e: any) => toast({ title: "Export failed", description: e.message, variant: "destructive" }),
  });

  const importMutation = useMutation({
    mutationFn: async (data: any) => {
      const resp = await apiRequest("POST", "/api/memory/import", data);
      return resp;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/memory/state"] });
      queryClient.invalidateQueries({ queryKey: ["/api/memory/seeds"] });
      toast({ title: "Memory identity imported successfully" });
    },
    onError: (e: any) => toast({ title: "Import failed", description: e.message, variant: "destructive" }),
  });

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (!data.seeds || !Array.isArray(data.seeds)) {
          toast({ title: "Invalid file", description: "Expected a memory identity JSON with seeds array", variant: "destructive" });
          return;
        }
        importMutation.mutate(data);
      } catch {
        toast({ title: "Invalid JSON", description: "Could not parse the file as JSON", variant: "destructive" });
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function startEditSeed(seed: any) {
    setEditingSeed(seed.seedIndex);
    setEditLabel(seed.label);
    setEditSummary(seed.summary || "");
  }

  if (isLoading) return <div className="p-4"><Skeleton className="h-40 w-full" /></div>;

  const seeds = memoryState?.seeds || [];
  const driftWarnings = Array.isArray(driftResults) ? driftResults.filter((d: any) => d.driftScore > 0.6) : [];

  return (
    <ScrollArea className="h-full px-3 py-3">
      <div className="space-y-4 pb-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Brain className="w-4 h-4 text-purple-400" />
            Memory Identity
          </h3>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => exportMutation.mutate()}
              disabled={exportMutation.isPending}
              data-testid="button-export-memory"
            >
              <Download className="w-3.5 h-3.5 mr-1" />
              {exportMutation.isPending ? "Exporting..." : "Export"}
            </Button>
            <input
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleImportFile}
              ref={(node) => { if (node) fileInputNodeRef.current = node; }}
              data-testid="input-import-file"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => fileInputNodeRef.current?.click()}
              disabled={importMutation.isPending}
              data-testid="button-import-memory"
            >
              <Upload className="w-3.5 h-3.5 mr-1" />
              {importMutation.isPending ? "Importing..." : "Import"}
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
            <h4 className="font-semibold text-sm">11 External Memory Seeds</h4>
            <Badge variant="secondary" className="text-[9px] font-mono" data-testid="badge-request-count">
              {memoryState?.requestCount ?? 0} requests
            </Badge>
          </div>

          {seeds.length === 0 ? (
            <p className="text-xs text-muted-foreground">No memory seeds initialized yet. Seeds are created automatically on first use.</p>
          ) : (
            <div className="space-y-2">
              {seeds.map((seed) => {
                const totalChecks = seed.sentinelPassCount + seed.sentinelFailCount;
                const passRate = totalChecks > 0 ? (seed.sentinelPassCount / totalChecks * 100).toFixed(0) : "--";
                const ptcaMagnitude = seed.ptcaValues.length > 0
                  ? Math.sqrt(seed.ptcaValues.reduce((s, v) => s + v * v, 0)).toFixed(2)
                  : "0.00";
                const hasDrift = driftWarnings.some((d: any) => d.seedIndex === seed.seedIndex);
                const isEditing = editingSeed === seed.seedIndex;
                const isImporting = importSeedIndex === seed.seedIndex;

                return (
                  <div
                    key={seed.seedIndex}
                    className={cn(
                      "rounded-md border p-2.5 space-y-1.5",
                      !seed.enabled && "opacity-50",
                      hasDrift ? "border-amber-500/50" : "border-border"
                    )}
                    data-testid={`card-seed-${seed.seedIndex}`}
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Badge variant="secondary" className="text-[9px] font-mono flex-shrink-0">
                          {seed.seedIndex}
                        </Badge>
                        {isEditing ? (
                          <Input
                            value={editLabel}
                            onChange={(e) => setEditLabel(e.target.value)}
                            className="text-xs h-7 flex-1"
                            data-testid={`input-edit-label-${seed.seedIndex}`}
                          />
                        ) : (
                          <span className="text-xs font-medium truncate" data-testid={`text-seed-label-${seed.seedIndex}`}>
                            {seed.label}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0 flex-wrap">
                        {hasDrift && (
                          <Badge variant="secondary" className="text-[9px] bg-amber-500/20 text-amber-400">DRIFT</Badge>
                        )}
                        <Switch
                          checked={seed.pinned}
                          onCheckedChange={(pinned) => updateSeedMutation.mutate({ index: seed.seedIndex, updates: { pinned } })}
                          data-testid={`toggle-pin-${seed.seedIndex}`}
                        />
                        <span className="text-[9px] text-muted-foreground">Pin</span>
                        <Switch
                          checked={seed.enabled}
                          onCheckedChange={(enabled) => updateSeedMutation.mutate({ index: seed.seedIndex, updates: { enabled } })}
                          data-testid={`toggle-enable-${seed.seedIndex}`}
                        />
                      </div>
                    </div>

                    {isEditing ? (
                      <div className="space-y-1.5">
                        <Textarea
                          value={editSummary}
                          onChange={(e) => setEditSummary(e.target.value.slice(0, 500))}
                          className="text-[10px] font-mono min-h-[60px]"
                          data-testid={`input-edit-summary-${seed.seedIndex}`}
                        />
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[9px] text-muted-foreground">{editSummary.length}/500</span>
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" onClick={() => setEditingSeed(null)} data-testid={`button-cancel-edit-${seed.seedIndex}`}>
                              <X className="w-3 h-3 mr-1" />Cancel
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => updateSeedMutation.mutate({ index: seed.seedIndex, updates: { label: editLabel, summary: editSummary } })}
                              disabled={updateSeedMutation.isPending}
                              data-testid={`button-save-edit-${seed.seedIndex}`}
                            >
                              <Check className="w-3 h-3 mr-1" />Save
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p
                        className="text-[10px] text-muted-foreground cursor-pointer"
                        onClick={() => startEditSeed(seed)}
                        data-testid={`text-seed-summary-${seed.seedIndex}`}
                      >
                        {seed.summary || "(empty — click to edit)"}
                      </p>
                    )}

                    <div className={cn(
                      isVertical ? "flex flex-col items-center gap-1" : "flex items-center gap-2"
                    )}>
                      <span className="text-[10px] text-muted-foreground flex-shrink-0">Weight</span>
                      <Slider
                        value={[seed.weight]}
                        onValueChange={([val]) => updateSeedMutation.mutate({ index: seed.seedIndex, updates: { weight: val } })}
                        min={0}
                        max={2}
                        step={0.1}
                        orientation={orientation}
                        className={cn(isVertical ? "h-[120px]" : "flex-1")}
                        data-testid={`slider-weight-${seed.seedIndex}`}
                      />
                      <span className="text-[10px] font-mono text-right">{seed.weight.toFixed(1)}</span>
                    </div>

                    <div className="w-full h-1.5 bg-background rounded-full overflow-hidden">
                      <div
                        className="h-full bg-purple-500/60 rounded-full transition-all"
                        style={{ width: `${Math.min(100, parseFloat(ptcaMagnitude) * 10)}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-3 text-[9px] text-muted-foreground font-mono flex-wrap">
                        <span>mag={ptcaMagnitude}</span>
                        <span>sentinel={passRate}%</span>
                        <span>pass={seed.sentinelPassCount} fail={seed.sentinelFailCount}</span>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button size="sm" variant="ghost" onClick={() => startEditSeed(seed)} data-testid={`button-edit-seed-${seed.seedIndex}`}>
                          <FileText className="w-3 h-3" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { setImportSeedIndex(seed.seedIndex); setImportText(""); }} data-testid={`button-import-seed-${seed.seedIndex}`}>
                          <Upload className="w-3 h-3" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => clearSeedMutation.mutate(seed.seedIndex)} disabled={clearSeedMutation.isPending} data-testid={`button-clear-seed-${seed.seedIndex}`}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>

                    {isImporting && (
                      <div className="space-y-1.5 pt-1 border-t border-border">
                        <Textarea
                          value={importText}
                          onChange={(e) => setImportText(e.target.value)}
                          placeholder="Paste text to import into this seed..."
                          className="text-[10px] font-mono min-h-[60px]"
                          data-testid={`input-import-text-${seed.seedIndex}`}
                        />
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="outline" onClick={() => setImportSeedIndex(null)}>Cancel</Button>
                          <Button
                            size="sm"
                            onClick={() => importSeedMutation.mutate({ index: seed.seedIndex, text: importText })}
                            disabled={importSeedMutation.isPending || !importText.trim()}
                            data-testid={`button-confirm-import-${seed.seedIndex}`}
                          >
                            Import
                          </Button>
                        </div>
                      </div>
                    )}

                    {hasDrift && (
                      <div className="flex items-center gap-2 pt-1 border-t border-amber-500/30">
                        <AlertTriangle className="w-3 h-3 text-amber-400 flex-shrink-0" />
                        <span className="text-[9px] text-amber-400 flex-1">Semantic drift detected</span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateSeedMutation.mutate({ index: seed.seedIndex, updates: { pinned: true } })}
                          data-testid={`button-repin-${seed.seedIndex}`}
                        >
                          Re-pin
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-400" />
            Sentinel Audit
          </h4>
          {seeds.length === 0 ? (
            <p className="text-xs text-muted-foreground">No sentinel data.</p>
          ) : (
            <div className="space-y-1.5">
              {seeds.map((seed) => {
                const total = seed.sentinelPassCount + seed.sentinelFailCount;
                const pRate = total > 0 ? (seed.sentinelPassCount / total) * 100 : 100;
                return (
                  <div key={seed.seedIndex} className="flex items-center gap-2 text-xs" data-testid={`sentinel-audit-${seed.seedIndex}`}>
                    <span className="font-mono w-4 text-muted-foreground flex-shrink-0">{seed.seedIndex}</span>
                    <span className="w-24 truncate text-muted-foreground">{seed.label}</span>
                    <div className="flex-1 h-2 bg-background rounded-full overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all", pRate > 90 ? "bg-green-500" : pRate > 70 ? "bg-amber-500" : "bg-red-500")}
                        style={{ width: `${pRate}%` }}
                      />
                    </div>
                    <span className="font-mono text-[9px] w-12 text-right">{pRate.toFixed(0)}%</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {driftWarnings.length > 0 && (
          <div className="rounded-lg border border-amber-500/50 bg-card p-4">
            <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              Drift Warnings
            </h4>
            <div className="space-y-1.5">
              {driftWarnings.map((d: any) => (
                <div key={d.seedIndex} className="flex items-center justify-between gap-2 text-xs" data-testid={`drift-warning-${d.seedIndex}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant="secondary" className="text-[9px] bg-amber-500/20 text-amber-400">{d.seedIndex}</Badge>
                    <span className="truncate text-muted-foreground">{d.label || `Seed ${d.seedIndex}`}</span>
                  </div>
                  <span className="font-mono text-amber-400 flex-shrink-0">DRIFT={d.driftScore?.toFixed(3)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-lg border border-border bg-card p-4">
          <h4 className="font-semibold text-sm mb-2">Projection Heatmaps</h4>
          <div className="space-y-3">
            <div>
              <span className="text-[10px] text-muted-foreground">Projection IN (11 seeds to 53 working nodes)</span>
              {memoryState?.projectionIn ? (
                <div className="mt-1 flex gap-px" data-testid="heatmap-projection-in">
                  {memoryState.projectionIn.map((row, ri) => (
                    <div key={ri} className="flex flex-col gap-px flex-1">
                      {row.slice(0, 53).map((val, ci) => {
                        const absVal = Math.abs(val);
                        const color = val >= 0
                          ? `rgba(147, 51, 234, ${Math.min(1, absVal * 5)})`
                          : `rgba(239, 68, 68, ${Math.min(1, absVal * 5)})`;
                        return (
                          <div
                            key={ci}
                            className="h-[3px] rounded-sm"
                            style={{ backgroundColor: color }}
                            title={`[${ri},${ci}] = ${val.toFixed(4)}`}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="font-mono text-xs mt-1" data-testid="text-projection-in-status">Not initialized</p>
              )}
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground">Projection OUT (53 working nodes to 11 seeds)</span>
              {memoryState?.projectionOut ? (
                <div className="mt-1 flex gap-px" data-testid="heatmap-projection-out">
                  {memoryState.projectionOut.slice(0, 53).map((row, ri) => (
                    <div key={ri} className="flex flex-col gap-px flex-1">
                      {row.map((val, ci) => {
                        const absVal = Math.abs(val);
                        const color = val >= 0
                          ? `rgba(59, 130, 246, ${Math.min(1, absVal * 5)})`
                          : `rgba(239, 68, 68, ${Math.min(1, absVal * 5)})`;
                        return (
                          <div
                            key={ci}
                            className="h-[3px] rounded-sm"
                            style={{ backgroundColor: color }}
                            title={`[${ri},${ci}] = ${val.toFixed(4)}`}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="font-mono text-xs mt-1" data-testid="text-projection-out-status">Not initialized</p>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h4 className="font-semibold text-sm mb-2">Memory Snapshot History</h4>
          {memoryHistory.length === 0 ? (
            <p className="text-xs text-muted-foreground">No snapshots yet. Snapshots are saved every 10 requests.</p>
          ) : (
            <div className="space-y-1.5">
              {memoryHistory.slice(0, 10).map((snap: any) => (
                <div key={snap.id} className="flex items-center justify-between gap-2 text-xs" data-testid={`snapshot-${snap.id}`}>
                  <span className="font-mono text-muted-foreground">#{snap.id}</span>
                  <span className="font-mono">req={snap.requestCount}</span>
                  <span className="text-muted-foreground text-[10px]">{new Date(snap.createdAt).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ScrollArea>
  );
}

const SUBSYSTEM_PARAMS: Record<string, { label: string; params: { key: string; label: string; min: number; max: number; step: number; default: number }[] }> = {
  bandit: {
    label: "Multi-Armed Bandit",
    params: [
      { key: "C", label: "Exploration (C)", min: 0, max: 5, step: 0.1, default: 1.414 },
      { key: "lambda", label: "EMA Decay (lambda)", min: 0.5, max: 1, step: 0.01, default: 0.95 },
      { key: "epsilon", label: "Cold Start Epsilon", min: 0, max: 1, step: 0.05, default: 0.3 },
      { key: "cold_start_threshold", label: "Cold Start Pulls", min: 1, max: 20, step: 1, default: 5 },
    ],
  },
  edcm_directives: {
    label: "EDCM Directives",
    params: [
      { key: "default_threshold", label: "Default Threshold", min: 0, max: 1, step: 0.05, default: 0.8 },
    ],
  },
  memory_injection: {
    label: "Memory Injection",
    params: [
      { key: "alpha", label: "Learning Rate (alpha)", min: 0, max: 1, step: 0.01, default: 0.1 },
      { key: "s8_threshold", label: "S8 Risk Threshold", min: 1, max: 200, step: 1, default: 50 },
      { key: "s9_threshold", label: "S9 Coherence Min", min: -1, max: 0, step: 0.05, default: -0.5 },
      { key: "drift_check_interval", label: "Drift Check Interval (reqs)", min: 10, max: 200, step: 10, default: 50 },
    ],
  },
  heartbeat: {
    label: "Heartbeat Scheduler",
    params: [
      { key: "tickIntervalMs", label: "Tick Interval (ms)", min: 5000, max: 300000, step: 1000, default: 30000 },
    ],
  },
  synthesis: {
    label: "Dual-Model Synthesis",
    params: [
      { key: "timeoutMs", label: "Timeout (ms)", min: 5000, max: 120000, step: 1000, default: 30000 },
    ],
  },
  custom_tools: { label: "Custom Tools", params: [] },
  logging: { label: "Logging", params: [] },
};

const STAGE_ROLES = ["generate", "review", "refine", "synthesize"];
const STAGE_MODELS = ["gemini", "grok", "hub"];
const STAGE_INPUTS = ["user_query", "previous_output", "all_outputs"];

function BrainTab({ orientation, isVertical }: SliderOrientationProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingPreset, setEditingPreset] = useState<any | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formMerge, setFormMerge] = useState("last");
  const [formStages, setFormStages] = useState<any[]>([{ order: 0, model: "gemini", role: "generate", input: "user_query", timeoutMs: 30000, weight: 1.0 }]);

  const { data: brainData, isLoading } = useQuery<{ presets: any[]; activePresetId: string }>({
    queryKey: ["/api/brain/presets"],
    refetchInterval: 10000,
  });

  const presets = brainData?.presets || [];
  const activePresetId = brainData?.activePresetId || "a0_dual";

  const activateMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/brain/presets/${id}/activate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brain/presets"] });
      toast({ title: "Brain preset activated" });
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/brain/presets/${id}/default`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brain/presets"] });
      toast({ title: "Default preset updated" });
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/brain/presets", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brain/presets"] });
      toast({ title: "Preset created" });
      resetForm();
    },
    onError: (e: any) => toast({ title: "Create failed", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: any }) => apiRequest("PATCH", `/api/brain/presets/${id}`, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brain/presets"] });
      toast({ title: "Preset updated" });
      setEditingPreset(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/brain/presets/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brain/presets"] });
      toast({ title: "Preset deleted" });
    },
    onError: (e: any) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const updateWeightsMutation = useMutation({
    mutationFn: (weights: Record<string, number>) => apiRequest("POST", "/api/brain/weights", { weights }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brain/presets"] });
      toast({ title: "Weights updated" });
    },
  });

  function resetForm() {
    setShowNewForm(false);
    setFormName("");
    setFormDesc("");
    setFormMerge("last");
    setFormStages([{ order: 0, model: "gemini", role: "generate", input: "user_query", timeoutMs: 30000, weight: 1.0 }]);
  }

  function addStage() {
    const maxOrder = Math.max(...formStages.map(s => s.order), -1);
    setFormStages([...formStages, { order: maxOrder + 1, model: "gemini", role: "generate", input: "user_query", timeoutMs: 30000, weight: 1.0 }]);
  }

  function removeStage(idx: number) {
    if (formStages.length <= 1) return;
    setFormStages(formStages.filter((_, i) => i !== idx));
  }

  function updateStage(idx: number, key: string, value: any) {
    const updated = [...formStages];
    updated[idx] = { ...updated[idx], [key]: value };
    setFormStages(updated);
  }

  function handleSubmit() {
    if (!formName.trim()) return;
    const weights: Record<string, number> = {};
    for (const s of formStages) {
      if (!weights[s.model]) weights[s.model] = 0;
      weights[s.model] += s.weight;
    }
    const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
    for (const k of Object.keys(weights)) weights[k] = weights[k] / totalWeight;

    createMutation.mutate({
      name: formName.trim(),
      description: formDesc.trim(),
      stages: formStages,
      mergeStrategy: formMerge,
      weights,
      thresholds: { mergeThreshold: 0.18, softforkThreshold: 0.30 },
    });
  }

  function startEditing(preset: any) {
    setEditingPreset({ ...preset });
    setShowNewForm(false);
  }

  if (isLoading) return <div className="p-4"><Skeleton className="h-40 w-full" /></div>;

  const activePreset = presets.find(p => p.id === activePresetId);

  return (
    <ScrollArea className="h-full px-3 py-3">
      <div className="space-y-4 pb-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-primary" />
            Active Brain Pipeline
          </h3>
          {activePreset ? (
            <div className="space-y-3" data-testid="brain-active-preset">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-medium">{activePreset.name}</span>
                  <Badge variant="default" className="text-[9px]">ACTIVE</Badge>
                  {activePreset.isDefault && <Badge variant="secondary" className="text-[9px]">DEFAULT</Badge>}
                </div>
                <Badge variant="secondary" className="text-[9px] font-mono">{activePreset.mergeStrategy}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{activePreset.description}</p>

              <div className="space-y-1.5">
                <span className="text-[10px] text-muted-foreground font-medium">Pipeline Stages</span>
                <div className="flex items-center gap-1 flex-wrap" data-testid="brain-pipeline-visual">
                  {activePreset.stages.map((stage: any, idx: number) => {
                    const prevStage = idx > 0 ? activePreset.stages[idx - 1] : null;
                    const isParallel = prevStage && prevStage.order === stage.order;
                    return (
                      <div key={idx} className="flex items-center gap-1">
                        {idx > 0 && !isParallel && <GitBranch className="w-3 h-3 text-muted-foreground rotate-90" />}
                        {isParallel && <span className="text-[9px] text-muted-foreground">||</span>}
                        <div className={cn(
                          "rounded-md border px-2 py-1 text-[10px] font-mono",
                          stage.model === "gemini" ? "border-blue-500/30 bg-blue-500/10 text-blue-400" :
                          stage.model === "grok" ? "border-orange-500/30 bg-orange-500/10 text-orange-400" :
                          "border-purple-500/30 bg-purple-500/10 text-purple-400"
                        )}>
                          <span className="font-semibold">{stage.model}</span>
                          <span className="text-muted-foreground ml-1">({stage.role})</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {activePreset.weights && Object.keys(activePreset.weights).length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[10px] text-muted-foreground font-medium">Model Weights</span>
                  <div className={cn(isVertical ? "grid grid-cols-2 gap-3" : "space-y-2")}>
                    {Object.entries(activePreset.weights).map(([model, weight]) => (
                      <div key={model} className={cn(
                        isVertical ? "flex flex-col items-center gap-1" : "flex items-center gap-2"
                      )}>
                        <span className={cn("text-[10px] font-mono flex-shrink-0", !isVertical && "w-16")}>{model}</span>
                        <Slider
                          value={[weight as number]}
                          onValueChange={([val]) => {
                            const newWeights = { ...activePreset.weights, [model]: val };
                            updateWeightsMutation.mutate(newWeights);
                          }}
                          min={0}
                          max={1}
                          step={0.05}
                          orientation={orientation}
                          className={cn(isVertical ? "h-[120px]" : "flex-1")}
                          data-testid={`slider-brain-weight-${model}`}
                        />
                        <span className="text-[10px] font-mono">{(weight as number).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div>
                  <span className="text-muted-foreground">Merge Threshold</span>
                  <p className="font-mono">{activePreset.thresholds?.mergeThreshold ?? 0.18}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Softfork Threshold</span>
                  <p className="font-mono">{activePreset.thresholds?.softforkThreshold ?? 0.30}</p>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No active preset. Select one below.</p>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-muted-foreground" />
              All Presets
            </h3>
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setShowNewForm(!showNewForm); setEditingPreset(null); }}
              data-testid="button-new-brain-preset"
            >
              <Plus className="w-3 h-3 mr-1" /> New Preset
            </Button>
          </div>

          {showNewForm && (
            <div className="rounded-md border border-border p-3 mb-3 space-y-2" data-testid="brain-preset-form">
              <Input
                placeholder="Preset name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                data-testid="input-brain-preset-name"
              />
              <Textarea
                placeholder="Description"
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                className="resize-none text-xs"
                rows={2}
                data-testid="input-brain-preset-desc"
              />
              <div className="flex items-center gap-2">
                <Label className="text-[10px]">Merge Strategy</Label>
                <Select value={formMerge} onValueChange={setFormMerge}>
                  <SelectTrigger className="w-32" data-testid="select-brain-merge">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="last">Last Output</SelectItem>
                    <SelectItem value="synthesis">Synthesis</SelectItem>
                    <SelectItem value="weighted">Weighted</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] text-muted-foreground font-medium">Pipeline Stages</span>
                  <Button size="sm" variant="ghost" onClick={addStage} data-testid="button-add-stage">
                    <Plus className="w-3 h-3 mr-1" /> Stage
                  </Button>
                </div>
                {formStages.map((stage, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 flex-wrap" data-testid={`brain-stage-${idx}`}>
                    <Input
                      type="number"
                      value={stage.order}
                      onChange={(e) => updateStage(idx, "order", parseInt(e.target.value) || 0)}
                      className="w-12 text-xs"
                      data-testid={`input-stage-order-${idx}`}
                    />
                    <Select value={stage.model} onValueChange={(v) => updateStage(idx, "model", v)}>
                      <SelectTrigger className="w-20" data-testid={`select-stage-model-${idx}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STAGE_MODELS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={stage.role} onValueChange={(v) => updateStage(idx, "role", v)}>
                      <SelectTrigger className="w-24" data-testid={`select-stage-role-${idx}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STAGE_ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={stage.input} onValueChange={(v) => updateStage(idx, "input", v)}>
                      <SelectTrigger className="w-28" data-testid={`select-stage-input-${idx}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STAGE_INPUTS.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button size="icon" variant="ghost" onClick={() => removeStage(idx)} disabled={formStages.length <= 1} data-testid={`button-remove-stage-${idx}`}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Button size="sm" onClick={handleSubmit} disabled={createMutation.isPending || !formName.trim()} data-testid="button-save-brain-preset">
                  {createMutation.isPending ? "Saving..." : "Save Preset"}
                </Button>
                <Button size="sm" variant="ghost" onClick={resetForm} data-testid="button-cancel-brain-preset">Cancel</Button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {presets.map((preset: any) => {
              const isActive = preset.id === activePresetId;
              const isEditing = editingPreset?.id === preset.id;

              return (
                <div
                  key={preset.id}
                  className={cn("rounded-md border p-2.5 space-y-1.5", isActive ? "border-primary/50" : "border-border")}
                  data-testid={`brain-preset-${preset.id}`}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-medium truncate">{preset.name}</span>
                      {isActive && <Badge variant="default" className="text-[9px]">ACTIVE</Badge>}
                      {preset.isDefault && <Badge variant="secondary" className="text-[9px]">DEFAULT</Badge>}
                      {preset.builtin && <Badge variant="secondary" className="text-[9px]">Built-in</Badge>}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {!isActive && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => activateMutation.mutate(preset.id)}
                          disabled={activateMutation.isPending}
                          data-testid={`button-activate-brain-${preset.id}`}
                        >
                          <Play className="w-3 h-3 mr-1" /> Activate
                        </Button>
                      )}
                      {!preset.isDefault && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setDefaultMutation.mutate(preset.id)}
                          disabled={setDefaultMutation.isPending}
                          data-testid={`button-default-brain-${preset.id}`}
                        >
                          <Star className="w-3 h-3" />
                        </Button>
                      )}
                      {!preset.builtin && (
                        <>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => isEditing ? setEditingPreset(null) : startEditing(preset)}
                            data-testid={`button-edit-brain-${preset.id}`}
                          >
                            <Settings className="w-3 h-3" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => deleteMutation.mutate(preset.id)}
                            disabled={deleteMutation.isPending}
                            data-testid={`button-delete-brain-${preset.id}`}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground">{preset.description}</p>
                  <div className="flex items-center gap-1 flex-wrap">
                    {preset.stages?.map((stage: any, idx: number) => {
                      const prevStage = idx > 0 ? preset.stages[idx - 1] : null;
                      const isParallel = prevStage && prevStage.order === stage.order;
                      return (
                        <div key={idx} className="flex items-center gap-0.5">
                          {idx > 0 && !isParallel && <span className="text-[9px] text-muted-foreground mx-0.5">&rarr;</span>}
                          {isParallel && <span className="text-[9px] text-muted-foreground mx-0.5">||</span>}
                          <span className={cn(
                            "text-[9px] font-mono px-1 py-0.5 rounded",
                            stage.model === "gemini" ? "bg-blue-500/10 text-blue-400" :
                            stage.model === "grok" ? "bg-orange-500/10 text-orange-400" :
                            "bg-purple-500/10 text-purple-400"
                          )}>
                            {stage.model}:{stage.role}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {isEditing && (
                    <div className="border-t border-border pt-2 mt-2 space-y-2">
                      <Input
                        value={editingPreset.name}
                        onChange={(e) => setEditingPreset({ ...editingPreset, name: e.target.value })}
                        className="text-xs"
                        data-testid="input-edit-brain-name"
                      />
                      <Textarea
                        value={editingPreset.description}
                        onChange={(e) => setEditingPreset({ ...editingPreset, description: e.target.value })}
                        className="resize-none text-xs"
                        rows={2}
                        data-testid="input-edit-brain-desc"
                      />
                      <Button
                        size="sm"
                        onClick={() => updateMutation.mutate({ id: editingPreset.id, updates: { name: editingPreset.name, description: editingPreset.description } })}
                        disabled={updateMutation.isPending}
                        data-testid="button-save-edit-brain"
                      >
                        Save Changes
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}

function PersonaSection() {
  const { persona, setPersona, isPending } = usePersona();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [newUserId, setNewUserId] = useState("");
  const [newUserPersona, setNewUserPersona] = useState<import("@/hooks/use-persona").Persona>("free");
  const [showGrants, setShowGrants] = useState(false);

  const personas: Array<{ id: import("@/hooks/use-persona").Persona; icon: string; label: string }> = [
    { id: "free", icon: "🧭", label: "Explorer" },
    { id: "legal", icon: "⚖️", label: "Legal" },
    { id: "researcher", icon: "🔬", label: "Research" },
    { id: "political", icon: "🏛️", label: "Political" },
  ];

  const { data: grants = {} } = useQuery<Record<string, string>>({
    queryKey: ["/api/persona-grants"],
  });

  const grantMutation = useMutation({
    mutationFn: ({ uid, p }: { uid: string; p: string }) =>
      apiRequest("PATCH", `/api/persona-grants/${encodeURIComponent(uid)}`, { persona: p }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/persona-grants"] });
      setNewUserId("");
      toast({ title: "Grant saved" });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const revokeMutation = useMutation({
    mutationFn: (uid: string) => apiRequest("DELETE", `/api/persona-grants/${encodeURIComponent(uid)}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/persona-grants"] });
      toast({ title: "Grant revoked" });
    },
  });

  const grantEntries = Object.entries(grants);

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-xs flex items-center gap-2 text-muted-foreground uppercase tracking-wide">
          <Settings className="w-3.5 h-3.5" />
          Agent Persona
        </h3>
        <button
          onClick={() => setShowGrants(v => !v)}
          className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          data-testid="button-toggle-grants"
        >
          {showGrants ? "hide grants" : `grants (${grantEntries.length})`}
        </button>
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        {personas.map(({ id, icon, label }) => (
          <button
            key={id}
            data-testid={`persona-btn-${id}`}
            disabled={isPending}
            onClick={() => setPersona(id)}
            className={cn(
              "flex flex-col items-center gap-1 py-2 px-1 rounded-lg border text-[10px] font-medium transition-all active:scale-95",
              persona === id
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary/30"
            )}
          >
            <span className="text-base leading-none">{icon}</span>
            {label}
          </button>
        ))}
      </div>

      {showGrants && (
        <div className="space-y-2 pt-1 border-t border-border">
          <p className="text-[10px] text-muted-foreground">a0 enforces these grants automatically on each login. Configure or let a0 manage them.</p>

          {grantEntries.length > 0 && (
            <div className="space-y-1">
              {grantEntries.map(([uid, p]) => {
                const meta = personas.find(x => x.id === p);
                return (
                  <div key={uid} className="flex items-center gap-2 py-1 px-2 rounded-md bg-muted/30 text-xs" data-testid={`grant-row-${uid}`}>
                    <span className="font-mono text-muted-foreground truncate flex-1 text-[10px]">{uid}</span>
                    <span className="flex items-center gap-1 text-[10px]">
                      <span>{meta?.icon}</span>
                      <span className="font-medium">{meta?.label ?? p}</span>
                    </span>
                    <button
                      onClick={() => revokeMutation.mutate(uid)}
                      disabled={revokeMutation.isPending}
                      className="text-muted-foreground hover:text-destructive transition-colors ml-1"
                      data-testid={`btn-revoke-${uid}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex gap-1.5">
            <Input
              value={newUserId}
              onChange={e => setNewUserId(e.target.value)}
              placeholder="userId (Replit sub)"
              className="h-7 text-[11px] flex-1 font-mono"
              data-testid="input-grant-userid"
            />
            <select
              value={newUserPersona}
              onChange={e => setNewUserPersona(e.target.value as any)}
              className="h-7 text-[11px] rounded-md border border-border bg-background px-1.5"
              data-testid="select-grant-persona"
            >
              {personas.map(p => <option key={p.id} value={p.id}>{p.icon} {p.label}</option>)}
            </select>
            <Button
              size="sm"
              className="h-7 px-2 text-[11px]"
              disabled={!newUserId.trim() || grantMutation.isPending}
              onClick={() => grantMutation.mutate({ uid: newUserId.trim(), p: newUserPersona })}
              data-testid="btn-add-grant"
            >
              Grant
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function SystemTab({ orientation, isVertical }: SliderOrientationProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedSub, setExpandedSub] = useState<string | null>(null);

  const { data: toggles = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/toggles"],
    refetchInterval: 10000,
  });

  const { data: discoveries = [] } = useQuery<any[]>({
    queryKey: ["/api/discoveries"],
    refetchInterval: 10000,
  });

  const updateToggleMutation = useMutation({
    mutationFn: ({ subsystem, enabled, parameters }: { subsystem: string; enabled?: boolean; parameters?: any }) =>
      apiRequest("PATCH", `/api/toggles/${subsystem}`, { enabled, parameters }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/toggles"] });
      toast({ title: "Toggle updated" });
    },
  });

  const promoteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/discoveries/${id}/promote`),
    onSuccess: () => {
      toast({ title: "Discovery promoted to conversation" });
      queryClient.invalidateQueries({ queryKey: ["/api/discoveries"] });
    },
  });

  if (isLoading) return <div className="p-4"><Skeleton className="h-40 w-full" /></div>;

  const toggleMap: Record<string, any> = {};
  for (const t of toggles) {
    toggleMap[t.subsystem] = t;
  }

  const subsystems = Object.keys(SUBSYSTEM_PARAMS);

  return (
    <ScrollArea className="h-full px-3 py-3">
      <div className="space-y-4 pb-4">
        <PersonaSection />
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <Settings className="w-4 h-4 text-muted-foreground" />
            Global System Toggles
          </h3>
          <div className="space-y-2">
            {subsystems.map((sub) => {
              const config = SUBSYSTEM_PARAMS[sub];
              const toggle = toggleMap[sub];
              const isEnabled = toggle?.enabled ?? true;
              const params = (toggle?.parameters || {}) as Record<string, any>;
              const isExpanded = expandedSub === sub;

              return (
                <div key={sub} className="rounded-md border border-border" data-testid={`toggle-subsystem-${sub}`}>
                  <div className="flex items-center justify-between gap-2 p-2.5">
                    <button
                      className="flex items-center gap-2 flex-1 min-w-0 text-left"
                      onClick={() => setExpandedSub(isExpanded ? null : sub)}
                      data-testid={`button-expand-${sub}`}
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      )}
                      <span className="text-xs font-medium truncate">{config.label}</span>
                      <Badge variant="secondary" className="text-[9px] font-mono">{sub}</Badge>
                    </button>
                    <Switch
                      checked={isEnabled}
                      onCheckedChange={(enabled) => updateToggleMutation.mutate({ subsystem: sub, enabled })}
                      data-testid={`toggle-enable-${sub}`}
                    />
                  </div>

                  {isExpanded && config.params.length > 0 && (
                    <div className={cn("px-2.5 pb-2.5 border-t border-border pt-2", isVertical ? "grid grid-cols-2 gap-3" : "space-y-2")}>
                      {config.params.map((p) => {
                        const currentVal = params[p.key] ?? p.default;
                        return (
                          <div key={p.key} className={cn(
                            isVertical ? "flex flex-col items-center gap-1" : "flex items-center gap-2"
                          )}>
                            <span className={cn("text-[10px] text-muted-foreground flex-shrink-0", !isVertical && "w-32")}>{p.label}</span>
                            <Slider
                              value={[currentVal]}
                              onValueChange={([val]) => {
                                const newParams = { ...params, [p.key]: val };
                                updateToggleMutation.mutate({ subsystem: sub, parameters: newParams });
                              }}
                              min={p.min}
                              max={p.max}
                              step={p.step}
                              orientation={orientation}
                              className={cn(isVertical ? "h-[120px]" : "flex-1")}
                              data-testid={`slider-param-${sub}-${p.key}`}
                            />
                            <span className="text-[10px] font-mono text-right">{typeof currentVal === "number" ? currentVal.toFixed(p.step < 1 ? 2 : 0) : currentVal}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            Discovery Drafts
          </h3>
          {discoveries.length === 0 ? (
            <p className="text-xs text-muted-foreground">No discoveries yet. Heartbeat tasks will surface notable findings here.</p>
          ) : (
            <div className="space-y-2">
              {discoveries.slice(0, 20).map((draft: any) => (
                <div
                  key={draft.id}
                  className="rounded-md border border-border p-2.5 space-y-1"
                  data-testid={`discovery-system-${draft.id}`}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs font-medium truncate flex-1">{draft.title}</span>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <Badge variant="secondary" className="text-[9px]">
                        {(draft.relevanceScore * 100).toFixed(0)}%
                      </Badge>
                      {!draft.promotedToConversation ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => promoteMutation.mutate(draft.id)}
                          disabled={promoteMutation.isPending}
                          data-testid={`button-promote-system-${draft.id}`}
                        >
                          Start Conversation
                        </Button>
                      ) : (
                        <Badge variant="default" className="text-[9px]">Promoted</Badge>
                      )}
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate">{draft.summary}</p>
                  <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
                    <span>{draft.sourceTask}</span>
                    <span>{new Date(draft.createdAt).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ScrollArea>
  );
}

function HeartbeatTab({ orientation, isVertical }: SliderOrientationProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const BUILTIN_TASKS = ["transcript_search", "github_search", "ai_social_search", "x_monitor"];

  const [showNewForm, setShowNewForm] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formType, setFormType] = useState("custom");
  const [formWeight, setFormWeight] = useState(1.0);
  const [formInterval, setFormInterval] = useState(300);
  const [formEnabled, setFormEnabled] = useState(true);
  const [formHandlerCode, setFormHandlerCode] = useState("");

  const { data: activityStats } = useQuery<{
    heartbeatRuns: number;
    transcripts: number;
    conversations: number;
    events: number;
    drafts: number;
    promotions: number;
    edcmSnapshots: number;
    memorySnapshots: number;
  }>({
    queryKey: ["/api/heartbeat/stats"],
    refetchInterval: 10000,
  });

  const { data: status } = useQuery<{ running: boolean; tickIntervalMs: number }>({
    queryKey: ["/api/heartbeat/status"],
    refetchInterval: 10000,
  });

  const { data: tasks = [], isLoading: tasksLoading } = useQuery<any[]>({
    queryKey: ["/api/heartbeat/tasks"],
    refetchInterval: 10000,
  });

  const { data: discoveries = [] } = useQuery<any[]>({
    queryKey: ["/api/discoveries"],
    refetchInterval: 10000,
  });

  const createTaskMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/heartbeat/tasks", data),
    onSuccess: () => {
      toast({ title: "Task created" });
      queryClient.invalidateQueries({ queryKey: ["/api/heartbeat/tasks"] });
      resetForm();
    },
    onError: (e: any) => {
      toast({ title: "Create failed", description: e.message, variant: "destructive" });
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: any }) =>
      apiRequest("PATCH", `/api/heartbeat/tasks/${id}`, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/heartbeat/tasks"] });
      if (editingTaskId !== null) {
        setEditingTaskId(null);
        toast({ title: "Task updated" });
      }
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/heartbeat/tasks/${id}`),
    onSuccess: () => {
      toast({ title: "Task deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/heartbeat/tasks"] });
    },
    onError: (e: any) => {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    },
  });

  const runNowMutation = useMutation({
    mutationFn: (name: string) => apiRequest("POST", `/api/heartbeat/tasks/${name}/run`),
    onSuccess: () => {
      toast({ title: "Task executed" });
      queryClient.invalidateQueries({ queryKey: ["/api/heartbeat/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/discoveries"] });
    },
    onError: (e: any) => {
      toast({ title: "Run failed", description: e.message, variant: "destructive" });
    },
  });

  const toggleSchedulerMutation = useMutation({
    mutationFn: (start: boolean) => apiRequest("POST", start ? "/api/heartbeat/start" : "/api/heartbeat/stop"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/heartbeat/status"] });
    },
  });

  const promoteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/discoveries/${id}/promote`),
    onSuccess: () => {
      toast({ title: "Discovery promoted to conversation" });
      queryClient.invalidateQueries({ queryKey: ["/api/discoveries"] });
    },
  });

  function resetForm() {
    setShowNewForm(false);
    setEditingTaskId(null);
    setFormName("");
    setFormDesc("");
    setFormType("custom");
    setFormWeight(1.0);
    setFormInterval(300);
    setFormEnabled(true);
    setFormHandlerCode("");
  }

  function startEditing(task: any) {
    setEditingTaskId(task.id);
    setFormName(task.name);
    setFormDesc(task.description || "");
    setFormType(task.taskType);
    setFormWeight(task.weight);
    setFormInterval(task.intervalSeconds);
    setFormEnabled(task.enabled);
    setFormHandlerCode(task.lastResult?.startsWith("handler:") ? task.lastResult.slice(8) : "");
    setShowNewForm(false);
  }

  function handleSubmit() {
    if (editingTaskId !== null) {
      updateTaskMutation.mutate({
        id: editingTaskId,
        updates: {
          description: formDesc,
          taskType: formType,
          weight: formWeight,
          intervalSeconds: formInterval,
          enabled: formEnabled,
          ...(formType === "custom" ? { handlerCode: formHandlerCode } : {}),
        },
      });
    } else {
      createTaskMutation.mutate({
        name: formName,
        description: formDesc,
        taskType: formType,
        weight: formWeight,
        intervalSeconds: formInterval,
        enabled: formEnabled,
        ...(formType === "custom" ? { handlerCode: formHandlerCode } : {}),
      });
    }
  }

  const totalWeight = tasks.reduce((sum: number, t: any) => sum + (t.enabled ? t.weight : 0), 0);

  const taskForm = (
    <div className="rounded-md border border-border p-3 space-y-3" data-testid="heartbeat-task-form">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h4 className="text-xs font-semibold">{editingTaskId !== null ? "Edit Task" : "New Task"}</h4>
        <Button size="icon" variant="ghost" onClick={resetForm} data-testid="button-cancel-task-form">
          <X className="w-3 h-3" />
        </Button>
      </div>
      {editingTaskId === null && (
        <div>
          <Label className="text-[10px]">Name</Label>
          <Input
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="my_custom_task"
            className="text-xs font-mono mt-0.5"
            data-testid="input-task-name"
          />
        </div>
      )}
      <div>
        <Label className="text-[10px]">Description</Label>
        <Input
          value={formDesc}
          onChange={(e) => setFormDesc(e.target.value)}
          placeholder="What this task does..."
          className="text-xs mt-0.5"
          data-testid="input-task-desc"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[10px]">Task Type</Label>
          <Select value={formType} onValueChange={setFormType}>
            <SelectTrigger className="text-xs mt-0.5" data-testid="select-task-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="custom">Custom</SelectItem>
              <SelectItem value="transcript_search">Transcript Search</SelectItem>
              <SelectItem value="github_search">GitHub Search</SelectItem>
              <SelectItem value="ai_social_search">AI Social Search</SelectItem>
              <SelectItem value="x_monitor">X Monitor</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[10px]">Interval (seconds)</Label>
          <Input
            type="number"
            value={formInterval}
            onChange={(e) => setFormInterval(parseInt(e.target.value) || 300)}
            className="text-xs font-mono mt-0.5"
            data-testid="input-task-interval"
          />
        </div>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[120px]">
          <Label className="text-[10px]">Weight</Label>
          <div className={cn(
            isVertical ? "flex flex-col items-center gap-1 mt-0.5" : "flex items-center gap-2 mt-0.5"
          )}>
            <Slider
              value={[formWeight]}
              onValueChange={([v]) => setFormWeight(v)}
              min={0}
              max={5}
              step={0.1}
              orientation={orientation}
              className={cn(isVertical ? "h-[120px]" : "flex-1")}
              data-testid="slider-task-weight"
            />
            <span className="text-[10px] font-mono text-right">{formWeight.toFixed(1)}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 pt-3">
          <Switch
            checked={formEnabled}
            onCheckedChange={setFormEnabled}
            data-testid="toggle-task-enabled"
          />
          <Label className="text-[10px]">Enabled</Label>
        </div>
      </div>
      {formType === "custom" && (
        <div>
          <Label className="text-[10px]">Handler Code</Label>
          <Textarea
            value={formHandlerCode}
            onChange={(e) => setFormHandlerCode(e.target.value)}
            placeholder="// JavaScript handler code for custom task execution..."
            className="text-xs font-mono mt-0.5 min-h-[80px]"
            data-testid="textarea-handler-code"
          />
        </div>
      )}
      <Button
        size="sm"
        onClick={handleSubmit}
        disabled={(!formName && editingTaskId === null) || createTaskMutation.isPending || updateTaskMutation.isPending}
        className="w-full gap-1"
        data-testid="button-submit-task"
      >
        <Check className="w-3 h-3" />
        {editingTaskId !== null ? "Save Changes" : "Create Task"}
      </Button>
    </div>
  );

  return (
    <ScrollArea className="h-full px-3 py-3">
      <div className="space-y-4 pb-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            Activity Stats
          </h3>
          {activityStats ? (
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Heartbeat Runs", value: activityStats.heartbeatRuns, testId: "stat-heartbeat-runs" },
                { label: "Messages", value: activityStats.transcripts, testId: "stat-transcripts" },
                { label: "Conversations", value: activityStats.conversations, testId: "stat-conversations" },
                { label: "Chain Events", value: activityStats.events, testId: "stat-events" },
                { label: "Discovery Drafts", value: activityStats.drafts, testId: "stat-drafts" },
                { label: "Promotions", value: activityStats.promotions, testId: "stat-promotions" },
                { label: "EDCM Snapshots", value: activityStats.edcmSnapshots, testId: "stat-edcm-snapshots" },
                { label: "Memory Snapshots", value: activityStats.memorySnapshots, testId: "stat-memory-snapshots" },
              ].map((stat) => (
                <div
                  key={stat.testId}
                  className="rounded-md border border-border p-2.5 flex items-center justify-between gap-2"
                  data-testid={stat.testId}
                >
                  <span className="text-[10px] text-muted-foreground">{stat.label}</span>
                  <span className="text-sm font-mono font-bold">{stat.value.toLocaleString()}</span>
                </div>
              ))}
            </div>
          ) : (
            <Skeleton className="h-24 w-full" />
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-400" />
              Heartbeat Scheduler
            </h3>
            <div className="flex items-center gap-2">
              <Badge
                variant={status?.running ? "default" : "secondary"}
                data-testid="status-heartbeat"
              >
                {status?.running ? "RUNNING" : "STOPPED"}
              </Badge>
              <Switch
                checked={status?.running || false}
                onCheckedChange={(checked) => toggleSchedulerMutation.mutate(checked)}
                data-testid="toggle-heartbeat-scheduler"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-muted-foreground">Tick Interval</span>
              <p className="font-mono" data-testid="text-tick-interval">
                {status ? `${(status.tickIntervalMs / 1000).toFixed(0)}s` : "--"}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Active Tasks</span>
              <p className="font-mono" data-testid="text-active-tasks">
                {tasks.filter((t: any) => t.enabled).length} / {tasks.length}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              Task List
            </h3>
            {!showNewForm && editingTaskId === null && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowNewForm(true)}
                className="gap-1"
                data-testid="button-new-task"
              >
                <Plus className="w-3 h-3" />
                New Task
              </Button>
            )}
          </div>
          {(showNewForm || editingTaskId !== null) && taskForm}
          {tasksLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : tasks.length === 0 && !showNewForm ? (
            <p className="text-xs text-muted-foreground">No heartbeat tasks configured.</p>
          ) : (
            <div className="space-y-3 mt-3">
              {tasks.map((task: any) => {
                const isBuiltin = BUILTIN_TASKS.includes(task.name);
                const isEditing = editingTaskId === task.id;
                const weightPct = totalWeight > 0 && task.enabled ? ((task.weight / totalWeight) * 100).toFixed(1) : "0";
                if (isEditing) return null;
                return (
                  <div
                    key={task.id}
                    className="rounded-md border border-border p-3 space-y-2"
                    data-testid={`heartbeat-task-${task.name}`}
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 min-w-0 flex-wrap">
                        <Switch
                          checked={task.enabled}
                          onCheckedChange={(enabled) =>
                            updateTaskMutation.mutate({ id: task.id, updates: { enabled } })
                          }
                          data-testid={`toggle-task-${task.name}`}
                        />
                        <span className="font-mono text-xs font-bold truncate">{task.name}</span>
                        <Badge variant="secondary" className="text-[9px]">{task.taskType}</Badge>
                        {isBuiltin && <Badge variant="outline" className="text-[8px]">Built-in</Badge>}
                      </div>
                      <div className="flex items-center gap-1">
                        {!isBuiltin && (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => startEditing(task)}
                              data-testid={`button-edit-${task.name}`}
                            >
                              <Settings className="w-3 h-3" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => deleteTaskMutation.mutate(task.id)}
                              disabled={deleteTaskMutation.isPending}
                              data-testid={`button-delete-${task.name}`}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => runNowMutation.mutate(task.name)}
                          disabled={runNowMutation.isPending}
                          data-testid={`button-run-${task.name}`}
                        >
                          <Play className="w-3 h-3 mr-1" />
                          Run Now
                        </Button>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground">{task.description}</p>
                    <div className="grid grid-cols-3 gap-2 text-[10px]">
                      <div>
                        <span className="text-muted-foreground">Weight</span>
                        <div className={cn(
                          isVertical ? "flex flex-col items-center gap-1 mt-0.5" : "flex items-center gap-1 mt-0.5"
                        )}>
                          <Slider
                            value={[task.weight]}
                            onValueChange={([val]) =>
                              updateTaskMutation.mutate({ id: task.id, updates: { weight: val } })
                            }
                            min={0}
                            max={5}
                            step={0.1}
                            orientation={orientation}
                            className={cn(isVertical ? "h-[120px]" : "flex-1")}
                            data-testid={`slider-weight-${task.name}`}
                          />
                          <span className="font-mono text-right">{task.weight.toFixed(1)}</span>
                        </div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Interval</span>
                        <Input
                          type="number"
                          value={task.intervalSeconds}
                          onChange={(e) =>
                            updateTaskMutation.mutate({
                              id: task.id,
                              updates: { intervalSeconds: parseInt(e.target.value) || 300 },
                            })
                          }
                          className="text-[10px] font-mono mt-0.5"
                          data-testid={`input-interval-${task.name}`}
                        />
                      </div>
                      <div>
                        <span className="text-muted-foreground">Runs / Share</span>
                        <p className="font-mono mt-0.5">
                          {task.runCount} / {weightPct}%
                        </p>
                      </div>
                    </div>
                    {task.lastRun && (
                      <div className="text-[10px] text-muted-foreground">
                        Last run: {new Date(task.lastRun).toLocaleString()}
                        {task.lastResult && !task.lastResult.startsWith("handler:") && (
                          <span className="block truncate">{task.lastResult}</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <Zap className="w-4 h-4 text-blue-400" />
            Resource Allocation
          </h3>
          {tasks.filter((t: any) => t.enabled).length === 0 ? (
            <p className="text-xs text-muted-foreground">No enabled tasks.</p>
          ) : (
            <div className="space-y-1.5">
              {tasks
                .filter((t: any) => t.enabled)
                .map((task: any) => {
                  const pct = totalWeight > 0 ? (task.weight / totalWeight) * 100 : 0;
                  return (
                    <div key={task.id} className="flex items-center gap-2 text-xs" data-testid={`resource-${task.name}`}>
                      <span className="font-mono w-28 truncate">{task.name}</span>
                      <div className="flex-1 h-2 bg-background rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="font-mono w-12 text-right">{pct.toFixed(1)}%</span>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            Discovery Feed
          </h3>
          {discoveries.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No discoveries yet. Heartbeat tasks will surface notable findings here.
            </p>
          ) : (
            <div className="space-y-2">
              {discoveries.slice(0, 20).map((draft: any) => (
                <div
                  key={draft.id}
                  className="rounded-md border border-border p-2.5 space-y-1"
                  data-testid={`discovery-${draft.id}`}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs font-medium truncate flex-1">{draft.title}</span>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <Badge variant="secondary" className="text-[9px]">
                        {(draft.relevanceScore * 100).toFixed(0)}%
                      </Badge>
                      {!draft.promotedToConversation ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => promoteMutation.mutate(draft.id)}
                          disabled={promoteMutation.isPending}
                          data-testid={`button-promote-${draft.id}`}
                        >
                          Start Conversation
                        </Button>
                      ) : (
                        <Badge variant="default" className="text-[9px]">Promoted</Badge>
                      )}
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate">{draft.summary}</p>
                  <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
                    <span>{draft.sourceTask}</span>
                    <span>{new Date(draft.createdAt).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ScrollArea>
  );
}

function CustomToolsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [newCommand, setNewCommand] = useState("");
  const { data: allowlistData } = useQuery<{ hardcoded: string[]; extra: string[]; all: string[] }>({
    queryKey: ["/api/allowed-commands"],
  });
  const addCommandMutation = useMutation({
    mutationFn: (command: string) => apiRequest("POST", "/api/allowed-commands", { command }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/allowed-commands"] });
      setNewCommand("");
      toast({ title: "Command added to allowlist" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const deleteCommandMutation = useMutation({
    mutationFn: (cmd: string) => apiRequest("DELETE", `/api/allowed-commands/${encodeURIComponent(cmd)}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/allowed-commands"] });
      toast({ title: "Command removed" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function handleAddCommand() {
    const cmd = newCommand.trim();
    if (!cmd) return;
    if (cmd.includes(" ")) { toast({ title: "Single word only", variant: "destructive" }); return; }
    if (allowlistData?.all.includes(cmd)) { toast({ title: "Already in allowlist", variant: "destructive" }); return; }
    addCommandMutation.mutate(cmd);
  }

  const [showForm, setShowForm] = useState(false);
  const [editingTool, setEditingTool] = useState<CustomToolData | null>(null);
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [testToolId, setTestToolId] = useState<number | null>(null);
  const [testArgs, setTestArgs] = useState("{}");
  const [testResult, setTestResult] = useState<{ success: boolean; result: string; duration: number } | null>(null);

  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formType, setFormType] = useState("template");
  const [formCode, setFormCode] = useState("");
  const [formSchema, setFormSchema] = useState("{}");
  const [formModels, setFormModels] = useState<string[]>([]);
  const [formEnabled, setFormEnabled] = useState(true);

  const { data: tools = [], isLoading } = useQuery<CustomToolData[]>({
    queryKey: ["/api/custom-tools"],
    refetchInterval: 10000,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/custom-tools", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/custom-tools"] });
      toast({ title: "Tool created" });
      resetForm();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PATCH", `/api/custom-tools/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/custom-tools"] });
      toast({ title: "Tool updated" });
      resetForm();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/custom-tools/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/custom-tools"] });
      toast({ title: "Tool deleted" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/custom-tools/${id}/toggle`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/custom-tools"] });
    },
  });

  const testMutation = useMutation({
    mutationFn: ({ id, args }: { id: number; args: any }) => apiRequest("POST", `/api/custom-tools/${id}/test`, { args }),
    onSuccess: async (response: any) => {
      const data = await response.json();
      setTestResult(data);
    },
    onError: (e: any) => {
      setTestResult({ success: false, result: e.message, duration: 0 });
    },
  });

  function resetForm() {
    setShowForm(false);
    setEditingTool(null);
    setFormName("");
    setFormDesc("");
    setFormType("template");
    setFormCode("");
    setFormSchema("{}");
    setFormModels([]);
    setFormEnabled(true);
  }

  function startEdit(tool: CustomToolData) {
    setEditingTool(tool);
    setFormName(tool.name);
    setFormDesc(tool.description);
    setFormType(tool.handlerType);
    setFormCode(tool.handlerCode);
    setFormSchema(tool.parametersSchema ? JSON.stringify(tool.parametersSchema, null, 2) : "{}");
    setFormModels(tool.targetModels || []);
    setFormEnabled(tool.enabled);
    setShowForm(true);
  }

  function handleSubmit() {
    let parsedSchema: any = null;
    try {
      parsedSchema = JSON.parse(formSchema);
    } catch {
      toast({ title: "Invalid JSON in parameters schema", variant: "destructive" });
      return;
    }
    const payload = {
      name: formName,
      description: formDesc,
      handlerType: formType,
      handlerCode: formCode,
      parametersSchema: parsedSchema,
      targetModels: formModels.length > 0 ? formModels : [],
      enabled: formEnabled,
    };
    if (editingTool) {
      updateMutation.mutate({ id: editingTool.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  function openTest(toolId: number) {
    setTestToolId(toolId);
    setTestArgs("{}");
    setTestResult(null);
    setTestDialogOpen(true);
  }

  function runTest() {
    if (testToolId == null) return;
    let args: any;
    try {
      args = JSON.parse(testArgs);
    } catch {
      toast({ title: "Invalid JSON for test args", variant: "destructive" });
      return;
    }
    testMutation.mutate({ id: testToolId, args });
  }

  function toggleModel(model: string) {
    setFormModels((prev) =>
      prev.includes(model) ? prev.filter((m) => m !== model) : [...prev, model]
    );
  }

  if (isLoading) return <div className="p-4"><Skeleton className="h-40 w-full" /></div>;

  return (
    <ScrollArea className="h-full px-3 py-3">
      <div className="space-y-4 pb-4">

        <div className="rounded-lg border border-border bg-card p-3 space-y-2">
          <h3 className="font-semibold text-xs flex items-center gap-1.5 text-muted-foreground uppercase tracking-wide">
            <Shield className="w-3.5 h-3.5 text-primary" />
            run_command Allowlist
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {(allowlistData?.hardcoded || []).map((cmd) => (
              <span key={cmd} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-muted text-muted-foreground border border-transparent" data-testid={`badge-hardcoded-cmd-${cmd}`}>
                {cmd}
              </span>
            ))}
            {(allowlistData?.extra || []).map((cmd) => (
              <span key={cmd} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-primary/10 text-primary border border-primary/20" data-testid={`badge-extra-cmd-${cmd}`}>
                {cmd}
                <button
                  onClick={() => deleteCommandMutation.mutate(cmd)}
                  disabled={deleteCommandMutation.isPending}
                  className="hover:text-destructive transition-colors ml-0.5"
                  data-testid={`button-remove-cmd-${cmd}`}
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={newCommand}
              onChange={(e) => setNewCommand(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddCommand()}
              placeholder="command (single word)"
              className="text-xs font-mono h-7 flex-1"
              data-testid="input-new-command"
            />
            <Button size="sm" onClick={handleAddCommand} disabled={!newCommand.trim() || addCommandMutation.isPending} className="h-7 px-2 text-xs" data-testid="button-add-command">
              <Plus className="w-3 h-3 mr-1" />
              Add
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Wrench className="w-4 h-4 text-orange-400" />
            Custom Function Calls
          </h3>
          <Button
            size="sm"
            onClick={() => { resetForm(); setShowForm(true); }}
            data-testid="button-add-tool"
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Add Tool
          </Button>
        </div>

        {showForm && (
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <h4 className="font-semibold text-sm">{editingTool ? "Edit Tool" : "New Custom Tool"}</h4>

            <div className="space-y-2">
              <div>
                <Label className="text-xs">Name</Label>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="my_tool"
                  className="text-xs font-mono"
                  data-testid="input-tool-name"
                />
              </div>

              <div>
                <Label className="text-xs">Description</Label>
                <Input
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="What this tool does..."
                  className="text-xs"
                  data-testid="input-tool-description"
                />
              </div>

              <div>
                <Label className="text-xs">Handler Type</Label>
                <Select value={formType} onValueChange={setFormType}>
                  <SelectTrigger className="text-xs" data-testid="select-handler-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HANDLER_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">
                  {formType === "webhook" ? "Webhook URL" : formType === "javascript" ? "JavaScript Code" : "Template"}
                </Label>
                <Textarea
                  value={formCode}
                  onChange={(e) => setFormCode(e.target.value)}
                  placeholder={
                    formType === "webhook" ? "https://example.com/webhook"
                    : formType === "javascript" ? "return `Hello ${args.name}`;"
                    : "Hello {{name}}, your value is {{value}}"
                  }
                  className="text-xs font-mono min-h-[80px]"
                  data-testid="input-tool-code"
                />
              </div>

              <div>
                <Label className="text-xs">Parameters Schema (JSON)</Label>
                <Textarea
                  value={formSchema}
                  onChange={(e) => setFormSchema(e.target.value)}
                  placeholder='{"type":"object","properties":{"name":{"type":"string"}}}'
                  className="text-xs font-mono min-h-[60px]"
                  data-testid="input-tool-schema"
                />
              </div>

              <div>
                <Label className="text-xs">Target Models</Label>
                <div className="flex flex-wrap gap-3 mt-1">
                  {AVAILABLE_MODELS.map((model) => (
                    <div key={model} className="flex items-center gap-1.5">
                      <Checkbox
                        id={`model-${model}`}
                        checked={formModels.includes(model)}
                        onCheckedChange={() => toggleModel(model)}
                        data-testid={`checkbox-model-${model}`}
                      />
                      <Label htmlFor={`model-${model}`} className="text-xs font-mono cursor-pointer">
                        {model}
                      </Label>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Select which models can use this tool. Leave empty for all models.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={formEnabled}
                  onCheckedChange={setFormEnabled}
                  data-testid="toggle-tool-enabled"
                />
                <Label className="text-xs">Enabled</Label>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={!formName || !formDesc || !formCode || createMutation.isPending || updateMutation.isPending}
                data-testid="button-save-tool"
              >
                <Check className="w-3.5 h-3.5 mr-1" />
                {editingTool ? "Update" : "Create"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={resetForm}
                data-testid="button-cancel-tool"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {tools.length === 0 && !showForm ? (
          <div className="rounded-lg border border-border bg-card p-6 text-center">
            <Wrench className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No custom tools defined yet.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Create tools with webhook, JavaScript, or template handlers that models can call during conversations.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {tools.map((tool) => (
              <div
                key={tool.id}
                className={cn(
                  "rounded-lg border border-border bg-card p-3 space-y-2",
                  !tool.enabled && "opacity-60"
                )}
                data-testid={`card-tool-${tool.id}`}
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="font-mono text-sm font-semibold truncate" data-testid={`text-tool-name-${tool.id}`}>
                      {tool.name}
                    </span>
                    <Badge variant="secondary" className="text-[9px] font-mono flex-shrink-0">
                      {tool.handlerType}
                    </Badge>
                    {!tool.enabled && (
                      <Badge variant="secondary" className="text-[9px] bg-amber-500/20 text-amber-400 flex-shrink-0">
                        disabled
                      </Badge>
                    )}
                    {tool.isGenerated && (
                      <Badge variant="secondary" className="text-[9px] bg-pink-500/20 text-pink-400 flex-shrink-0" data-testid={`badge-generated-${tool.id}`}>
                        Generated
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => toggleMutation.mutate(tool.id)}
                      data-testid={`button-toggle-tool-${tool.id}`}
                    >
                      <ToggleLeft className={cn("w-4 h-4", tool.enabled ? "text-green-400" : "text-muted-foreground")} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openTest(tool.id)}
                      data-testid={`button-test-tool-${tool.id}`}
                    >
                      <TestTube className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => startEdit(tool)}
                      data-testid={`button-edit-tool-${tool.id}`}
                    >
                      <Wrench className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteMutation.mutate(tool.id)}
                      data-testid={`button-delete-tool-${tool.id}`}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">{tool.description}</p>

                {tool.targetModels && tool.targetModels.length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="text-[10px] text-muted-foreground">Models:</span>
                    {tool.targetModels.map((m) => (
                      <Badge key={m} variant="secondary" className="text-[9px] font-mono">{m}</Badge>
                    ))}
                  </div>
                )}

                <div className="text-[10px] font-mono text-muted-foreground bg-background rounded p-2 max-h-16 overflow-hidden">
                  {tool.handlerCode.slice(0, 200)}{tool.handlerCode.length > 200 ? "..." : ""}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={testDialogOpen} onOpenChange={setTestDialogOpen}>
        <DialogContent className="w-[90vw] max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TestTube className="w-5 h-5" />
              Test Tool
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Test Arguments (JSON)</Label>
              <Textarea
                value={testArgs}
                onChange={(e) => setTestArgs(e.target.value)}
                placeholder='{"key": "value"}'
                className="text-xs font-mono min-h-[60px]"
                data-testid="input-test-args"
              />
            </div>
            {testResult && (
              <div className={cn(
                "rounded p-3 text-xs font-mono",
                testResult.success ? "bg-green-500/10 border border-green-500/20" : "bg-red-500/10 border border-red-500/20"
              )}>
                <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                  <Badge variant="secondary" className={cn("text-[9px]", testResult.success ? "text-green-400" : "text-red-400")}>
                    {testResult.success ? "SUCCESS" : "ERROR"}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">{testResult.duration}ms</span>
                </div>
                <pre className="whitespace-pre-wrap max-h-40 overflow-auto text-[10px]" data-testid="text-test-result">
                  {testResult.result}
                </pre>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="secondary" onClick={() => setTestDialogOpen(false)}>
              Close
            </Button>
            <Button
              onClick={runTest}
              disabled={testMutation.isPending}
              data-testid="button-run-test"
            >
              <Play className="w-4 h-4 mr-1" />
              {testMutation.isPending ? "Running..." : "Run Test"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScrollArea>
  );
}

const CREDENTIAL_TEMPLATES = [
  {
    id: "ai_hub",
    name: "Multi-Model AI Hub",
    category: "ai",
    fields: [
      { label: "Endpoint URL", key: "endpoint_url" },
      { label: "API Key", key: "api_key" },
      { label: "Default Model", key: "default_model" },
    ],
  },
  {
    id: "google_cloud",
    name: "Google Cloud Project",
    category: "cloud",
    fields: [
      { label: "Project ID", key: "project_id" },
      { label: "API Key", key: "api_key" },
      { label: "Service Account JSON", key: "service_account_json" },
    ],
  },
  {
    id: "firebase",
    name: "Firebase",
    category: "cloud",
    fields: [
      { label: "Project ID", key: "project_id" },
      { label: "API Key", key: "api_key" },
      { label: "Auth Domain", key: "auth_domain" },
    ],
  },
  {
    id: "aws",
    name: "AWS",
    category: "cloud",
    fields: [
      { label: "Access Key ID", key: "access_key_id" },
      { label: "Secret Access Key", key: "secret_access_key" },
      { label: "Region", key: "region" },
    ],
  },
  {
    id: "custom",
    name: "Custom Service",
    category: "custom",
    fields: [],
  },
] as const;

function CredentialsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showNewCred, setShowNewCred] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [credServiceName, setCredServiceName] = useState("");
  const [credFields, setCredFields] = useState<{ label: string; key: string; value: string }[]>([]);
  const [customFieldLabel, setCustomFieldLabel] = useState("");

  const [showNewSecret, setShowNewSecret] = useState(false);
  const [secretName, setSecretName] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [secretValue, setSecretValue] = useState("");
  const [secretCategory, setSecretCategory] = useState("general");

  const [visibleFields, setVisibleFields] = useState<Set<string>>(new Set());

  const { data: credentials = [], isLoading: credsLoading } = useQuery<any[]>({
    queryKey: ["/api/credentials"],
  });

  const { data: secrets = [], isLoading: secretsLoading } = useQuery<any[]>({
    queryKey: ["/api/secrets"],
  });

  const { data: savedKeys = {} } = useQuery<Record<string, string>>({
    queryKey: ["/api/keys"],
  });

  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});

  const saveKeyMutation = useMutation({
    mutationFn: async ({ provider, key }: { provider: string; key: string }) => {
      await apiRequest("POST", "/api/keys", { provider, key });
    },
    onSuccess: (_, { provider, key }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/keys"] });
      setKeyInputs((prev) => ({ ...prev, [provider]: "" }));
      toast({ title: key ? `${provider} key saved` : `${provider} key removed` });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addCredMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/credentials", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/credentials"] });
      setShowNewCred(false);
      resetCredForm();
      toast({ title: "Credential saved" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteCredMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/credentials/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/credentials"] });
      toast({ title: "Credential deleted" });
    },
  });

  const addSecretMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/secrets", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/secrets"] });
      setShowNewSecret(false);
      setSecretName("");
      setSecretKey("");
      setSecretValue("");
      setSecretCategory("general");
      toast({ title: "Secret saved" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteSecretMutation = useMutation({
    mutationFn: (key: string) => apiRequest("DELETE", `/api/secrets/${encodeURIComponent(key)}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/secrets"] });
      toast({ title: "Secret deleted" });
    },
  });

  function resetCredForm() {
    setSelectedTemplate("");
    setCredServiceName("");
    setCredFields([]);
    setCustomFieldLabel("");
  }

  function handleTemplateSelect(templateId: string) {
    setSelectedTemplate(templateId);
    const tmpl = CREDENTIAL_TEMPLATES.find((t) => t.id === templateId);
    if (tmpl) {
      setCredServiceName(tmpl.id === "custom" ? "" : tmpl.name);
      setCredFields(tmpl.fields.map((f) => ({ label: f.label, key: f.key, value: "" })));
    }
  }

  function addCustomField() {
    if (!customFieldLabel.trim()) return;
    const key = customFieldLabel.trim().toLowerCase().replace(/\s+/g, "_");
    setCredFields((prev) => [...prev, { label: customFieldLabel.trim(), key, value: "" }]);
    setCustomFieldLabel("");
  }

  function removeCustomField(idx: number) {
    setCredFields((prev) => prev.filter((_, i) => i !== idx));
  }

  function toggleFieldVisibility(fieldId: string) {
    setVisibleFields((prev) => {
      const next = new Set(prev);
      if (next.has(fieldId)) next.delete(fieldId); else next.add(fieldId);
      return next;
    });
  }

  function handleSaveCred() {
    if (!credServiceName.trim()) return;
    if (credFields.length === 0) return;
    const tmpl = CREDENTIAL_TEMPLATES.find((t) => t.id === selectedTemplate);
    addCredMutation.mutate({
      serviceName: credServiceName.trim(),
      category: tmpl?.category || "custom",
      template: selectedTemplate || "custom",
      fields: credFields,
    });
  }

  return (
    <ScrollArea className="h-full px-3 py-3">
      <div className="space-y-4 pb-4">
        <div className="rounded-lg border border-primary/20 bg-card p-4">
          <h3 className="font-semibold text-sm mb-1 flex items-center gap-2">
            <Key className="w-4 h-4 text-primary" />
            AI Provider Keys
          </h3>
          <p className="text-[10px] text-muted-foreground mb-3">
            Bring your own keys for additional AI providers. Gemini and Grok are built-in.
          </p>
          <div className="space-y-3">
            {AI_PROVIDERS.map((p) => {
              const existing = savedKeys[p.id];
              return (
                <div key={p.id} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">{p.label}</span>
                    {existing && (
                      <div className="flex items-center gap-1">
                        <Badge variant="secondary" className="text-[9px] font-mono">{existing}</Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => saveKeyMutation.mutate({ provider: p.id, key: "" })}
                          data-testid={`button-remove-key-${p.id}`}
                        >
                          <X className="w-3 h-3 text-destructive" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      type="password"
                      placeholder={p.placeholder}
                      value={keyInputs[p.id] || ""}
                      onChange={(e) => setKeyInputs((prev) => ({ ...prev, [p.id]: e.target.value }))}
                      className="text-xs font-mono"
                      data-testid={`input-key-${p.id}`}
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!keyInputs[p.id]?.trim() || saveKeyMutation.isPending}
                      onClick={() => saveKeyMutation.mutate({ provider: p.id, key: keyInputs[p.id]!.trim() })}
                      data-testid={`button-save-key-${p.id}`}
                    >
                      Save
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 rounded bg-background p-2">
            <p className="text-[9px] text-muted-foreground">
              Built-in: Gemini 2.5 Flash, Grok-3 Mini. BYO keys enable future model routing.
              Keys are stored server-side per session.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Shield className="w-4 h-4 text-blue-400" />
              Service Credentials
            </h3>
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setShowNewCred(!showNewCred); if (showNewCred) resetCredForm(); }}
              data-testid="button-new-credential"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              {showNewCred ? "Cancel" : "Add Service"}
            </Button>
          </div>

          {showNewCred && (
            <div className="rounded-md border border-border p-3 space-y-3 mb-3">
              <div className="space-y-1">
                <Label className="text-xs">Template</Label>
                <Select value={selectedTemplate} onValueChange={handleTemplateSelect}>
                  <SelectTrigger className="text-xs" data-testid="select-credential-template">
                    <SelectValue placeholder="Choose a template..." />
                  </SelectTrigger>
                  <SelectContent>
                    {CREDENTIAL_TEMPLATES.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedTemplate && (
                <>
                  <div className="space-y-1">
                    <Label className="text-xs">Service Name</Label>
                    <Input
                      value={credServiceName}
                      onChange={(e) => setCredServiceName(e.target.value)}
                      className="text-xs"
                      placeholder="My AI Hub"
                      data-testid="input-credential-name"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">Fields</Label>
                    {credFields.map((field, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground w-28 flex-shrink-0 truncate">{field.label}</span>
                        <Input
                          type="password"
                          value={field.value}
                          onChange={(e) => {
                            const updated = [...credFields];
                            updated[idx] = { ...updated[idx], value: e.target.value };
                            setCredFields(updated);
                          }}
                          className="text-xs font-mono"
                          placeholder={`Enter ${field.label.toLowerCase()}`}
                          data-testid={`input-cred-field-${field.key}`}
                        />
                        {selectedTemplate === "custom" && (
                          <Button size="icon" variant="ghost" onClick={() => removeCustomField(idx)} data-testid={`button-remove-field-${idx}`}>
                            <X className="w-3 h-3 text-destructive" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>

                  {selectedTemplate === "custom" && (
                    <div className="flex items-center gap-2">
                      <Input
                        value={customFieldLabel}
                        onChange={(e) => setCustomFieldLabel(e.target.value)}
                        className="text-xs"
                        placeholder="New field label"
                        data-testid="input-custom-field-label"
                        onKeyDown={(e) => { if (e.key === "Enter") addCustomField(); }}
                      />
                      <Button size="sm" variant="outline" onClick={addCustomField} data-testid="button-add-custom-field">
                        <Plus className="w-3 h-3 mr-1" />
                        Add
                      </Button>
                    </div>
                  )}

                  <Button
                    className="w-full"
                    onClick={handleSaveCred}
                    disabled={!credServiceName.trim() || credFields.length === 0 || addCredMutation.isPending}
                    data-testid="button-save-credential"
                  >
                    <Check className="w-4 h-4 mr-1" />
                    {addCredMutation.isPending ? "Saving..." : "Save Credential"}
                  </Button>
                </>
              )}
            </div>
          )}

          {credsLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : credentials.length === 0 ? (
            <p className="text-xs text-muted-foreground">No service credentials configured. Add one using a template above.</p>
          ) : (
            <div className="space-y-2">
              {credentials.map((cred: any) => (
                <div key={cred.id} className="rounded-md border border-border p-2.5 space-y-1.5" data-testid={`card-credential-${cred.id}`}>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-xs font-medium truncate" data-testid={`text-cred-name-${cred.id}`}>{cred.serviceName}</span>
                      <Badge variant="secondary" className="text-[9px]">{cred.category}</Badge>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => deleteCredMutation.mutate(cred.id)}
                      disabled={deleteCredMutation.isPending}
                      data-testid={`button-delete-cred-${cred.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                  <div className="space-y-1">
                    {cred.fields?.map((field: any, idx: number) => {
                      const fieldId = `${cred.id}-${field.key}`;
                      const isVisible = visibleFields.has(fieldId);
                      return (
                        <div key={idx} className="flex items-center gap-2 text-[10px]">
                          <span className="text-muted-foreground w-28 flex-shrink-0 truncate">{field.label}</span>
                          <span className="font-mono flex-1 truncate" data-testid={`text-cred-field-${cred.id}-${field.key}`}>
                            {isVisible ? field.value : field.value?.replace(/./g, "*").slice(0, 20) || "***"}
                          </span>
                          <button onClick={() => toggleFieldVisibility(fieldId)} className="flex-shrink-0 text-muted-foreground" data-testid={`button-toggle-visibility-${cred.id}-${field.key}`}>
                            {isVisible ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <div className="text-[9px] text-muted-foreground">
                    Added {new Date(cred.createdAt).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              Quick Secrets
            </h3>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowNewSecret(!showNewSecret)}
              data-testid="button-new-secret"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              {showNewSecret ? "Cancel" : "Add Secret"}
            </Button>
          </div>

          {showNewSecret && (
            <div className="rounded-md border border-border p-3 space-y-2 mb-3">
              <div className="space-y-1">
                <Label className="text-xs">Name</Label>
                <Input
                  value={secretName}
                  onChange={(e) => setSecretName(e.target.value)}
                  className="text-xs"
                  placeholder="My Token"
                  data-testid="input-secret-name"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Key</Label>
                <Input
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value)}
                  className="text-xs font-mono"
                  placeholder="MY_TOKEN"
                  data-testid="input-secret-key"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Value</Label>
                <Input
                  type="password"
                  value={secretValue}
                  onChange={(e) => setSecretValue(e.target.value)}
                  className="text-xs font-mono"
                  placeholder="secret_value_here"
                  data-testid="input-secret-value"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Category</Label>
                <Select value={secretCategory} onValueChange={setSecretCategory}>
                  <SelectTrigger className="text-xs" data-testid="select-secret-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="api">API</SelectItem>
                    <SelectItem value="auth">Auth</SelectItem>
                    <SelectItem value="infra">Infrastructure</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                className="w-full"
                onClick={() => addSecretMutation.mutate({ name: secretName, key: secretKey, value: secretValue, category: secretCategory })}
                disabled={!secretKey.trim() || !secretValue.trim() || addSecretMutation.isPending}
                data-testid="button-save-secret"
              >
                <Check className="w-4 h-4 mr-1" />
                {addSecretMutation.isPending ? "Saving..." : "Save Secret"}
              </Button>
            </div>
          )}

          {secretsLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : secrets.length === 0 ? (
            <p className="text-xs text-muted-foreground">No quick secrets stored. Add one-off tokens and keys above.</p>
          ) : (
            <div className="space-y-1.5">
              {secrets.map((s: any) => {
                const fieldId = `secret-${s.key}`;
                const isVisible = visibleFields.has(fieldId);
                return (
                  <div key={s.key} className="flex items-center gap-2 rounded-md border border-border p-2" data-testid={`card-secret-${s.key}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium truncate" data-testid={`text-secret-name-${s.key}`}>{s.name}</span>
                        <Badge variant="secondary" className="text-[9px]">{s.category}</Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] font-mono text-muted-foreground">{s.key}</span>
                        <span className="text-[10px] font-mono" data-testid={`text-secret-value-${s.key}`}>
                          {isVisible ? s.value : "****"}
                        </span>
                        <button onClick={() => toggleFieldVisibility(fieldId)} className="text-muted-foreground" data-testid={`button-toggle-secret-${s.key}`}>
                          {isVisible ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        </button>
                      </div>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => deleteSecretMutation.mutate(s.key)}
                      disabled={deleteSecretMutation.isPending}
                      data-testid={`button-delete-secret-${s.key}`}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </ScrollArea>
  );
}

function ContextTab() {
  const { toast } = useToast();

  const { data: serverCtx } = useQuery<{ systemPrompt: string; contextPrefix: string }>({
    queryKey: ["/api/context"],
  });

  const [systemPrompt, setSystemPrompt] = useState("");
  const [contextPrefix, setContextPrefix] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (serverCtx && !loaded) {
      setSystemPrompt(serverCtx.systemPrompt);
      setContextPrefix(serverCtx.contextPrefix);
      setLoaded(true);
    }
  }, [serverCtx, loaded]);

  const saveMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/context", { systemPrompt, contextPrefix }),
    onSuccess: () => toast({ title: "Context saved and active" }),
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <ScrollArea className="h-full px-3 py-3">
      <div className="space-y-4 pb-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold text-sm mb-2">System Prompt</h3>
          <p className="text-[10px] text-muted-foreground mb-2">Editable. This is prepended to every AI request.</p>
          <Textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            className="min-h-[120px] font-mono text-xs resize-none"
            data-testid="textarea-system-prompt"
          />
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold text-sm mb-2">Context Prefix</h3>
          <p className="text-[10px] text-muted-foreground mb-2">Additional context injected with each prompt.</p>
          <Textarea
            value={contextPrefix}
            onChange={(e) => setContextPrefix(e.target.value)}
            className="min-h-[100px] font-mono text-xs resize-none"
            data-testid="textarea-context-prefix"
          />
        </div>

        <Button
          className="w-full"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          data-testid="button-save-context"
        >
          <Check className="w-4 h-4 mr-1" />
          {saveMutation.isPending ? "Saving..." : "Save Context"}
        </Button>

        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold text-sm mb-2">Full Prompt Preview</h3>
          <div className="bg-background rounded p-3 font-mono text-[10px] text-muted-foreground whitespace-pre-wrap max-h-48 overflow-auto" data-testid="text-prompt-preview">
            [SYSTEM]{"\n"}{systemPrompt}{"\n\n"}[CONTEXT]{"\n"}{contextPrefix}{"\n\n"}[USER MESSAGE]{"\n"}{"<user input here>"}
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}

const PRESET_PROVIDERS = [
  { id: "xai", label: "xAI", baseUrl: "https://api.x.ai/v1", models: ["grok-3-mini", "grok-3", "grok-3-mini-fast"] },
  { id: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1", models: ["gpt-4o-mini", "gpt-4o", "gpt-4-turbo"] },
  { id: "custom", label: "Custom", baseUrl: "", models: [] },
];

type SlotKey = "a" | "b" | "c";
type SlotData = { label: string; provider: string; model: string; baseUrl: string; apiKeySet: boolean };

function SlotEditor({ slotKey, slotData, onSaved }: { slotKey: SlotKey; slotData?: SlotData; onSaved: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [label, setLabel] = useState(slotData?.label ?? slotKey.toUpperCase());
  const [provider, setProvider] = useState(slotData?.provider ?? "xai");
  const [model, setModel] = useState(slotData?.model ?? "grok-3-mini");
  const [baseUrl, setBaseUrl] = useState(slotData?.baseUrl ?? "https://api.x.ai/v1");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (slotData && !loaded) {
      setLabel(slotData.label ?? slotKey.toUpperCase());
      setProvider(slotData.provider ?? "xai");
      setModel(slotData.model ?? "grok-3-mini");
      setBaseUrl(slotData.baseUrl ?? "https://api.x.ai/v1");
      setLoaded(true);
    }
  }, [slotData, loaded, slotKey]);

  const preset = PRESET_PROVIDERS.find(p => p.id === provider);

  function handleProviderChange(pid: string) {
    setProvider(pid);
    const p = PRESET_PROVIDERS.find(x => x.id === pid);
    if (p) {
      setBaseUrl(p.baseUrl);
      if (p.models.length) setModel(p.models[0]);
    }
  }

  const saveMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/agent/slots/${slotKey}`, {
      label, provider, model, baseUrl,
      ...(apiKey ? { apiKey } : {}),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agent/slots"] });
      setApiKey("");
      toast({ title: `Slot ${slotKey.toUpperCase()} saved` });
      onSaved();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-card p-3 space-y-2">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Label</h4>
        <Input
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder={`Slot ${slotKey.toUpperCase()}`}
          className="text-xs"
          data-testid={`input-slot-${slotKey}-label`}
        />
      </div>

      <div className="rounded-lg border border-border bg-card p-3 space-y-2">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Provider</h4>
        <div className="flex gap-1.5 flex-wrap">
          {PRESET_PROVIDERS.map(p => (
            <button
              key={p.id}
              onClick={() => handleProviderChange(p.id)}
              className={cn(
                "px-2.5 py-1 rounded-md border text-xs transition-colors",
                provider === p.id
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border hover:border-primary/50 hover:bg-accent text-muted-foreground"
              )}
              data-testid={`button-slot-${slotKey}-provider-${p.id}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-3 space-y-2">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Model</h4>
        {preset && preset.models.length > 0 && (
          <div className="flex gap-1 flex-wrap mb-1">
            {preset.models.map(m => (
              <button
                key={m}
                onClick={() => setModel(m)}
                className={cn(
                  "px-2 py-0.5 rounded text-[10px] font-mono transition-colors",
                  model === m
                    ? "bg-primary text-primary-foreground"
                    : "bg-background border border-border hover:bg-accent text-muted-foreground hover:text-foreground"
                )}
                data-testid={`button-slot-${slotKey}-model-${m}`}
              >
                {m}
              </button>
            ))}
          </div>
        )}
        <Input
          value={model}
          onChange={e => setModel(e.target.value)}
          placeholder="e.g. grok-3-mini, gpt-4o, llama-3..."
          className="font-mono text-xs"
          data-testid={`input-slot-${slotKey}-model`}
        />
      </div>

      <div className="rounded-lg border border-border bg-card p-3 space-y-2">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Base URL</h4>
        <Input
          value={baseUrl}
          onChange={e => setBaseUrl(e.target.value)}
          placeholder="https://api.x.ai/v1"
          className="font-mono text-xs"
          data-testid={`input-slot-${slotKey}-base-url`}
        />
      </div>

      <div className="rounded-lg border border-border bg-card p-3 space-y-2">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">API Key</h4>
        <p className="text-[10px] text-muted-foreground">
          {slotData?.apiKeySet ? "Key stored. Enter a new one to replace." : "No key stored. xAI slots use XAI_API_KEY env var."}
        </p>
        <div className="relative">
          <Input
            type={showKey ? "text" : "password"}
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder={slotData?.apiKeySet ? "••••••••••••••••" : "Paste API key…"}
            className="font-mono text-xs pr-9"
            data-testid={`input-slot-${slotKey}-api-key`}
          />
          <button
            type="button"
            onClick={() => setShowKey(v => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card px-3 py-2 font-mono text-[10px] text-muted-foreground space-y-0.5">
        <div><span className="text-primary">label</span>: {label}</div>
        <div><span className="text-primary">provider</span>: {provider}</div>
        <div><span className="text-primary">model</span>: {model}</div>
        <div><span className="text-primary">baseUrl</span>: {baseUrl || "(default)"}</div>
        <div><span className="text-primary">apiKey</span>: {slotData?.apiKeySet ? "stored ✓" : "env var"}</div>
      </div>

      <Button
        className="w-full"
        size="sm"
        onClick={() => saveMutation.mutate()}
        disabled={saveMutation.isPending}
        data-testid={`button-save-slot-${slotKey}`}
      >
        <Check className="w-3.5 h-3.5 mr-1" />
        {saveMutation.isPending ? "Saving..." : `Save Slot ${slotKey.toUpperCase()}`}
      </Button>
    </div>
  );
}

function ApiModelTab() {
  const [activeSlot, setActiveSlot] = useState<SlotKey>("a");

  const { data: slots } = useQuery<Record<string, SlotData>>({
    queryKey: ["/api/agent/slots"],
  });

  return (
    <ScrollArea className="h-full px-3 py-3">
      <div className="space-y-4 pb-4">
        <div>
          <p className="text-[11px] text-muted-foreground mb-2">
            Three independent model slots (A / B / C). Select a slot in the chat to route all calls through it.
          </p>
          <div className="flex gap-1.5">
            {(["a", "b", "c"] as const).map(s => (
              <button
                key={s}
                onClick={() => setActiveSlot(s)}
                className={cn(
                  "flex-1 py-1.5 rounded-md border text-xs font-semibold transition-colors",
                  activeSlot === s
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:bg-accent text-muted-foreground"
                )}
                data-testid={`button-slot-tab-${s}`}
              >
                {slots?.[s]?.label || s.toUpperCase()}
                {slots?.[s]?.model && (
                  <span className="block text-[9px] font-normal opacity-70 truncate px-1">{slots[s].model}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        <SlotEditor
          key={activeSlot}
          slotKey={activeSlot}
          slotData={slots?.[activeSlot]}
          onSaved={() => {}}
        />
      </div>
    </ScrollArea>
  );
}

type LogSource = "all" | "events" | "heartbeat" | "edcm" | "commands" | "costs" | "ai-transcripts" | "omega" | "psi";

const LOG_SOURCES: { id: LogSource; label: string; color: string }[] = [
  { id: "all", label: "All", color: "text-foreground" },
  { id: "events", label: "Events", color: "text-blue-400" },
  { id: "heartbeat", label: "Heartbeat", color: "text-red-400" },
  { id: "edcm", label: "EDCM", color: "text-purple-400" },
  { id: "commands", label: "Commands", color: "text-emerald-400" },
  { id: "costs", label: "Costs", color: "text-amber-400" },
  { id: "ai-transcripts", label: "AI Transcripts", color: "text-cyan-400" },
  { id: "omega", label: "Omega", color: "text-orange-400" },
  { id: "psi", label: "Psi", color: "text-pink-400" },
];

interface UnifiedLogEntry {
  id: string;
  source: LogSource;
  ts: Date;
  summary: string;
  status?: string;
  detail: any;
}

function ExportTab() {
  const { toast } = useToast();
  const [transcriptFrom, setTranscriptFrom] = useState("");
  const [transcriptTo, setTranscriptTo] = useState("");
  const [transcriptModel, setTranscriptModel] = useState("all");
  const [transcriptFormat, setTranscriptFormat] = useState("jsonl");
  const [convId, setConvId] = useState("");
  const [downloading, setDownloading] = useState<string | null>(null);

  const { data: conversations = [] } = useQuery<any[]>({
    queryKey: ["/api/conversations"],
  });

  const { data: aiFiles = [] } = useQuery<any[]>({
    queryKey: ["/api/ai-transcripts/files"],
  });

  function triggerDownload(url: string, filename: string, key: string) {
    setDownloading(key);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => setDownloading(null), 1500);
    toast({ title: `Downloading ${filename}` });
  }

  function downloadTranscripts() {
    const params = new URLSearchParams();
    if (transcriptFrom) params.set("from", transcriptFrom);
    if (transcriptTo) params.set("to", transcriptTo);
    if (transcriptModel && transcriptModel !== "all") params.set("model", transcriptModel);
    params.set("format", transcriptFormat);
    triggerDownload(`/api/export/transcripts?${params}`, `ai-transcripts.${transcriptFormat === "json" ? "json" : "jsonl"}`, "transcripts");
  }

  function downloadConversations() {
    const params = new URLSearchParams();
    if (convId) params.set("id", convId);
    const fname = convId ? `conversation-${convId}.json` : "conversations.json";
    triggerDownload(`/api/export/conversations?${params}`, fname, "conversations");
  }

  function downloadCredentials() {
    triggerDownload("/api/export/credentials", "credentials-inventory.json", "credentials");
  }

  function downloadConfig() {
    triggerDownload("/api/export/config", "system-config.json", "config");
  }

  function downloadAll() {
    triggerDownload("/api/export/all", "a0p-export.zip", "all");
  }

  const totalTranscriptSize = aiFiles.reduce((s: number, f: any) => s + (f.size || 0), 0);

  return (
    <ScrollArea className="h-full px-3 py-3">
      <div className="space-y-4 pb-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Download className="w-4 h-4 text-primary" />
            Data Export
          </h3>
          <Button
            onClick={downloadAll}
            disabled={downloading === "all"}
            data-testid="button-download-all"
          >
            <Download className="w-4 h-4 mr-1" />
            {downloading === "all" ? "Preparing..." : "Download All (ZIP)"}
          </Button>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <h4 className="font-semibold text-sm flex items-center gap-2">
                <ScrollText className="w-4 h-4 text-blue-400" />
                AI Transcripts
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                {aiFiles.length} file{aiFiles.length !== 1 ? "s" : ""} ({totalTranscriptSize > 1024 ? `${(totalTranscriptSize / 1024).toFixed(1)} KB` : `${totalTranscriptSize} B`})
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={downloadTranscripts}
              disabled={downloading === "transcripts"}
              data-testid="button-download-transcripts"
            >
              <Download className="w-3 h-3 mr-1" />
              {downloading === "transcripts" ? "..." : "Download"}
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px] text-muted-foreground">From</Label>
              <Input
                type="date"
                value={transcriptFrom}
                onChange={(e) => setTranscriptFrom(e.target.value)}
                data-testid="input-transcript-from"
              />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">To</Label>
              <Input
                type="date"
                value={transcriptTo}
                onChange={(e) => setTranscriptTo(e.target.value)}
                data-testid="input-transcript-to"
              />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Model</Label>
              <Select value={transcriptModel} onValueChange={setTranscriptModel}>
                <SelectTrigger data-testid="select-transcript-model">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Models</SelectItem>
                  <SelectItem value="gemini">Gemini</SelectItem>
                  <SelectItem value="grok">Grok</SelectItem>
                  <SelectItem value="synthesis-merge">Synthesis Merge</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Format</Label>
              <Select value={transcriptFormat} onValueChange={setTranscriptFormat}>
                <SelectTrigger data-testid="select-transcript-format">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="jsonl">JSONL</SelectItem>
                  <SelectItem value="json">JSON</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <h4 className="font-semibold text-sm flex items-center gap-2">
                <FileText className="w-4 h-4 text-green-400" />
                Chat Conversations
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                {conversations.length} conversation{conversations.length !== 1 ? "s" : ""}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={downloadConversations}
              disabled={downloading === "conversations"}
              data-testid="button-download-conversations"
            >
              <Download className="w-3 h-3 mr-1" />
              {downloading === "conversations" ? "..." : "Download"}
            </Button>
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">Conversation (leave empty for all)</Label>
            <Select value={convId || "all"} onValueChange={(v) => setConvId(v === "all" ? "" : v)}>
              <SelectTrigger data-testid="select-conversation-id">
                <SelectValue placeholder="All conversations" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Conversations</SelectItem>
                {conversations.map((c: any) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    #{c.id} - {c.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <h4 className="font-semibold text-sm flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-400" />
                Credentials Inventory
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                Names, categories, and field labels only (no secret values)
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={downloadCredentials}
              disabled={downloading === "credentials"}
              data-testid="button-download-credentials"
            >
              <Download className="w-3 h-3 mr-1" />
              {downloading === "credentials" ? "..." : "Download"}
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <h4 className="font-semibold text-sm flex items-center gap-2">
                <Settings className="w-4 h-4 text-purple-400" />
                System Configuration
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                Toggles, bandit arms, EDCM, memory seeds, heartbeat, costs
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={downloadConfig}
              disabled={downloading === "config"}
              data-testid="button-download-config"
            >
              <Download className="w-3 h-3 mr-1" />
              {downloading === "config" ? "..." : "Download"}
            </Button>
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}

function OmegaTab({ orientation, isVertical }: SliderOrientationProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [newGoal, setNewGoal] = useState("");
  const [newGoalPriority, setNewGoalPriority] = useState(5);

  const { data: omegaState, isLoading } = useQuery<any>({
    queryKey: ["/api/omega/state"],
    refetchInterval: 5000,
  });

  const modeMutation = useMutation({
    mutationFn: (mode: string) => apiRequest("POST", "/api/omega/mode", { mode }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/omega/state"] }); toast({ title: "Autonomy mode updated" }); },
  });

  const biasMutation = useMutation({
    mutationFn: ({ dimension, bias }: { dimension: number; bias: number }) => apiRequest("POST", "/api/omega/bias", { dimension, bias }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/omega/state"] }); },
  });

  const goalMutation = useMutation({
    mutationFn: (data: { description: string; priority: number }) => apiRequest("POST", "/api/omega/goal", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/omega/state"] }); setNewGoal(""); toast({ title: "Goal added" }); },
  });

  const completeGoalMutation = useMutation({
    mutationFn: (goalId: string) => apiRequest("POST", `/api/omega/goal/${goalId}/complete`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/omega/state"] }); toast({ title: "Goal completed" }); },
  });

  const removeGoalMutation = useMutation({
    mutationFn: (goalId: string) => apiRequest("POST", `/api/omega/goal/${goalId}/remove`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/omega/state"] }); },
  });

  const solveMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/omega/solve"),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/omega/state"] }); toast({ title: "Omega solve step executed" }); },
  });

  if (isLoading) return <div className="p-4"><Skeleton className="h-40" /></div>;

  const dims = omegaState?.dimensionEnergies || [];
  const labels = omegaState?.dimensionLabels || [];
  const thresholds = omegaState?.dimensionThresholds || [];
  const biases = omegaState?.dimensionBiases || [];
  const crossed = omegaState?.thresholdsCrossed || [];
  const goals = omegaState?.goals || [];
  const mode = omegaState?.mode || "active";
  const totalEnergy = omegaState?.totalEnergy || 0;
  const history = omegaState?.energyHistory || [];
  const activeGoals = goals.filter((g: any) => g.status === "active");
  const completedGoals = goals.filter((g: any) => g.status === "completed");

  const modeDescriptions: Record<string, string> = {
    active: "High initiative & exploration",
    passive: "Respond only, low initiative",
    economy: "Budget-conscious, minimal spend",
    research: "Deep exploration & learning",
  };

  const getEnergyColor = (e: number, t: number) => {
    if (e >= t) return "bg-green-500";
    if (e >= t * 0.7) return "bg-yellow-500";
    return "bg-red-500/60";
  };

  return (
    <ScrollArea className="flex-1">
      <div className="p-3 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold" data-testid="text-omega-title">PTCA-Ω Autonomy Tensor</h3>
            <p className="text-xs text-muted-foreground">53×10×8×7 = {omegaState?.config?.totalElements?.toLocaleString() || "29,680"} elements</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" data-testid="text-omega-energy">E: {totalEnergy.toFixed(4)}</Badge>
            <Button size="sm" variant="outline" onClick={() => solveMutation.mutate()} disabled={solveMutation.isPending} data-testid="button-omega-solve">
              <Zap className="w-3 h-3 mr-1" />Solve
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">Mode:</span>
          <Select value={mode} onValueChange={(v) => modeMutation.mutate(v)}>
            <SelectTrigger className="w-32 h-7 text-xs" data-testid="select-omega-mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="passive">Passive</SelectItem>
              <SelectItem value="economy">Economy</SelectItem>
              <SelectItem value="research">Research</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">{modeDescriptions[mode]}</span>
        </div>

        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dimensions (A1-A10)</h4>
          {dims.map((energy: number, i: number) => (
            <div key={i} className="space-y-1" data-testid={`omega-dimension-${i}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-mono w-5">A{i + 1}</span>
                  <span className="text-xs truncate max-w-[120px]">{labels[i] || `Dim ${i}`}</span>
                  {crossed[i] && <Badge variant="default" className="text-[9px] h-4 px-1" data-testid={`badge-crossed-${i}`}>ACTIVE</Badge>}
                </div>
                <span className="text-xs font-mono text-muted-foreground">{energy.toFixed(3)}/{thresholds[i]}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden relative">
                  <div className={`h-full rounded-full transition-all ${getEnergyColor(energy, thresholds[i])}`} style={{ width: `${Math.min(100, energy * 100)}%` }} />
                  <div className="absolute top-0 h-full w-px bg-foreground/40" style={{ left: `${thresholds[i] * 100}%` }} />
                </div>
                <Slider
                  className="w-16"
                  min={-10}
                  max={10}
                  step={1}
                  value={[Math.round((biases[i] || 0) * 10)]}
                  onValueChange={([v]) => biasMutation.mutate({ dimension: i, bias: v / 10 })}
                  data-testid={`slider-bias-${i}`}
                />
              </div>
            </div>
          ))}
        </div>

        {history.length > 1 && (
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Energy History</h4>
            <div className="flex items-end gap-px h-12 bg-muted/30 rounded p-1" data-testid="omega-energy-history">
              {history.map((e: number, i: number) => {
                const maxE = Math.max(...history, 0.001);
                return <div key={i} className="flex-1 bg-primary/70 rounded-t" style={{ height: `${Math.max(2, (e / maxE) * 100)}%` }} />;
              })}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Goals</h4>
          <div className="flex gap-2">
            <Input
              value={newGoal}
              onChange={(e) => setNewGoal(e.target.value)}
              placeholder="New goal description..."
              className="text-xs h-7 flex-1"
              data-testid="input-new-goal"
            />
            <Input
              type="number"
              value={newGoalPriority}
              onChange={(e) => setNewGoalPriority(parseInt(e.target.value) || 5)}
              className="text-xs h-7 w-14"
              min={1}
              max={10}
              data-testid="input-goal-priority"
            />
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              onClick={() => { if (newGoal.trim()) goalMutation.mutate({ description: newGoal.trim(), priority: newGoalPriority }); }}
              disabled={goalMutation.isPending || !newGoal.trim()}
              data-testid="button-add-goal"
            >
              <Plus className="w-3 h-3" />
            </Button>
          </div>

          {activeGoals.length > 0 && (
            <div className="space-y-1">
              {activeGoals.map((g: any) => (
                <div key={g.id} className="flex items-center justify-between bg-muted/40 rounded px-2 py-1" data-testid={`goal-active-${g.id}`}>
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <Badge variant="outline" className="text-[9px] h-4 px-1 shrink-0">P{g.priority}</Badge>
                    <span className="text-xs truncate">{g.description}</span>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => completeGoalMutation.mutate(g.id)} data-testid={`button-complete-goal-${g.id}`}>
                      <Check className="w-3 h-3 text-green-500" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => removeGoalMutation.mutate(g.id)} data-testid={`button-remove-goal-${g.id}`}>
                      <X className="w-3 h-3 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {completedGoals.length > 0 && (
            <div className="space-y-1">
              <span className="text-[10px] text-muted-foreground">Completed ({completedGoals.length})</span>
              {completedGoals.slice(0, 5).map((g: any) => (
                <div key={g.id} className="flex items-center gap-1.5 px-2 py-0.5 opacity-50" data-testid={`goal-completed-${g.id}`}>
                  <Check className="w-3 h-3 text-green-500 shrink-0" />
                  <span className="text-xs truncate line-through">{g.description}</span>
                </div>
              ))}
            </div>
          )}

          {goals.length === 0 && <p className="text-xs text-muted-foreground">No goals set. Add a goal to energize the Goal Persistence dimension.</p>}
        </div>

        <div className="space-y-1">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cross-Coupling</h4>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-muted/30 rounded p-2">
              <span className="text-muted-foreground">PTCA↔Ω:</span>
              <span className="ml-1 font-mono">{omegaState?.config?.crossCoupling || 0.05}</span>
            </div>
            <div className="bg-muted/30 rounded p-2">
              <span className="text-muted-foreground">Sentinel Gate:</span>
              <span className="ml-1 font-mono">{omegaState?.config?.sentinelThreshold || 120}</span>
            </div>
            <div className="bg-muted/30 rounded p-2">
              <span className="text-muted-foreground">A1↔Seed8:</span>
              <span className="ml-1">Goal↔Memory</span>
            </div>
            <div className="bg-muted/30 rounded p-2">
              <span className="text-muted-foreground">A9↔Seed7:</span>
              <span className="ml-1">Explore↔Research</span>
            </div>
          </div>
        </div>

        <div className="space-y-1">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</h4>
          <div className="text-xs text-muted-foreground space-y-0.5" data-testid="text-omega-status">
            {crossed[1] && <p>High initiative — self-initiating research</p>}
            {crossed[7] && <p>Resource-aware — using economy mode</p>}
            {crossed[8] && <p>High exploration — expanding search breadth</p>}
            {crossed[6] && <p>Learning active — writing journal entries</p>}
            {crossed[0] && activeGoals.length > 0 && <p>Goal-driven — {activeGoals.length} active goal(s)</p>}
            {!crossed.some((c: boolean) => c) && <p>All dimensions below threshold — nominal operation</p>}
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}

function LogsTab() {
  const [filter, setFilter] = useState<LogSource>("all");
  const [search, setSearch] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  const { data: events = [] } = useQuery<any[]>({
    queryKey: ["/api/a0p/events"],
    refetchInterval: 10000,
  });

  const { data: heartbeats = [] } = useQuery<any[]>({
    queryKey: ["/api/a0p/heartbeat"],
    refetchInterval: 15000,
  });

  const { data: snapshots = [] } = useQuery<any[]>({
    queryKey: ["/api/edcm/snapshots"],
    refetchInterval: 10000,
  });

  const { data: commands = [] } = useQuery<any[]>({
    queryKey: ["/api/terminal/history"],
    refetchInterval: 10000,
  });

  const { data: costHistory = [] } = useQuery<any[]>({
    queryKey: ["/api/metrics/costs/history"],
    refetchInterval: 15000,
  });

  const { data: aiTranscriptsData } = useQuery<{ entries: any[]; total: number }>({
    queryKey: ["/api/ai-transcripts"],
    refetchInterval: 10000,
  });
  const aiTranscripts = aiTranscriptsData?.entries || [];

  const { data: omegaLogsData } = useQuery<{ entries: any[]; total: number }>({
    queryKey: ["/api/logs/omega", { limit: 100 }],
    refetchInterval: 10000,
  });
  const omegaLogs = omegaLogsData?.entries || [];

  const { data: psiLogsData } = useQuery<{ entries: any[]; total: number }>({
    queryKey: ["/api/logs/psi", { limit: 100 }],
    refetchInterval: 10000,
  });
  const psiLogs = psiLogsData?.entries || [];

  const unified: UnifiedLogEntry[] = [];

  for (const ev of events) {
    const p = ev.payload || {};
    const metrics = p.edcmMetrics;
    const metricsStr = metrics ? ` CM=${metrics.CM?.toFixed?.(2) || metrics.CM} DA=${metrics.DA?.toFixed?.(2) || metrics.DA}` : "";
    unified.push({
      id: `evt-${ev.id}`,
      source: "events",
      ts: new Date(ev.createdAt),
      summary: `[${p.action || ev.eventType || "event"}] ${p.taskId || ev.taskId || ""}${metricsStr}`,
      status: p.edcm?.decision,
      detail: ev,
    });
  }

  for (const hb of heartbeats) {
    const d = hb.details || {};
    unified.push({
      id: `hb-${hb.id}`,
      source: "heartbeat",
      ts: new Date(hb.createdAt),
      summary: `${hb.status} — chain: ${hb.hashChainValid ? "valid" : "BROKEN"}, events: ${d.chainLength || 0}`,
      status: hb.status,
      detail: hb,
    });
  }

  for (const snap of snapshots) {
    unified.push({
      id: `edcm-${snap.id}`,
      source: "edcm",
      ts: new Date(snap.createdAt),
      summary: `${snap.decision} — delta=${snap.deltaBone?.toFixed(4)} task=${snap.taskId}`,
      status: snap.decision,
      detail: snap,
    });
  }

  for (const cmd of commands) {
    unified.push({
      id: `cmd-${cmd.id}`,
      source: "commands",
      ts: new Date(cmd.createdAt),
      summary: `$ ${cmd.command}${cmd.exitCode != null ? ` (exit ${cmd.exitCode})` : ""}`,
      status: cmd.exitCode === 0 ? "OK" : cmd.exitCode != null ? "ERROR" : undefined,
      detail: cmd,
    });
  }

  for (const cost of costHistory) {
    unified.push({
      id: `cost-${cost.id}`,
      source: "costs",
      ts: new Date(cost.createdAt),
      summary: `${cost.model} — $${cost.estimatedCost?.toFixed(4)} (${(cost.promptTokens + cost.completionTokens).toLocaleString()} tok)`,
      detail: cost,
    });
  }

  for (const t of aiTranscripts) {
    const tokStr = `${t.tokens?.total?.toLocaleString() || 0} tok`;
    const latStr = t.latencyMs ? `${(t.latencyMs / 1000).toFixed(1)}s` : "";
    unified.push({
      id: `ait-${t.timestamp}-${t.model}`,
      source: "ai-transcripts",
      ts: new Date(t.timestamp),
      summary: `${t.model} — ${t.status}${latStr ? ` ${latStr}` : ""} (${tokStr})`,
      status: t.status === "success" ? "OK" : "ERROR",
      detail: t,
    });
  }

  for (const ol of omegaLogs) {
    const d = ol.data || {};
    unified.push({
      id: `omega-${ol.timestamp}-${ol.seq || Math.random()}`,
      source: "omega",
      ts: new Date(ol.timestamp),
      summary: `[${d.event || ol.event || "omega"}] ${d.driver || d.dimension || d.mode || d.goalId || ""}${d.totalEnergy != null ? ` E=${d.totalEnergy.toFixed?.(4) || d.totalEnergy}` : ""}`,
      detail: ol,
    });
  }

  for (const pl of psiLogs) {
    const d = pl.data || {};
    unified.push({
      id: `psi-${pl.timestamp}-${pl.seq || Math.random()}`,
      source: "psi",
      ts: new Date(pl.timestamp),
      summary: `[${d.event || pl.event || "psi"}] ${d.dimension !== undefined ? `dim=${d.dimension}` : ""}${d.mode || ""}${d.totalEnergy != null ? ` E=${d.totalEnergy.toFixed?.(4) || d.totalEnergy}` : ""}`,
      detail: pl,
    });
  }

  unified.sort((a, b) => b.ts.getTime() - a.ts.getTime());

  const filtered = unified.filter((entry) => {
    if (filter !== "all" && entry.source !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return entry.summary.toLowerCase().includes(q) || JSON.stringify(entry.detail).toLowerCase().includes(q);
    }
    return true;
  });

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/a0p/events"] });
    queryClient.invalidateQueries({ queryKey: ["/api/a0p/heartbeat"] });
    queryClient.invalidateQueries({ queryKey: ["/api/edcm/snapshots"] });
    queryClient.invalidateQueries({ queryKey: ["/api/terminal/history"] });
    queryClient.invalidateQueries({ queryKey: ["/api/metrics/costs/history"] });
    queryClient.invalidateQueries({ queryKey: ["/api/ai-transcripts"] });
  };

  const sourceColor = (s: LogSource) => LOG_SOURCES.find((l) => l.id === s)?.color || "text-foreground";
  const statusBadge = (status?: string) => {
    if (!status) return null;
    const isOk = status === "OK" || status === "MERGE";
    const isWarn = status.includes("SOFTFORK") || status === "HYSTERESIS";
    const isErr = status.includes("ERROR") || status.includes("FORK") || status.includes("BROKEN");
    return (
      <Badge
        variant="secondary"
        className={cn(
          "text-[9px] font-mono",
          isOk && "bg-green-500/20 text-green-400",
          isWarn && "bg-amber-500/20 text-amber-400",
          isErr && "bg-red-500/20 text-red-400",
          !isOk && !isWarn && !isErr && "bg-muted text-muted-foreground"
        )}
        data-testid={`badge-log-status`}
      >
        {status}
      </Badge>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 px-3 py-2 space-y-2 border-b border-border bg-card">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Filter className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Search logs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-xs pl-8 font-mono"
              data-testid="input-log-search"
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={refreshAll}
            data-testid="button-refresh-logs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>

        <div className="flex gap-1 overflow-x-auto">
          {LOG_SOURCES.map((src) => (
            <button
              key={src.id}
              onClick={() => setFilter(src.id)}
              className={cn(
                "px-2 py-1 text-[10px] font-medium rounded-full whitespace-nowrap transition-colors",
                filter === src.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
              data-testid={`filter-${src.id}`}
            >
              {src.label}
              {src.id !== "all" && (
                <span className="ml-1 opacity-70">
                  {unified.filter((e) => e.source === src.id).length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="px-3 py-2 space-y-1">
          {filtered.length === 0 ? (
            <div className="text-center py-8">
              <ScrollText className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No log entries{search ? ` matching "${search}"` : ""}</p>
              <p className="text-xs text-muted-foreground mt-1">Run tasks through the engine to generate logs.</p>
            </div>
          ) : (
            <>
              <p className="text-[10px] text-muted-foreground mb-2" data-testid="text-log-count">
                {filtered.length} entries{filter !== "all" ? ` (${filter})` : ""}{search ? ` matching "${search}"` : ""}
              </p>
              {filtered.map((entry) => {
                const isExpanded = expandedIds.has(entry.id);
                return (
                  <div key={entry.id} className="rounded border border-border bg-card overflow-hidden" data-testid={`log-entry-${entry.id}`}>
                    <button
                      className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-muted/30 transition-colors"
                      onClick={() => toggleExpand(entry.id)}
                      data-testid={`button-expand-${entry.id}`}
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-muted-foreground" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={cn("text-[10px] font-bold uppercase", sourceColor(entry.source))}>
                            {entry.source}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {entry.ts.toLocaleTimeString()}
                          </span>
                          {statusBadge(entry.status)}
                        </div>
                        <p className="text-xs font-mono truncate mt-0.5">{entry.summary}</p>
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="px-3 pb-3 border-t border-border">
                        <LogDetail entry={entry} />
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function LogDetail({ entry }: { entry: UnifiedLogEntry }) {
  const d = entry.detail;

  if (entry.source === "events") {
    const p = d.payload || {};
    return (
      <div className="space-y-2 pt-2">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-muted-foreground">Event ID</span>
            <p className="font-mono text-[10px]">{p.event_id || `#${d.id}`}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Thread</span>
            <p className="font-mono text-[10px]">{p.thread_id || p.taskId || "--"}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Actor</span>
            <p className="font-mono text-[10px]">{p.actor_id || "system"}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Action</span>
            <p className="font-mono text-[10px]">{p.action || d.eventType || "--"}</p>
          </div>
        </div>
        {p.edcm && (
          <div className="rounded bg-background p-2">
            <span className="text-[10px] text-muted-foreground font-medium">EDCM Disposition</span>
            <div className="grid grid-cols-3 gap-2 mt-1 text-[10px] font-mono">
              <div>decision: {p.edcm.decision}</div>
              <div>delta: {p.edcm.delta?.toFixed(4)}</div>
              <div>dom: {p.edcm.dominantOp}</div>
            </div>
          </div>
        )}
        {p.edcmMetrics && (
          <div className="rounded bg-background p-2">
            <span className="text-[10px] text-muted-foreground font-medium">EDCM Metrics</span>
            <div className="grid grid-cols-3 gap-1 mt-1 text-[10px] font-mono">
              {Object.entries(p.edcmMetrics).map(([k, v]) => (
                <div key={k} className={cn(
                  typeof v === "number" && v >= 0.80 ? "text-red-400" : typeof v === "number" && v <= 0.20 ? "text-green-400" : ""
                )}>
                  {k}: {typeof v === "number" ? v.toFixed(3) : String(v)}
                </div>
              ))}
            </div>
          </div>
        )}
        {p.sentinelContext && (
          <div className="rounded bg-background p-2">
            <span className="text-[10px] text-muted-foreground font-medium">Sentinel Context</span>
            <div className="text-[10px] font-mono mt-1 space-y-0.5">
              <div>S4: {p.sentinelContext.S4_context?.window?.type || "turns"}/W={p.sentinelContext.S4_context?.window?.W || 32}, retrieval={p.sentinelContext.S4_context?.retrieval_mode || "none"}</div>
              <div>S7 risk: {p.sentinelContext.S7_risk?.score}</div>
              <div>S8 audit: {p.sentinelContext.S8_audit?.evidence_events?.length || 0} events</div>
            </div>
          </div>
        )}
        {p.provenance && (
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span>Build: {p.provenance.build}</span>
            <span>Hash: {d.hash?.slice(0, 16)}...</span>
          </div>
        )}
        <div className="rounded bg-background p-2 max-h-40 overflow-auto">
          <span className="text-[10px] text-muted-foreground font-medium">Raw Payload</span>
          <pre className="text-[9px] font-mono text-muted-foreground mt-1 whitespace-pre-wrap">{JSON.stringify(p, null, 2)}</pre>
        </div>
      </div>
    );
  }

  if (entry.source === "heartbeat") {
    const det = d.details || {};
    return (
      <div className="space-y-2 pt-2">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-muted-foreground">Status</span>
            <p className={cn("font-mono", d.hashChainValid ? "text-green-400" : "text-red-400")}>{d.status}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Chain Valid</span>
            <p className="font-mono">{d.hashChainValid ? "YES" : "NO"}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Chain Length</span>
            <p className="font-mono">{det.chainLength || 0}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Build</span>
            <p className="font-mono">{det.build || "--"}</p>
          </div>
        </div>
        {det.errors?.length > 0 && (
          <div className="rounded bg-red-500/10 p-2">
            <span className="text-[10px] text-red-400 font-medium">Errors</span>
            {det.errors.map((e: string, i: number) => (
              <p key={i} className="text-[10px] font-mono text-red-400 mt-1">{e}</p>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (entry.source === "edcm") {
    return (
      <div className="space-y-2 pt-2">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-muted-foreground">Decision</span>
            <p className="font-mono font-bold">{d.decision}</p>
          </div>
          <div>
            <span className="text-muted-foreground">BONE Delta</span>
            <p className="font-mono">{d.deltaBone?.toFixed(4)}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Grok Align</span>
            <p className={cn("font-mono", d.deltaAlignGrok > 0.25 ? "text-red-400" : "text-green-400")}>{d.deltaAlignGrok?.toFixed(4)}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Gemini Align</span>
            <p className={cn("font-mono", d.deltaAlignGemini > 0.25 ? "text-red-400" : "text-green-400")}>{d.deltaAlignGemini?.toFixed(4)}</p>
          </div>
        </div>
        {d.ptcaState && (
          <div className="rounded bg-background p-2">
            <span className="text-[10px] text-muted-foreground font-medium">PTCA State</span>
            <div className="grid grid-cols-2 gap-2 mt-1 text-[10px] font-mono">
              <div>Energy: {d.ptcaState.energy?.toFixed(4)}</div>
              <div>Hept: {d.ptcaState.heptagramEnergy?.toFixed(4) || "--"}</div>
              {d.ptcaState.coupling && (
                <div className="col-span-2">Coupling: α={d.ptcaState.coupling.alpha} β={d.ptcaState.coupling.beta} γ={d.ptcaState.coupling.gamma}</div>
              )}
            </div>
          </div>
        )}
        {d.operatorGrok && (
          <div className="rounded bg-background p-2">
            <span className="text-[10px] text-muted-foreground font-medium">Operator Vectors</span>
            <div className="text-[10px] font-mono mt-1">
              <div>Grok: P={d.operatorGrok.P?.toFixed(2)} K={d.operatorGrok.K?.toFixed(2)} Q={d.operatorGrok.Q?.toFixed(2)} T={d.operatorGrok.T?.toFixed(2)} S={d.operatorGrok.S?.toFixed(2)}</div>
              <div>Gemini: P={d.operatorGemini.P?.toFixed(2)} K={d.operatorGemini.K?.toFixed(2)} Q={d.operatorGemini.Q?.toFixed(2)} T={d.operatorGemini.T?.toFixed(2)} S={d.operatorGemini.S?.toFixed(2)}</div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (entry.source === "commands") {
    return (
      <div className="space-y-2 pt-2">
        <div>
          <span className="text-[10px] text-muted-foreground font-medium">Command</span>
          <pre className="text-xs font-mono bg-background rounded p-2 mt-1">$ {d.command}</pre>
        </div>
        <div>
          <span className="text-[10px] text-muted-foreground font-medium">Output</span>
          <pre className="text-[10px] font-mono bg-background rounded p-2 mt-1 max-h-48 overflow-auto whitespace-pre-wrap">{d.output || "(no output)"}</pre>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="text-muted-foreground">Exit code: <span className={cn("font-mono", d.exitCode === 0 ? "text-green-400" : "text-red-400")}>{d.exitCode ?? "--"}</span></span>
        </div>
      </div>
    );
  }

  if (entry.source === "costs") {
    return (
      <div className="space-y-2 pt-2">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-muted-foreground">Model</span>
            <p className="font-mono">{d.model}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Est. Cost</span>
            <p className="font-mono">${d.estimatedCost?.toFixed(6)}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Prompt Tokens</span>
            <p className="font-mono">{d.promptTokens?.toLocaleString()}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Completion Tokens</span>
            <p className="font-mono">{d.completionTokens?.toLocaleString()}</p>
          </div>
        </div>
      </div>
    );
  }

  if (entry.source === "ai-transcripts") {
    return (
      <div className="space-y-2 pt-2">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-muted-foreground">Model</span>
            <p className="font-mono" data-testid="text-ait-model">{d.model}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Status</span>
            <p className={cn("font-mono", d.status === "success" ? "text-green-400" : "text-red-400")} data-testid="text-ait-status">{d.status}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Latency</span>
            <p className="font-mono">{d.latencyMs ? `${(d.latencyMs / 1000).toFixed(2)}s` : "--"}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Total Tokens</span>
            <p className="font-mono">{d.tokens?.total?.toLocaleString() || 0}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Prompt Tokens</span>
            <p className="font-mono">{d.tokens?.prompt?.toLocaleString() || 0}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Completion Tokens</span>
            <p className="font-mono">{d.tokens?.completion?.toLocaleString() || 0}</p>
          </div>
          {d.conversationId && (
            <div>
              <span className="text-muted-foreground">Conversation</span>
              <p className="font-mono">#{d.conversationId}</p>
            </div>
          )}
          {d.error && (
            <div className="col-span-2">
              <span className="text-muted-foreground">Error</span>
              <p className="font-mono text-red-400 text-[10px]">{d.error}</p>
            </div>
          )}
        </div>
        <div className="rounded bg-background p-2">
          <span className="text-[10px] text-muted-foreground font-medium">Request</span>
          <pre className="text-[9px] font-mono text-muted-foreground mt-1 whitespace-pre-wrap max-h-40 overflow-auto" data-testid="text-ait-request">
            {typeof d.request === "string" ? d.request : JSON.stringify(d.request, null, 2)}
          </pre>
        </div>
        <div className="rounded bg-background p-2">
          <span className="text-[10px] text-muted-foreground font-medium">Response</span>
          <pre className="text-[9px] font-mono text-muted-foreground mt-1 whitespace-pre-wrap max-h-60 overflow-auto" data-testid="text-ait-response">
            {d.response || "(empty)"}
          </pre>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-2">
      <pre className="text-[9px] font-mono text-muted-foreground whitespace-pre-wrap max-h-40 overflow-auto">{JSON.stringify(d, null, 2)}</pre>
    </div>
  );
}

function PsiTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: psiState, isLoading } = useQuery<any>({
    queryKey: ["/api/psi/state"],
    refetchInterval: 5000,
  });
  const { data: triadState } = useQuery<any>({
    queryKey: ["/api/triad/state"],
    refetchInterval: 5000,
  });

  const solveMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/psi/solve"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/psi/state"] });
      queryClient.invalidateQueries({ queryKey: ["/api/triad/state"] });
      toast({ title: "Ψ solve step executed" });
    },
  });

  const modeMutation = useMutation({
    mutationFn: (mode: string) => apiRequest("POST", "/api/psi/mode", { mode }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/psi/state"] });
      toast({ title: "Self-model mode updated" });
    },
  });

  const boostMutation = useMutation({
    mutationFn: ({ dimension, amount }: { dimension: number; amount: number }) =>
      apiRequest("POST", "/api/psi/boost", { dimension, amount }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/psi/state"] });
    },
  });

  const biasMutation = useMutation({
    mutationFn: ({ dimension, bias }: { dimension: number; bias: number }) =>
      apiRequest("POST", "/api/psi/bias", { dimension, bias }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/psi/state"] });
    },
  });

  if (isLoading) return <div className="p-4"><Skeleton className="h-64 w-full" /></div>;

  const labels = psiState?.labels || [];
  const thresholds = psiState?.thresholds || [];
  const energies = psiState?.dimensionEnergies || [];
  const biases = psiState?.dimensionBiases || [];
  const mode = psiState?.mode || "operational";
  const history = psiState?.energyHistory || [];
  const omegaPairings = psiState?.omegaPairings || [];

  const modeDescriptions: Record<string, string> = {
    reflective: "Heightened Integrity, Coherence, Self-Awareness — introspective focus",
    operational: "Balanced — no biases applied",
    transparent: "Heightened Agency, Identity, Confidence — open communication",
    guarded: "Heightened Vigilance, Compliance, Prudence — cautious posture",
  };

  const aboveThreshold = energies.filter((e: number, i: number) => e >= (thresholds[i] || 0)).length;
  const statusText = aboveThreshold >= 9
    ? "Self-model fully coherent — all dimensions healthy"
    : aboveThreshold >= 6
    ? "Self-model stable — most dimensions above threshold"
    : aboveThreshold >= 3
    ? "Self-model degraded — multiple dimensions below threshold"
    : "Self-model critical — most dimensions below threshold";

  return (
    <ScrollArea className="h-full">
      <div className="p-3 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-pink-400" />
            <span className="font-semibold text-sm" data-testid="text-psi-header">PTCA-Ψ Self-Model Tensor</span>
            <Badge variant="secondary" className="text-[10px]" data-testid="badge-psi-energy">
              E = {(psiState?.totalEnergy || 0).toFixed(6)}
            </Badge>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => solveMutation.mutate()}
            disabled={solveMutation.isPending}
            data-testid="button-psi-solve"
          >
            <Zap className="w-3 h-3 mr-1" />
            Solve
          </Button>
        </div>

        <div className="rounded border border-border p-3 space-y-2">
          <span className="text-xs font-medium text-muted-foreground">Self-Model Mode</span>
          <div className="flex gap-2 flex-wrap">
            {["reflective", "operational", "transparent", "guarded"].map((m) => (
              <Button
                key={m}
                size="sm"
                variant={mode === m ? "default" : "outline"}
                onClick={() => modeMutation.mutate(m)}
                disabled={modeMutation.isPending}
                className="text-xs capitalize"
                data-testid={`button-psi-mode-${m}`}
              >
                {m}
              </Button>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground" data-testid="text-psi-mode-desc">
            {modeDescriptions[mode] || ""}
          </p>
        </div>

        <div className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Sentinel → Ψ → Ω Bridge</span>
          {labels.map((label: string, i: number) => {
            const energy = energies[i] || 0;
            const threshold = thresholds[i] || 0;
            const bias = biases[i] || 0;
            const omega = omegaPairings[i];
            const pct = Math.min(100, Math.max(0, energy * 100));
            const threshPct = threshold * 100;
            const isAbove = energy >= threshold;

            return (
              <div key={i} className="flex items-center gap-2 py-1 border-b border-border/50 last:border-0" data-testid={`row-psi-dim-${i}`}>
                <Badge
                  variant="outline"
                  className={cn("text-[9px] w-8 justify-center flex-shrink-0", isAbove ? "text-green-400 border-green-400/30" : "text-red-400 border-red-400/30")}
                  data-testid={`badge-sentinel-${i}`}
                >
                  S{i}
                </Badge>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[10px] font-medium" data-testid={`text-psi-label-${i}`}>
                      Ψ{i} {label}
                    </span>
                    <span className="text-[9px] text-muted-foreground" data-testid={`text-psi-energy-${i}`}>
                      {energy.toFixed(4)}/{threshold}
                    </span>
                  </div>
                  <div className="relative h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all", isAbove ? "bg-pink-400" : "bg-pink-400/40")}
                      style={{ width: `${pct}%` }}
                    />
                    <div
                      className="absolute top-0 h-full w-0.5 bg-white/60"
                      style={{ left: `${threshPct}%` }}
                    />
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-[8px] text-muted-foreground">bias:</span>
                    <input
                      type="range"
                      min="-100"
                      max="100"
                      value={Math.round(bias * 100)}
                      onChange={(e) => biasMutation.mutate({ dimension: i, bias: parseInt(e.target.value) / 100 })}
                      className="h-1 w-16 accent-pink-400"
                      data-testid={`slider-psi-bias-${i}`}
                    />
                    <span className="text-[8px] text-muted-foreground">{bias.toFixed(2)}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-4 px-1 text-[8px]"
                      onClick={() => boostMutation.mutate({ dimension: i, amount: 3 })}
                      data-testid={`button-psi-boost-${i}`}
                    >
                      +
                    </Button>
                  </div>
                </div>

                <div className="flex-shrink-0 text-right w-20">
                  <span className="text-[9px] text-muted-foreground" data-testid={`text-omega-pairing-${i}`}>
                    {omega?.omegaLabel || "—"}
                  </span>
                  {omega?.inverse && (
                    <Badge variant="outline" className="text-[7px] ml-1 text-yellow-400 border-yellow-400/30">INV</Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {triadState && (
          <div className="rounded border border-border p-3">
            <span className="text-xs font-medium text-muted-foreground">Triad Energy Summary</span>
            <div className="grid grid-cols-3 gap-3 mt-2">
              <div className="text-center" data-testid="text-triad-ptca">
                <div className="text-[10px] text-muted-foreground">PTCA (Cognitive)</div>
                <div className="text-sm font-mono font-bold">{(triadState.ptca?.energy || 0).toFixed(4)}</div>
                <div className="text-[9px] text-muted-foreground">{triadState.ptca?.axes}</div>
              </div>
              <div className="text-center" data-testid="text-triad-psi">
                <div className="text-[10px] text-pink-400">PTCA-Ψ (Self-Model)</div>
                <div className="text-sm font-mono font-bold">{(triadState.psi?.totalEnergy || 0).toFixed(4)}</div>
                <div className="text-[9px] text-muted-foreground">{triadState.psi?.mode}</div>
              </div>
              <div className="text-center" data-testid="text-triad-omega">
                <div className="text-[10px] text-orange-400">PTCA-Ω (Autonomy)</div>
                <div className="text-sm font-mono font-bold">{(triadState.omega?.totalEnergy || 0).toFixed(4)}</div>
                <div className="text-[9px] text-muted-foreground">{triadState.omega?.mode}</div>
              </div>
            </div>
          </div>
        )}

        {history.length > 0 && (
          <div className="rounded border border-border p-3">
            <span className="text-xs font-medium text-muted-foreground">Ψ Energy History (last {history.length})</span>
            <div className="flex items-end gap-0.5 mt-2 h-12">
              {history.map((e: number, i: number) => {
                const max = Math.max(...history, 0.001);
                const h = (e / max) * 100;
                return (
                  <div
                    key={i}
                    className="flex-1 bg-pink-400/60 rounded-t min-w-[3px]"
                    style={{ height: `${h}%` }}
                    title={e.toFixed(6)}
                    data-testid={`bar-psi-history-${i}`}
                  />
                );
              })}
            </div>
          </div>
        )}

        <div className="rounded border border-border p-2">
          <p className="text-[10px] text-muted-foreground" data-testid="text-psi-status">
            {statusText} ({aboveThreshold}/{labels.length} above threshold)
          </p>
        </div>
      </div>
    </ScrollArea>
  );
}

function S17Tab() {
  const S17_PRIMES = [2,3,5,7,11,13,17,19,23,29,31,37,41,43,47,53,59];
  const DEPTH = 7;
  const ANOMALY_THRESHOLD = 2.0;

  const [mode, setMode] = useState<'serial' | 'parallel'>(() =>
    (localStorage.getItem('a0p-s17-mode') as 'serial' | 'parallel') ?? 'serial'
  );

  const { data: state, isLoading, refetch } = useQuery<any>({
    queryKey: ['/api/subcore/state'],
    refetchInterval: 30000,
  });

  function switchMode(m: 'serial' | 'parallel') {
    setMode(m);
    localStorage.setItem('a0p-s17-mode', m);
  }

  function seedMagnitude(deltas: number[][] | undefined, i: number): number {
    if (!deltas?.[i]) return 0;
    return Math.sqrt(deltas[i].reduce((s, v) => s + v * v, 0));
  }

  function seedActivation(pattern: number[] | undefined, i: number): number {
    if (!pattern) return 0;
    const slice = pattern.slice(i * DEPTH, i * DEPTH + DEPTH);
    return Math.max(...slice.map(Math.abs));
  }

  function coherenceColor(c: number): string {
    if (c >= 0.8) return 'text-green-400';
    if (c >= 0.5) return 'text-amber-400';
    return 'text-red-400';
  }

  function activationToColor(activation: number): string {
    const t = Math.min(activation / 3, 1);
    if (t >= 0.8) return '#f87171';
    if (t >= 0.5) return '#fbbf24';
    if (t >= 0.2) return '#34d399';
    return '#64748b';
  }

  const auditory = state?.auditory;
  const visual = state?.visual;
  const anomalySet = new Set<number>(auditory?.anomalies?.map((a: any) => a.seedIndex as number) ?? []);

  const svgSize = 220;
  const cx = svgSize / 2;
  const cy = svgSize / 2;
  const ringR = 82;
  const nodeR = 13;

  function nodePos(i: number) {
    const angle = (i / 17) * 2 * Math.PI - Math.PI / 2;
    return { x: cx + ringR * Math.cos(angle), y: cy + ringR * Math.sin(angle) };
  }

  return (
    <ScrollArea className="h-full">
      <div className="px-3 py-3 space-y-3 pb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm">S17 Sub-Core</span>
            {state && <span className="text-[10px] font-mono text-muted-foreground">♥ {state.heartbeat}</span>}
          </div>
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => refetch()} data-testid="button-s17-refresh">
            <RefreshCw className="w-3 h-3" />
          </Button>
        </div>

        <div className="flex gap-0.5 p-0.5 bg-muted rounded-lg">
          <button
            onClick={() => switchMode('serial')}
            data-testid="button-s17-serial"
            className={cn("flex-1 text-[11px] font-medium py-1.5 rounded-md transition-colors",
              mode === 'serial' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground")}
          >
            Serial · Auditory
          </button>
          <button
            onClick={() => switchMode('parallel')}
            data-testid="button-s17-parallel"
            className={cn("flex-1 text-[11px] font-medium py-1.5 rounded-md transition-colors",
              mode === 'parallel' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground")}
          >
            Parallel · Visual
          </button>
        </div>

        {isLoading && <Skeleton className="w-full h-24" />}

        {!isLoading && mode === 'serial' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">Temporal · What changed?</span>
              <span className={cn("text-[11px] font-mono font-bold", coherenceColor(auditory?.coherence ?? 0))}>
                coh {((auditory?.coherence ?? 0) * 100).toFixed(0)}%
              </span>
            </div>
            {anomalySet.size > 0 && (
              <div className="rounded border border-red-500/30 bg-red-500/10 px-2 py-1 text-[10px] font-mono text-red-400">
                ⚠ {anomalySet.size} rhythm break{anomalySet.size > 1 ? 's' : ''} detected
              </div>
            )}
            <div className="space-y-1.5">
              {S17_PRIMES.map((prime, i) => {
                const mag = seedMagnitude(auditory?.deltas, i);
                const isAnomaly = anomalySet.has(i);
                const barWidth = Math.min((mag / ANOMALY_THRESHOLD) * 100, 100);
                return (
                  <div key={i} data-testid={`s17-seed-${i}`}>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-muted-foreground w-5 flex-shrink-0">{i}</span>
                      <span className="font-mono text-[9px] text-muted-foreground w-6 flex-shrink-0">p{prime}</span>
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-all", isAnomaly ? "bg-red-400" : "bg-primary/70")}
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                      <span className="font-mono text-[10px] text-muted-foreground w-10 text-right flex-shrink-0">
                        {mag.toFixed(3)}
                      </span>
                      {isAnomaly && <span className="text-[9px] font-mono text-red-400 flex-shrink-0">!</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!isLoading && mode === 'parallel' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">Structural · What shape?</span>
              <span className={cn("text-[11px] font-mono font-bold", coherenceColor(visual?.coherence ?? 0))}>
                coh {((visual?.coherence ?? 0) * 100).toFixed(0)}%
              </span>
            </div>
            <div className="flex justify-center">
              <svg width={svgSize} height={svgSize}>
                <text x={cx} y={cy - 5} textAnchor="middle" fontSize="8" fill="#94a3b8" fontFamily="monospace">S17</text>
                <text x={cx} y={cy + 9} textAnchor="middle" fontSize="11" fontFamily="monospace" fill="#e2e8f0" fontWeight="bold">
                  {((visual?.coherence ?? 0) * 100).toFixed(0)}%
                </text>
                {S17_PRIMES.map((prime, i) => {
                  const pos = nodePos(i);
                  const activation = seedActivation(visual?.pattern, i);
                  const color = activationToColor(activation);
                  return (
                    <g key={i} data-testid={`s17-node-${i}`}>
                      <circle cx={pos.x} cy={pos.y} r={nodeR} fill={color} fillOpacity="0.2" stroke={color} strokeWidth="1.5" />
                      <text x={pos.x} y={pos.y - 0.5} textAnchor="middle" fontSize="8" fontFamily="monospace" fill={color} fontWeight="bold">{i}</text>
                      <text x={pos.x} y={pos.y + 8} textAnchor="middle" fontSize="6" fontFamily="monospace" fill="#94a3b8">{prime}</text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
