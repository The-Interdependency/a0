import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useUiStructure } from "@/hooks/use-ui-structure";
import { useBillingStatus } from "@/hooks/use-billing-status";
import { useSEO } from "@/hooks/use-seo";
import ConsoleSidebar from "@/components/console-sidebar";
import TabRenderer from "@/components/TabRenderer";
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

export default function ConsolePage() {
  useSEO({ title: "Console — a0p" });
  const { data, isLoading, error } = useUiStructure();
  const { isAdmin } = useBillingStatus();

  const tabs = data?.tabs ?? [];
  const { activeTab, selectTab } = usePersistedTab(tabs);
  const currentTab = tabs.find((t) => t.tab_id === activeTab);

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
    <div className="flex h-full" data-testid="console-page">
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
          {currentTab && <TabRenderer tab={currentTab} />}
        </div>
      </div>

      <div className="flex-1 overflow-hidden hidden md:block">
        {currentTab ? (
          <TabRenderer tab={currentTab} />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground" data-testid="console-empty">
            <p className="text-sm">Select a tab</p>
          </div>
        )}
      </div>
    </div>
  );
}
