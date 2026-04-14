// 132:0
import { useState, useEffect } from "react";
import { Loader2, Pencil, PencilOff } from "lucide-react";
import { useUiStructure } from "@/hooks/use-ui-structure";
import { useBillingStatus } from "@/hooks/use-billing-status";
import { useSEO } from "@/hooks/use-seo";
import { useWsEditModeProvider, WsEditContext } from "@/hooks/use-ws-edit-mode";
import ConsoleSidebar from "@/components/console-sidebar";
import TabRenderer from "@/components/TabRenderer";
import AgentsTab from "@/components/AgentsTab";
import ApprovalScopesTab from "@/components/ApprovalScopesTab";
import WsModulesTab from "@/components/WsModulesTab";
import DocsTab from "@/components/DocsTab";
import SigmaTab from "@/components/SigmaTab";
import CliKeysTab from "@/components/CliKeysTab";
import type { TabDef } from "@/hooks/use-ui-structure";

const STORAGE_KEY = "a0p_active_tab";

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
  if (tab.tab_id === "agents") return <AgentsTab />;
  if (tab.tab_id === "approval_scopes") return <ApprovalScopesTab />;
  if (tab.tab_id === "ws_modules") return <WsModulesTab />;
  if (tab.tab_id === "docs") return <DocsTab />;
  if (tab.tab_id === "sigma") return <SigmaTab />;
  if (tab.tab_id === "cli_keys") return <CliKeysTab />;
  return <TabRenderer tab={tab} />;
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
            <div className="overflow-x-auto border-b border-border px-2 py-1 flex gap-1 shrink-0" data-testid="console-mobile-tabs">
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
// 132:0
