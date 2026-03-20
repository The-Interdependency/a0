import { useState, useEffect, useMemo, useRef, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowLeftRight, ArrowUpDown, Loader2, Shield } from "lucide-react";
import { useSliderOrientation } from "@/hooks/use-slider-orientation";
import { usePersona, PERSONA_META } from "@/hooks/use-persona";
import { useLocation } from "wouter";
import {
  type TabGroup,
  type AgentModule,
  ALL_GROUPS,
  STATIC_TAB_IDS,
  PERSONA_VISIBLE_TABS,
  buildAgentGroups,
  resolveIcon,
} from "@/lib/console-config";
import {
  WorkflowTab,
  BanditTab,
  MetricsTab,
  DealsTab,
  MemoryTab,
  EdcmTab,
  BrainTab,
  S17Tab,
  PsiTab,
  OmegaTab,
  HeartbeatTab,
  SystemTab,
  LogsTab,
  CustomToolsTab,
  CredentialsTab,
  ContextTab,
  ApiModelTab,
  HubTab,
  ExportTab,
} from "@/components/tabs";

const allTabFiles = import.meta.glob("../components/tabs/*Tab.tsx");

function toPascalCase(slug: string): string {
  return slug.split(/[-_]/).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join("");
}

export default function ConsolePage() {
  const { persona, isOwner } = usePersona();

  const { data: agentModules = [] } = useQuery<AgentModule[]>({
    queryKey: ["/api/v1/agent/modules"],
    staleTime: 30000,
  });

  const agentTabGroups = useMemo(() => buildAgentGroups(agentModules), [agentModules]);

  const mergedGroups = useMemo<TabGroup[]>(() => {
    const staticGroupIds = new Set(ALL_GROUPS.map(g => g.id));
    const pureNewGroups = agentTabGroups.filter(g => !staticGroupIds.has(g.id));
    const merged = ALL_GROUPS.map(g => {
      const dynExtension = agentTabGroups.find(ag => ag.id === g.id);
      if (!dynExtension) return g;
      const existingIds = new Set(g.tabs.map(t => t.id));
      const newTabs = dynExtension.tabs.filter(t => !existingIds.has(t.id));
      return { ...g, tabs: [...g.tabs, ...newTabs] };
    });
    return [...merged, ...pureNewGroups];
  }, [agentTabGroups]);

  const visibleGroups = useMemo<TabGroup[]>(() => {
    if (isOwner) return mergedGroups;
    const allowed = PERSONA_VISIBLE_TABS[persona];
    if (!allowed) return mergedGroups;
    return mergedGroups
      .map(g => ({ ...g, tabs: g.tabs.filter(t => allowed.includes(t.id)) }))
      .filter(g => g.tabs.length > 0);
  }, [persona, isOwner, mergedGroups]);

  const defaultTab = visibleGroups[0]?.tabs[0]?.id ?? "edcm";

  const [activeTab, setActiveTab] = useState<string>(() => {
    const saved = localStorage.getItem("a0p-console-tab") ?? "";
    const inGroup = visibleGroups.some(g => g.tabs.some(t => t.id === saved));
    return inGroup ? saved : defaultTab;
  });

  const [activeGroup, setActiveGroup] = useState<string>(() => {
    const saved = localStorage.getItem("a0p-console-tab") ?? "";
    const owning = visibleGroups.find(g => g.tabs.some(t => t.id === saved));
    return owning?.id ?? visibleGroups[0]?.id ?? "agent";
  });

  useEffect(() => {
    const stillVisible = visibleGroups.some(g => g.tabs.some(t => t.id === activeTab));
    if (!stillVisible) {
      const first = visibleGroups[0]?.tabs[0]?.id ?? "workflow";
      setActiveTab(first);
      setActiveGroup(visibleGroups[0]?.id ?? "agent");
    }
  }, [persona, isOwner, visibleGroups]);

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

  function selectTab(tabId: string) {
    setActiveTab(tabId);
    localStorage.setItem("a0p-console-tab", tabId);
  }

  const currentGroup = visibleGroups.find(g => g.id === activeGroup) ?? visibleGroups[0];
  const [, navigate] = useLocation();
  const personaMeta = PERSONA_META[persona];

  const dynCache = useRef<Map<string, React.ComponentType<any>>>(new Map());
  const [DynComp, setDynComp] = useState<React.ComponentType<any> | null>(null);

  useEffect(() => {
    if (STATIC_TAB_IDS.has(activeTab)) { setDynComp(null); return; }
    if (dynCache.current.has(activeTab)) {
      setDynComp(() => dynCache.current.get(activeTab)!);
      return;
    }
    const compName = toPascalCase(activeTab) + "Tab";
    const key = `../components/tabs/${compName}.tsx`;
    const loader = allTabFiles[key];
    if (!loader) { setDynComp(null); return; }
    loader().then((m: any) => {
      const Comp = m[compName] || m.default;
      if (Comp) {
        dynCache.current.set(activeTab, Comp);
        setDynComp(() => Comp);
      } else {
        setDynComp(null);
      }
    }).catch(() => setDynComp(null));
  }, [activeTab]);

  const sliderProps = { orientation, isVertical };

  return (
    <div className="flex flex-col h-full w-full overflow-x-hidden">
      <header className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card flex-shrink-0 min-w-0">
        <Shield className="w-4 h-4 text-primary flex-shrink-0" />
        <span className="font-semibold text-sm flex-shrink-0">Console</span>
        <button
          onClick={() => navigate("/pricing")}
          className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-border hover:border-primary/50 hover:bg-accent transition-colors text-[11px] text-muted-foreground hover:text-foreground flex-1 min-w-0 max-w-fit"
          data-testid="button-persona-badge"
          title={`Current plan: ${personaMeta.label} — tap to change`}
        >
          <span>{personaMeta.icon}</span>
          <span className={cn("font-medium truncate", personaMeta.color)}>{personaMeta.label}</span>
        </button>
        <div className="flex-1" />
        <Button
          size="icon"
          variant="ghost"
          onClick={toggleOrientation}
          data-testid="button-toggle-slider-orientation"
        >
          {isVertical ? <ArrowUpDown className="w-4 h-4" /> : <ArrowLeftRight className="w-4 h-4" />}
        </Button>
      </header>

      <div className="flex gap-1 px-2 py-1 bg-card border-b border-border flex-shrink-0 overflow-x-auto min-w-0 max-w-full scrollbar-none">
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

      <div className="flex border-b border-border bg-card overflow-x-auto flex-shrink-0 min-w-0 max-w-full scrollbar-none">
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

      <div className="flex-1 overflow-hidden min-w-0">
        {activeTab === "workflow" && <WorkflowTab />}
        {activeTab === "bandit" && <BanditTab {...sliderProps} />}
        {activeTab === "metrics" && <MetricsTab {...sliderProps} />}
        {activeTab === "edcm" && <EdcmTab />}
        {activeTab === "memory" && <MemoryTab {...sliderProps} />}
        {activeTab === "brain" && <BrainTab {...sliderProps} />}
        {activeTab === "system" && <SystemTab />}
        {activeTab === "heartbeat" && <HeartbeatTab {...sliderProps} />}
        {activeTab === "tools" && <CustomToolsTab />}
        {activeTab === "credentials" && <CredentialsTab />}
        {activeTab === "export" && <ExportTab />}
        {activeTab === "logs" && <LogsTab />}
        {activeTab === "context" && <ContextTab />}
        {activeTab === "api" && <ApiModelTab />}
        {activeTab === "hub" && <HubTab />}
        {activeTab === "omega" && <OmegaTab {...sliderProps} />}
        {activeTab === "psi" && <PsiTab />}
        {activeTab === "s17" && <S17Tab />}
        {activeTab === "deals" && <DealsTab />}
        {!STATIC_TAB_IDS.has(activeTab) && DynComp && (
          <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}>
            <DynComp />
          </Suspense>
        )}
        {!STATIC_TAB_IDS.has(activeTab) && !DynComp && (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading module…
          </div>
        )}
      </div>
    </div>
  );
}
