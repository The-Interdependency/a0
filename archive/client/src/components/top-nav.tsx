// 257:0 0:1 0:10
import { useLocation, Link } from "wouter";
import { Zap, Shield, Palette, Check, Archive, Network, Images, FileSearch, Sun, Moon, Monitor, Cpu, Clock, BookOpen } from "lucide-react";
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
import { useQuery } from "@tanstack/react-query";

interface BuildInfo {
  commit_hash: string;
  commit_subject: string;
  committed_at: string;
  boot_at: number;
}

function useRelativeTime(iso: string | number | undefined): string {
  if (!iso) return "";
  const ts = typeof iso === "number" ? iso * 1000 : new Date(iso).getTime();
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function LastUpdatedWidget() {
  const { isWs, isAdmin } = useBillingStatus();
  const { data } = useQuery<BuildInfo>({
    queryKey: ["/api/v1/system/build-info"],
    staleTime: 5 * 60 * 1000,
    enabled: isWs || isAdmin,
  });
  const deployedAgo = useRelativeTime(data?.committed_at);
  const bootAgo = useRelativeTime(data?.boot_at);
  if (!isWs && !isAdmin) return null;
  if (!data) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="flex flex-col items-center justify-center px-2 min-h-[44px] gap-0.5 text-muted-foreground hover:text-foreground transition-colors"
          data-testid="button-last-updated"
          aria-label="Last updated info"
        >
          <Clock className="w-4 h-4" />
          <span className="text-[10px] font-mono leading-none">{deployedAgo}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-3 space-y-2" data-testid="popover-last-updated">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
          Last updated
        </div>
        <div className="space-y-1.5">
          <div className="flex items-start gap-2">
            <span className="text-[11px] text-muted-foreground w-14 shrink-0">deploy</span>
            <span className="text-[12px] font-mono text-foreground break-all leading-snug">
              {data.commit_hash}
            </span>
            <span className="text-[11px] text-muted-foreground shrink-0 ml-auto">{deployedAgo}</span>
          </div>
          {data.commit_subject && (
            <div className="flex items-start gap-2">
              <span className="text-[11px] text-muted-foreground w-14 shrink-0"></span>
              <span className="text-[11px] text-muted-foreground leading-snug line-clamp-2">
                {data.commit_subject}
              </span>
            </div>
          )}
          <div className="flex items-center gap-2 pt-0.5 border-t border-border">
            <span className="text-[11px] text-muted-foreground w-14 shrink-0">boot</span>
            <span className="text-[11px] text-muted-foreground">{bootAgo}</span>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

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
  const { tier, tierLabel, isWs, isAdmin } = useBillingStatus();
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
      {(isWs || isAdmin) && (
        <Link
          href="/docs"
          className={cn(
            "flex flex-col items-center justify-center px-2 min-h-[44px] py-2 gap-0.5 transition-colors select-none",
            location === "/docs" ? "text-primary" : "text-muted-foreground hover:text-foreground"
          )}
          data-testid="nav-docs"
          aria-label="Docs"
        >
          <BookOpen className={cn("w-5 h-5", location === "/docs" && "drop-shadow-[0_0_6px_hsl(var(--primary))]")} />
          <span className="text-[11px] font-medium leading-none">Docs</span>
        </Link>
      )}
      <LastUpdatedWidget />
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
// 257:0 0:1 0:10
