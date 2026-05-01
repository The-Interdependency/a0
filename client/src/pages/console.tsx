// 187:7
import { useState, useEffect, type ComponentType } from "react";
import { AlertTriangle, Loader2, Pencil, PencilOff } from "lucide-react";
import { useUiStructure } from "@/hooks/use-ui-structure";
import { useBillingStatus } from "@/hooks/use-billing-status";
import { useSEO } from "@/hooks/use-seo";
import { useWsEditModeProvider, WsEditContext } from "@/hooks/use-ws-edit-mode";
import ConsoleSidebar from "@/components/console-sidebar";
import TabRenderer from "@/components/TabRenderer";
import ApprovalScopesTab from "@/components/ApprovalScopesTab";
import WsModulesTab from "@/components/WsModulesTab";
import DocsTab from "@/components/DocsTab";
import SigmaTab from "@/components/SigmaTab";
import AgentsTab from "@/components/AgentsTab";
import CliKeysTab from "@/components/CliKeysTab";
import ForgeTab from "@/components/ForgeTab";
import LiminalsTab from "@/components/LiminalsTab";
import ModuleConfigEditor from "@/components/ModuleConfigEditor";
import type { TabDef } from "@/hooks/use-ui-structure";

const STORAGE_KEY = "a0p_active_tab";

// Registry of tab_ids that require a custom React component.
// Adding a new system tab whose UI cannot be expressed by sections+fields
// MUST register its renderer here. The console will refuse to render a
// silent generic placeholder for these ids.
export const CUSTOM_TAB_RENDERERS: Record<string, ComponentType> = {
  approval_scopes: ApprovalScopesTab,
  ws_modules: WsModulesTab,
  docs: DocsTab,
  sigma: SigmaTab,
  agents: AgentsTab,
  cli_keys: CliKeysTab,
  forge: ForgeTab,
  liminals: LiminalsTab,
  module_config: ModuleConfigEditor,
};

function MissingRendererError({ tabId }: { tabId: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 h-full p-8 text-center"
      data-testid={`tab-missing-renderer-${tabId}`}
      data-renderer="missing"
    >
      <AlertTriangle className="h-8 w-8 text-destructive" />
      <p className="text-sm font-medium">Tab "{tabId}" has no renderer wired</p>
      <p className="text-xs text-muted-foreground max-w-md">
        This tab returned no schema-driven sections and is not registered in
        CUSTOM_TAB_RENDERERS. Wire a component in client/src/pages/console.tsx
        or add a sections array to its UI_META.
      </p>
    </div>
  );
}

function usePersistedTab(tabs: TabDef[]) {
  const [activeTab, setActiveTab] = useState<string>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ?? "";
  });

  useEffect(() => {
    if (tabs.length > 0 && !tabs.find((t) => t.tab_id === activeTab)) {
      const first = tabs[0].tab_id;
      setActiveTab(first);
      localStorage.setItem(STORAGE_KEY, first);
    }
  }, [tabs, activeTab]);

  const selectTab = (tabId: string) => {
    setActiveTab(tabId);
    localStorage.setItem(STORAGE_KEY, tabId);
  };

  return { activeTab, selectTab };
}

function renderTab(tab: TabDef) {
  const Custom = CUSTOM_TAB_RENDERERS[tab.tab_id];
  if (Custom) {
    return (
      <div className="h-full" data-testid={`tab-content-${tab.tab_id}`} data-renderer="custom">
        <Custom />
      </div>
    );
  }
  // No custom renderer. The tab MUST have schema-driven sections, otherwise
  // we render an explicit error rather than a silent empty placeholder
  // (this is the regression we are guarding against).
  if (!tab.sections || tab.sections.length === 0) {
    return (
      <div className="h-full" data-testid={`tab-content-${tab.tab_id}`} data-renderer="missing">
        <MissingRendererError tabId={tab.tab_id} />
      </div>
    );
  }
  return (
    <div className="h-full" data-testid={`tab-content-${tab.tab_id}`} data-renderer="generic">
      <TabRenderer tab={tab} />
    </div>
  );
}

export default function ConsolePage() {
  useSEO({ title: "Console — a0p", description: "Your a0p operator console. Manage your agent, tools, and sessions." });
  const { data, isLoading, error } = useUiStructure();
  const { isAdmin, isWs } = useBillingStatus();

  const tabs = data?.tabs ?? [];
  const { activeTab, selectTab } = usePersistedTab(tabs);
  const currentTab = tabs.find((t) => t.tab_id === activeTab);

  const wsEditContext = useWsEditModeProvider(isWs);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full" data-testid="console-loading">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-destructive" data-testid="console-error">
        <p className="text-sm">Failed to load UI structure</p>
      </div>
    );
  }

  return (
    <WsEditContext.Provider value={wsEditContext}>
      <div className="flex flex-col h-full" data-testid="console-page">
        {isWs && (
          <div className="shrink-0 h-9 border-b border-border flex items-center justify-end px-4 gap-2 bg-background">
            {wsEditContext.schemaLoading && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            )}
            <button
              onClick={wsEditContext.toggleEditMode}
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded transition-colors ${
                wsEditContext.editMode
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
              data-testid="button-edit-mode-toggle"
            >
              {wsEditContext.editMode ? (
                <PencilOff className="h-3 w-3" />
              ) : (
                <Pencil className="h-3 w-3" />
              )}
              {wsEditContext.editMode ? "Exit Edit Mode" : "Edit Mode"}
            </button>
          </div>
        )}

        <div className="flex flex-1 overflow-hidden">
          <div className="w-48 shrink-0 hidden md:block">
            <ConsoleSidebar
              tabs={tabs}
              activeTab={activeTab}
              onSelectTab={selectTab}
              agentName={data?.agent}
              isAdmin={isAdmin}
            />
          </div>

          <div className="md:hidden w-full flex flex-col">
            <div className="relative border-b border-border shrink-0">
              <div className="overflow-x-auto px-2 py-1 flex gap-1" data-testid="console-mobile-tabs">
              {tabs.map((tab) => (
                <button
                  key={tab.tab_id}
                  onClick={() => selectTab(tab.tab_id)}
                  className={`px-3 py-1.5 text-xs rounded-md whitespace-nowrap transition-colors ${
                    tab.tab_id === activeTab
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground"
                  }`}
                  data-testid={`mobile-tab-${tab.tab_id}`}
                >
                  {tab.label}
                </button>
              ))}
              </div>
              {/* fading right gradient: signals more tabs scroll off-screen */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute top-0 right-0 h-full w-6 bg-gradient-to-l from-background to-transparent"
              />
            </div>
            <div className="flex-1 overflow-hidden">
              {currentTab && renderTab(currentTab)}
            </div>
          </div>

          <div className="flex-1 overflow-hidden hidden md:block">
            {currentTab ? (
              renderTab(currentTab)
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground" data-testid="console-empty">
                <p className="text-sm">Select a tab</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </WsEditContext.Provider>
  );
}
// 187:7
