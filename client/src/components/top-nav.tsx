import { useLocation, Link } from "wouter";
import { Zap, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUiStructure } from "@/hooks/use-ui-structure";

const NAV_ITEMS = [
  { path: "/", icon: Zap, label: "Agent" },
  { path: "/console", icon: Shield, label: "Console" },
];

export default function TopNav() {
  const [location] = useLocation();
  const { data } = useUiStructure();

  return (
    <nav
      className="flex items-center border-b border-border bg-card z-50 flex-shrink-0 px-1"
      style={{ paddingTop: "env(safe-area-inset-top, 0)" }}
      data-testid="top-nav"
    >
      {NAV_ITEMS.map((item) => {
        const active = location === item.path;
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
      {data?.agent && (
        <div
          className="flex items-center justify-center px-3 min-h-[44px] text-muted-foreground"
          data-testid="nav-agent-name"
        >
          <span className="text-[9px] font-mono truncate max-w-[140px]">{data.agent}</span>
        </div>
      )}
    </nav>
  );
}
