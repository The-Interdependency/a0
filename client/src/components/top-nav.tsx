// 174:0
import { useLocation, Link } from "wouter";
import { Zap, Shield, Palette, Check, Archive, Network, Images, FileSearch, Sun, Moon, Monitor, Cpu } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUiStructure } from "@/hooks/use-ui-structure";
import { useBillingStatus } from "@/hooks/use-billing-status";
import { useAuth } from "@/hooks/use-auth";
import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useSkin, SKINS, SKIN_LABELS, type Skin } from "@/hooks/use-skin";
import { useThemeMode, MODES, MODE_LABELS, type ThemeMode } from "@/hooks/use-theme-mode";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

const NAV_ITEMS = [
  { path: "/", icon: Zap, label: "Agent" },
  { path: "/console", icon: Shield, label: "Console" },
  { path: "/fleet", icon: Network, label: "Fleet" },
  { path: "/archive", icon: Archive, label: "Archive" },
  { path: "/gallery", icon: Images, label: "Gallery" },
  { path: "/transcripts", icon: FileSearch, label: "Transcripts" },
  { path: "/providers", icon: Cpu, label: "Providers" },
];

const MODE_ICON: Record<ThemeMode, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

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
  const { skin, setSkin } = useSkin();
  const { mode, setMode } = useThemeMode();

  const SKIN_SWATCHES: Record<Skin, string[]> = {
    tensor: ["#0A0A0F", "#4ADE80", "#E0F2FE"],
    synthwave: ["#0B0A14", "#F472B6", "#67E8F9"],
    copper: ["#0F0C09", "#F59E0B", "#FDE68A"],
  };

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
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 text-muted-foreground hover-elevate"
            aria-label="Change skin"
            data-testid="button-skin-selector"
          >
            <Palette className="w-5 h-5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-56 p-2" data-testid="popover-skin-selector">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground px-2 pt-1 pb-2">
            Mode
          </div>
          <div className="flex flex-col gap-1 mb-2">
            {MODES.map((m) => {
              const active = mode === m;
              const Icon = MODE_ICON[m];
              return (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={cn(
                    "flex items-center gap-2 px-2 py-2 rounded-md text-sm hover-elevate text-left",
                    active && "bg-accent/10 text-accent-foreground"
                  )}
                  data-testid={`button-mode-${m}`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="flex-1">{MODE_LABELS[m]}</span>
                  {active && <Check className="w-4 h-4 text-accent" />}
                </button>
              );
            })}
          </div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground px-2 pt-1 pb-2 border-t border-border">
            Skin
          </div>
          <div className="flex flex-col gap-1">
            {SKINS.map((s) => {
              const active = skin === s;
              return (
                <button
                  key={s}
                  onClick={() => setSkin(s)}
                  className={cn(
                    "flex items-center gap-2 px-2 py-2 rounded-md text-sm hover-elevate text-left",
                    active && "bg-accent/10 text-accent-foreground"
                  )}
                  data-testid={`button-skin-${s}`}
                >
                  <span className="flex gap-0.5">
                    {SKIN_SWATCHES[s].map((c, i) => (
                      <span
                        key={i}
                        className="w-3 h-5 rounded-sm border border-border"
                        style={{ background: c }}
                      />
                    ))}
                  </span>
                  <span className="flex-1">{SKIN_LABELS[s]}</span>
                  {active && <Check className="w-4 h-4 text-accent" />}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
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
// 174:0
