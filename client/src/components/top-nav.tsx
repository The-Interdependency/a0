// 84:0
import { useLocation, Link } from "wouter";
import { Zap, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUiStructure } from "@/hooks/use-ui-structure";
import { useBillingStatus } from "@/hooks/use-billing-status";
import { useAuth } from "@/hooks/use-auth";
import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";

const NAV_ITEMS = [
  { path: "/", icon: Zap, label: "Agent" },
  { path: "/console", icon: Shield, label: "Console" },
];

const TIER_COLORS: Record<string, string> = {
  free: "bg-muted text-muted-foreground",
  supporter: "bg-blue-500/20 text-blue-400",
  ws: "bg-violet-500/20 text-violet-400",
  admin: "bg-emerald-500/20 text-emerald-400",
};

export default function TopNav() {
  const [location] = useLocation();
  const { data } = useUiStructure();
  const { user } = useAuth();
  const { tier, tierLabel } = useBillingStatus();
  const { toast } = useToast();

  useEffect(() => {
    function handleUpgrade(_e: Event) {
      toast({
        title: "Limit reached — upgrade on the pricing page",
        description: "Visit /pricing to choose a plan.",
      });
    }
    window.addEventListener("a0p:upgrade-required", handleUpgrade);
    return () => window.removeEventListener("a0p:upgrade-required", handleUpgrade);
  }, [toast]);

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
            <span className="text-[11px] font-medium leading-none">{item.label}</span>
          </Link>
        );
      })}
      {data?.agent && (
        <div
          className="flex items-center justify-center px-3 min-h-[44px] text-muted-foreground gap-2"
          data-testid="nav-agent-name"
        >
          <span className="text-[11px] font-mono truncate max-w-[100px]">{data.agent}</span>
          {user && (
            <Link href="/pricing" aria-label={`Account tier: ${tierLabel} — open pricing page`}>
              <span
                className={cn(
                  "text-[11px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide cursor-pointer",
                  TIER_COLORS[tier] ?? TIER_COLORS.free
                )}
                data-testid="nav-tier-badge"
              >
                {tierLabel}
              </span>
            </Link>
          )}
        </div>
      )}
    </nav>
  );
}
// 84:0
