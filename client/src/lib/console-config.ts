import { Activity, Brain, ChevronDown, ChevronRight, Clock, Cpu, Database, DollarSign, Download, Eye, FileText, Flame, Gauge, GitBranch, Globe, Hash, Layers, Lock, Map, Package, Puzzle, Radio, ScrollText, Search, Settings, Shield, ShoppingBag, Square, Star, Target, Terminal, Triangle, User, Wand2, Wrench, Zap } from "lucide-react";
import type { Persona } from "@/hooks/use-persona";

export type TabId = "workflow" | "bandit" | "metrics" | "edcm" | "memory" | "brain" | "system" | "heartbeat" | "tools" | "credentials" | "export" | "logs" | "context" | "omega" | "psi" | "api" | "s17" | "deals";

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
    id: "agent", label: "Cognition", icon: Activity,
    tabs: [
      { id: "workflow", label: "Workflow", icon: Activity },
      { id: "bandit", label: "ε-Explore", icon: GitBranch },
      { id: "metrics", label: "Metrics", icon: DollarSign },
      { id: "deals", label: "Deals", icon: ShoppingBag },
      { id: "api", label: "API", icon: Cpu },
    ],
  },
  {
    id: "memory", label: "Memory", icon: Brain,
    tabs: [
      { id: "memory", label: "Memory", icon: Brain },
    ],
  },
  {
    id: "triad", label: "Triad", icon: Star,
    tabs: [
      { id: "psi", label: "Psi Ψ", icon: Eye },
      { id: "omega", label: "Omega Ω", icon: Gauge },
      { id: "heartbeat", label: "Φ Heartbeat", icon: Clock },
    ],
  },
  {
    id: "system", label: "System", icon: Settings,
    tabs: [
      { id: "system", label: "System", icon: Settings },
      { id: "logs", label: "Logs", icon: ScrollText },
    ],
  },
  {
    id: "tools", label: "Tools", icon: Wrench,
    tabs: [
      { id: "tools", label: "Tools", icon: Wrench },
      { id: "credentials", label: "Keys", icon: Lock },
      { id: "context", label: "Context", icon: FileText },
      { id: "export", label: "Export", icon: Download },
    ],
  },
] as const;

export const ALL_GROUPS: TabGroup[] = [...TAB_GROUPS];

export const STATIC_TAB_IDS = new Set<string>([
  "workflow", "bandit", "metrics", "deals",
  "memory", "edcm", "brain", "s17",
  "psi", "omega", "heartbeat",
  "system", "logs",
  "tools", "credentials", "context", "api", "export",
]);

export const TAB_TO_GROUP: Record<TabId, string> = {
  workflow: "agent", bandit: "agent", metrics: "agent", deals: "agent", api: "agent",
  memory: "memory", edcm: "memory", brain: "memory", s17: "memory",
  psi: "triad", omega: "triad", heartbeat: "triad",
  system: "system", logs: "system",
  tools: "tools", credentials: "tools", context: "tools", export: "tools",
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
  legal: ["workflow", "metrics", "deals", "memory", "api", "psi", "heartbeat", "context", "logs", "credentials", "export"],
  researcher: ["workflow", "metrics", "deals", "memory", "api", "psi", "omega", "heartbeat", "context", "logs", "credentials", "export"],
  political: ["workflow", "metrics", "deals", "memory", "api", "psi", "heartbeat", "context", "logs", "credentials", "export"],
};

export const SLOT_COLORS: Record<string, string> = {
  a: "text-blue-500",
  b: "text-orange-500",
  c: "text-purple-500",
};

export function slotColor(key: string): string {
  return SLOT_COLORS[key] || "text-green-500";
}
