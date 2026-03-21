import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Activity, Brain, Clock, DollarSign, Heart, MessageSquare, Zap } from "lucide-react";

export function StatusTab() {
  const { data: stats, isLoading: statsLoading } = useQuery<any>({
    queryKey: ["/api/v1/heartbeat/stats"],
    refetchInterval: 10000,
  });
  const { data: heartbeatStatus } = useQuery<{ running: boolean; tickIntervalMs: number }>({
    queryKey: ["/api/v1/heartbeat/status"],
    refetchInterval: 10000,
  });
  const { data: metricsData } = useQuery<any>({
    queryKey: ["/api/v1/metrics/spend"],
    refetchInterval: 15000,
  });
  const { data: seeds = [] } = useQuery<any[]>({
    queryKey: ["/api/v1/memory/seeds"],
    refetchInterval: 30000,
  });
  const { data: conversations = [] } = useQuery<any[]>({
    queryKey: ["/api/conversations"],
    staleTime: 30000,
  });

  const healthItems = [
    {
      label: "Heartbeat",
      value: heartbeatStatus?.running ? "Running" : "Stopped",
      ok: heartbeatStatus?.running ?? false,
      icon: Heart,
      detail: heartbeatStatus?.tickIntervalMs ? `${heartbeatStatus.tickIntervalMs / 1000}s interval` : "",
    },
    {
      label: "Active Convs",
      value: String(conversations.length),
      ok: true,
      icon: MessageSquare,
      detail: "total stored",
    },
    {
      label: "Memory Seeds",
      value: String(seeds.length),
      ok: seeds.length > 0,
      icon: Brain,
      detail: `${seeds.filter((s: any) => s.label).length} labeled`,
    },
    {
      label: "Heartbeat Runs",
      value: String(stats?.heartbeatRuns ?? "—"),
      ok: (stats?.heartbeatRuns ?? 0) > 0,
      icon: Activity,
      detail: "total scheduled runs",
    },
    {
      label: "EDCM Snapshots",
      value: String(stats?.edcmSnapshots ?? "—"),
      ok: true,
      icon: Zap,
      detail: "stored evaluations",
    },
    {
      label: "API Spend Today",
      value: metricsData?.today != null ? `$${Number(metricsData.today).toFixed(4)}` : "—",
      ok: metricsData?.today != null ? Number(metricsData.today) < 1 : true,
      icon: DollarSign,
      detail: "estimated cost",
    },
  ];

  return (
    <div className="h-full w-full overflow-y-auto overflow-x-hidden px-3 py-3 space-y-4">
      <div className="flex items-center gap-2">
        <Activity className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold" data-testid="text-status-title">Runtime Status</h3>
        <Badge variant="outline" className="text-xs ml-auto">
          {heartbeatStatus?.running ? "Live" : "Idle"}
        </Badge>
      </div>

      {statsLoading ? (
        <div className="grid grid-cols-2 gap-2">
          {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {healthItems.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.label}
                className="rounded-lg border border-border bg-card p-3 space-y-1"
                data-testid={`status-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{item.label}</span>
                  </div>
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${item.ok ? "bg-green-500" : "bg-red-500"}`} />
                </div>
                <div className="text-base font-semibold">{item.value}</div>
                {item.detail && <div className="text-xs text-muted-foreground">{item.detail}</div>}
              </div>
            );
          })}
        </div>
      )}

      {stats && (
        <div className="rounded-lg border border-border bg-card p-3 space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Activity Summary</h4>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            {[
              ["Transcripts", stats.transcripts],
              ["Events", stats.events],
              ["Drafts", stats.drafts],
              ["Promotions", stats.promotions],
              ["Memory Snapshots", stats.memorySnapshots],
            ].map(([label, val]) => (
              <div key={String(label)} className="flex justify-between">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-medium">{val ?? "—"}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
