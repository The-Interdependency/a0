import { Activity, Brain, ChevronDown, ChevronRight, Clock, Cpu, DollarSign, Download, Eye, FileText, Gauge, GitBranch, Lock, ScrollText, Settings, ShoppingBag, Star, Wrench, Zap } from "lucide-react";
import type { Persona } from "@/hooks/use-persona";

export type TabId = "workflow" | "bandit" | "metrics" | "edcm" | "memory" | "brain" | "system" | "heartbeat" | "tools" | "credentials" | "export" | "logs" | "context" | "omega" | "psi" | "api" | "s17" | "deals";

export type TabGroup = { id: string; label: string; icon: any; tabs: Array<{ id: TabId; label: string; icon: any }> };

export type SliderOrientationProps = { orientation: "horizontal" | "vertical"; isVertical: boolean };

export const TAB_GROUPS: readonly TabGroup[] = [
  {
    id: "agent", label: "Self-State Diag", icon: Activity,
    tabs: [
      { id: "workflow" as TabId, label: "Workflow", icon: Activity },
      { id: "bandit" as TabId, label: "Bandit", icon: GitBranch },
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

export const ALL_GROUPS: TabGroup[] = [...TAB_GROUPS];

export const TAB_TO_GROUP: Record<TabId, string> = {
  workflow: "agent", bandit: "agent", metrics: "agent", deals: "agent",
  memory: "memory", edcm: "memory", brain: "memory", s17: "memory",
  psi: "triad", omega: "triad", heartbeat: "triad",
  system: "system", logs: "system",
  tools: "tools", credentials: "tools", context: "tools", api: "tools", export: "tools",
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

export const PERSONA_VISIBLE_TABS: Record<Persona, TabId[] | null> = {
  free: null,
  legal: ["workflow", "metrics", "deals", "edcm", "memory", "psi", "heartbeat", "context", "logs", "credentials", "export"],
  researcher: ["workflow", "metrics", "deals", "edcm", "memory", "brain", "psi", "omega", "heartbeat", "context", "logs", "credentials", "export"],
  political: ["workflow", "metrics", "deals", "edcm", "memory", "psi", "heartbeat", "context", "logs", "credentials", "export"],
};

export const SLOT_COLORS: Record<string, string> = {
  a: "text-blue-500",
  b: "text-orange-500",
  c: "text-purple-500",
};

export function slotColor(key: string): string {
  return SLOT_COLORS[key] || "text-green-500";
}
