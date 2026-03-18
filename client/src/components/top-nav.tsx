import { useLocation, Link } from "wouter";
import { Zap, Terminal, FolderOpen, Shield, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

const NAV_ITEMS = [
  { path: "/", icon: Zap, label: "Agent" },
  { path: "/terminal", icon: Terminal, label: "Term" },
  { path: "/files", icon: FolderOpen, label: "Files" },
  { path: "/console", icon: Shield, label: "Console" },
];

export default function TopNav() {
  const [location] = useLocation();
  const qc = useQueryClient();

  const { data: toggles = [] } = useQuery<any[]>({
    queryKey: ["/api/toggles"],
    refetchInterval: 30000,
  });

  const activeBrain = (() => {
    const toggleMap: Record<string, any> = {};
    for (const t of toggles) toggleMap[t.subsystem] = t;
    const activeId = toggleMap["active_brain_preset"]?.parameters?.presetId;
    const presets: any[] = toggleMap["brain_presets"]?.parameters || [];
    if (activeId && Array.isArray(presets)) {
      const preset = presets.find((p: any) => p.id === activeId);
      return preset?.name || null;
    }
    return null;
  })();

  const createConv = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/conversations", { title: "New Task", model: "agent" });
      return await res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/conversations"] });
      if (location !== "/") window.location.href = "/";
    },
  });

  return (
    <nav
      className="flex items-center border-b border-border bg-card z-50 flex-shrink-0 px-1"
      style={{ paddingTop: "env(safe-area-inset-top, 0)" }}
      data-testid="top-nav"
    >
      {NAV_ITEMS.map((item) => {
        const active = location === item.path || (item.path !== "/" && location.startsWith(item.path));
        return (
          <Link
            key={item.path}
            href={item.path}
            className={cn(
              "flex flex-col items-center justify-center flex-1 min-h-[44px] py-2 gap-0.5 transition-colors select-none",
              active ? "text-primary" : "text-muted-foreground"
            )}
            data-testid={`nav-${item.label.toLowerCase()}`}
          >
            <item.icon
              className={cn("w-5 h-5", active && "drop-shadow-[0_0_6px_hsl(var(--primary))]")}
            />
            <span className="text-[9px] font-medium leading-none">{item.label}</span>
          </Link>
        );
      })}

      {activeBrain && (
        <div className="flex flex-col items-center justify-center px-2 min-h-[44px] gap-0.5 text-muted-foreground" data-testid="nav-active-brain">
          <div className="text-[8px] font-mono leading-none text-primary/70 truncate max-w-[56px] text-center">
            {activeBrain}
          </div>
        </div>
      )}

      <button
        onClick={() => createConv.mutate()}
        disabled={createConv.isPending}
        className="flex flex-col items-center justify-center px-3 min-h-[44px] gap-0.5 text-muted-foreground hover:text-foreground transition-colors select-none"
        data-testid="nav-new-task"
        title="New Task"
      >
        <Plus className="w-5 h-5" />
        <span className="text-[9px] font-medium leading-none">New</span>
      </button>
    </nav>
  );
}
