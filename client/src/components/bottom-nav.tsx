import { useLocation, Link } from "wouter";
import { MessageSquare, Terminal, FolderOpen, Shield, CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { path: "/", icon: MessageSquare, label: "Chat" },
  { path: "/terminal", icon: Terminal, label: "Term" },
  { path: "/files", icon: FolderOpen, label: "Files" },
  { path: "/console", icon: Shield, label: "Console" },
  { path: "/pricing", icon: CreditCard, label: "Account" },
];

export default function BottomNav() {
  const [location] = useLocation();

  return (
    <nav
      className="flex items-center border-t border-border bg-card z-50 flex-shrink-0"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0)" }}
      data-testid="bottom-nav"
    >
      {tabs.map((tab) => {
        const active = location === tab.path || (tab.path !== "/" && location.startsWith(tab.path));
        return (
          <Link
            key={tab.path}
            href={tab.path}
            className={cn(
              "flex flex-col items-center justify-center flex-1 py-2 gap-0.5 transition-colors",
              active ? "text-primary" : "text-muted-foreground"
            )}
            data-testid={`nav-${tab.label.toLowerCase()}`}
          >
            <tab.icon
              className={cn("w-5 h-5", active && "drop-shadow-[0_0_6px_hsl(var(--primary))]")}
            />
            <span className="text-[10px] font-medium leading-none">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
