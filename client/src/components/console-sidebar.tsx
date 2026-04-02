import { cn } from "@/lib/utils";
import { resolveIcon } from "@/components/icon-resolve";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2 } from "lucide-react";
import type { TabDef } from "@/hooks/use-ui-structure";

interface ConsoleSidebarProps {
  tabs: TabDef[];
  activeTab: string;
  onSelectTab: (tabId: string) => void;
  agentName?: string;
  isLoading?: boolean;
}

export default function ConsoleSidebar({
  tabs,
  activeTab,
  onSelectTab,
  agentName,
  isLoading,
}: ConsoleSidebarProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full" data-testid="sidebar-loading">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full border-r border-border bg-muted/30" data-testid="console-sidebar">
      {agentName && (
        <div className="px-3 py-3 border-b border-border">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Agent</p>
          <p className="text-xs font-mono truncate mt-0.5" data-testid="sidebar-agent-name">
            {agentName}
          </p>
        </div>
      )}
      <ScrollArea className="flex-1">
        <nav className="flex flex-col gap-0.5 p-2" data-testid="sidebar-nav">
          {tabs.map((tab) => {
            const Icon = resolveIcon(tab.icon);
            const isActive = tab.tab_id === activeTab;
            return (
              <button
                key={tab.tab_id}
                onClick={() => onSelectTab(tab.tab_id)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-md text-xs transition-colors w-full text-left",
                  isActive
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
                data-testid={`sidebar-tab-${tab.tab_id}`}
              >
                {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
                <span className="truncate">{tab.label}</span>
                <span className="ml-auto text-[10px] opacity-50">
                  {tab.sections.length}
                </span>
              </button>
            );
          })}
        </nav>
      </ScrollArea>
      <div className="px-3 py-2 border-t border-border">
        <p className="text-[10px] text-muted-foreground text-center">
          {tabs.length} modules
        </p>
      </div>
    </div>
  );
}
