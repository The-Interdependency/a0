import { Activity, AlertTriangle, BarChart2, BookOpen, Brain, ChevronDown, ChevronRight, Clock, Cpu, Database, DollarSign, Download, Edit3, Eye, FileSearch, FileText, Flame, Gauge, GitBranch, Globe, Hash, Layers, Library, Lock, Map, Package, Puzzle, Radio, RefreshCw, ScrollText, Search, Settings, Shield, ShoppingBag, Sliders, Square, Star, Target, Terminal, Triangle, Truck, Upload, User, Wand2, Wrench, Zap } from "lucide-react";
import type { Persona } from "@/hooks/use-persona";

export type TabId =
  | "rt_status" | "heartbeat" | "rt_sentinels" | "rt_alerts" | "rt_control"
  | "reasoning_overview" | "psi" | "reasoning_jury" | "reasoning_guardian" | "reasoning_policies"
  | "memory" | "logs" | "context" | "memory_hygiene" | "export"
  | "tools_builtin" | "tools" | "credentials" | "tools_permissions" | "metrics"
  | "system" | "api" | "hub" | "sys_logs" | "sys_audit"
  | "bandit" | "research_ingest" | "research_runs" | "research_findings" | "research_drafts"
  | "workflow" | "omega" | "edcm" | "brain" | "s17" | "deals" | "tasks"
  | "model_flow" | "agents";

export type TabGroup = { id: string; label: string; icon: any; tabs: Array<{ id: string; label: string; icon: any }> };

export type SliderOrientationProps = { orientation: "horizontal" | "vertical"; isVertical: boolean };

export type AgentModule = {
  name: string;
  tabId: string;
  groupId: string;
  label: string;
  icon: string;
  description?: string;
  createdAt: string;
  createdBy?: string;
};

export const AGENT_ICONS: Record<string, any> = {
  Activity, Brain, Clock, Cpu, Database, DollarSign, Download, Eye,
  FileText, Flame, Gauge, GitBranch, Globe, Hash, Layers, Lock, Map,
  Package, Puzzle, Radio, ScrollText, Search, Settings, Shield, ShoppingBag,
  Square, Star, Target, Terminal, Triangle, User, Wand2, Wrench, Zap,
};

export function resolveIcon(name: string): any {
  return AGENT_ICONS[name] || Zap;
}

export function buildAgentGroups(modules: AgentModule[]): TabGroup[] {
  const grouped: Record<string, AgentModule[]> = {};
  for (const m of modules) {
    const g = m.groupId || "custom";
    if (!grouped[g]) grouped[g] = [];
    grouped[g].push(m);
  }
  const result: TabGroup[] = [];
  for (const groupId of Object.keys(grouped)) {
    const mods: AgentModule[] = grouped[groupId];
    const existing = TAB_GROUPS.find(g => g.id === groupId);
    if (existing) {
      const dynTabs = mods.map((m: AgentModule) => ({ id: m.tabId, label: m.label, icon: resolveIcon(m.icon) }));
      result.push({ ...existing, tabs: [...existing.tabs, ...dynTabs] });
    } else {
      result.push({
        id: groupId,
        label: groupId.charAt(0).toUpperCase() + groupId.slice(1),
        icon: Puzzle,
        tabs: mods.map((m: AgentModule) => ({ id: m.tabId, label: m.label, icon: resolveIcon(m.icon) })),
      });
    }
  }
  return result;
}

export const TAB_GROUPS: readonly TabGroup[] = [
  {
    id: "runtime", label: "Runtime", icon: Activity,
    tabs: [
      { id: "rt_status", label: "Status", icon: Gauge },
      { id: "heartbeat", label: "Heartbeat", icon: Clock },
      { id: "agents", label: "Agents", icon: Brain },
      { id: "rt_sentinels", label: "Sentinels", icon: Shield },
      { id: "rt_alerts", label: "Alerts", icon: AlertTriangle },
      { id: "rt_control", label: "Control", icon: Sliders },
    ],
  },
  {
    id: "reasoning", label: "Reasoning", icon: Brain,
    tabs: [
      { id: "reasoning_overview", label: "Overview", icon: Eye },
      { id: "psi", label: "Triad", icon: Star },
      { id: "reasoning_jury", label: "Jury", icon: Layers },
      { id: "reasoning_guardian", label: "Guardian", icon: Shield },
      { id: "reasoning_policies", label: "Policies", icon: ScrollText },
    ],
  },
  {
    id: "memory", label: "Memory", icon: Database,
    tabs: [
      { id: "memory", label: "Seeds", icon: Brain },
      { id: "logs", label: "Activity", icon: Activity },
      { id: "context", label: "Identity", icon: FileText },
      { id: "memory_hygiene", label: "Hygiene", icon: RefreshCw },
      { id: "export", label: "Import/Export", icon: Download },
    ],
  },
  {
    id: "tools", label: "Tools", icon: Wrench,
    tabs: [
      { id: "tools_builtin", label: "Built-in", icon: Package },
      { id: "tools", label: "Custom", icon: Wrench },
      { id: "credentials", label: "Auth", icon: Lock },
      { id: "tools_permissions", label: "Permissions", icon: Settings },
      { id: "metrics", label: "Budgets", icon: DollarSign },
    ],
  },
  {
    id: "system", label: "System", icon: Settings,
    tabs: [
      { id: "system", label: "Config", icon: Settings },
      { id: "api", label: "Models", icon: Cpu },
      { id: "model_flow", label: "Flow", icon: GitBranch },
      { id: "hub", label: "aimmh-lib", icon: Radio },
      { id: "sys_logs", label: "Logs", icon: ScrollText },
      { id: "sys_audit", label: "Audit", icon: FileSearch },
    ],
  },
  {
    id: "research", label: "Research", icon: Search,
    tabs: [
      { id: "bandit", label: "Explore", icon: GitBranch },
      { id: "research_ingest", label: "Ingest", icon: Upload },
      { id: "research_runs", label: "Runs", icon: Target },
      { id: "research_findings", label: "Findings", icon: BookOpen },
      { id: "research_drafts", label: "Drafts", icon: Edit3 },
    ],
  },
] as const;

export const ALL_GROUPS: TabGroup[] = [...TAB_GROUPS];

export const STATIC_TAB_IDS = new Set<string>([
  "rt_status", "heartbeat", "rt_sentinels", "rt_alerts", "rt_control",
  "reasoning_overview", "psi", "reasoning_jury", "reasoning_guardian", "reasoning_policies",
  "memory", "logs", "context", "memory_hygiene", "export",
  "tools_builtin", "tools", "credentials", "tools_permissions", "metrics",
  "system", "api", "hub", "sys_logs", "sys_audit",
  "bandit", "research_ingest", "research_runs", "research_findings", "research_drafts",
  "model_flow", "agents",
]);

export const TAB_TO_GROUP: Record<TabId, string> = {
  rt_status: "runtime", heartbeat: "runtime", rt_sentinels: "runtime", rt_alerts: "runtime", rt_control: "runtime",
  reasoning_overview: "reasoning", psi: "reasoning", reasoning_jury: "reasoning", reasoning_guardian: "reasoning", reasoning_policies: "reasoning",
  memory: "memory", logs: "memory", context: "memory", memory_hygiene: "memory", export: "memory",
  tools_builtin: "tools", tools: "tools", credentials: "tools", tools_permissions: "tools", metrics: "tools",
  system: "system", api: "system", hub: "system", sys_logs: "system", sys_audit: "system",
  bandit: "research", research_ingest: "research", research_runs: "research", research_findings: "research", research_drafts: "research",
  workflow: "runtime", omega: "reasoning", edcm: "reasoning", brain: "memory", s17: "runtime", deals: "tools", tasks: "runtime",
  model_flow: "system", agents: "runtime",
};

export type MetricLabelMap = Record<string, { label: string; desc: string }>;

export const DEFAULT_METRIC_LABELS: MetricLabelMap = {
  CM: { label: "Constraint Mismatch", desc: "1 - Jaccard(C_declared, C_observed)" },
  DA: { label: "Dissonance Accum.", desc: "sigmoid(w·contradictions + retractions + repeats)" },
  DRIFT: { label: "Drift", desc: "1 - cosine_similarity(x_t, goal)" },
  DVG: { label: "Divergence", desc: "entropy(topic_distribution) normalized" },
  INT: { label: "Intensity", desc: "clamp01(caps + punct + lex + tempo)" },
  TBF: { label: "Turn-Balance", desc: "Gini coefficient on actor token shares" },
};

export const PERSONA_METRIC_LABELS: Record<Persona, MetricLabelMap> = {
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

export const PERSONA_VISIBLE_TABS: Record<Persona, string[] | null> = {
  free: null,
  legal: null,
  researcher: null,
  political: null,
};

export const SLOT_COLORS: Record<string, string> = {
  a: "text-blue-500",
  b: "text-orange-500",
  c: "text-purple-500",
};

export function slotColor(key: string): string {
  return SLOT_COLORS[key] || "text-green-500";
}
