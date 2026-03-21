import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle, DollarSign, X, Zap } from "lucide-react";

type AlertItem = {
  id: string;
  type: "error" | "warning" | "info";
  title: string;
  body: string;
  ts: number;
};

function classifyLogs(entries: any[]): AlertItem[] {
  const alerts: AlertItem[] = [];
  for (const log of entries.slice(0, 200)) {
    const subsystem = log.subsystem || log.stream || log.domain || "";
    const event = log.event || "";
    const data = log.data || log.params || {};
    const ts = log.timestamp || log.createdAt;
    const tsMs = ts ? new Date(ts).getTime() : Date.now();
    const isHeartbeat = subsystem.includes("heartbeat") || log.stream === "heartbeat" || subsystem.includes("omega") || subsystem.includes("psi");
    if (event === "task_error" || event === "goal_pursuit_error" || (data.error && isHeartbeat)) {
      alerts.push({
        id: `${log.id || (ts + event)}-err`,
        type: "error",
        title: `Agent Error — ${event}`,
        body: String(data.error || data.message || JSON.stringify(data).slice(0, 120)),
        ts: tsMs,
      });
    } else if (event === "spend_limit_warning") {
      alerts.push({
        id: `${log.id || (ts + event)}-spend`,
        type: "warning",
        title: "Spend Limit Warning",
        body: `Spend at ${data.percent ?? "?"}% of limit ($${data.spent ?? "?"} / $${data.limit ?? "?"})`,
        ts: tsMs,
      });
    } else if (event === "tool_error" || event === "tool_call_failed") {
      alerts.push({
        id: `${log.id || (ts + event)}-tool`,
        type: "warning",
        title: `Tool Failure — ${data.tool || data.name || "unknown"}`,
        body: String(data.error || data.message || JSON.stringify(data).slice(0, 120)),
        ts: tsMs,
      });
    } else if (event.includes("error") && event !== "sentinel_gate") {
      alerts.push({
        id: `${log.id || (ts + event)}-gen`,
        type: "warning",
        title: `${subsystem} — ${event}`,
        body: String(data.error || data.message || JSON.stringify(data).slice(0, 120)),
        ts: tsMs,
      });
    }
  }
  return alerts.sort((a, b) => b.ts - a.ts).slice(0, 30);
}

export function AlertsTab() {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const { data: logData, isLoading } = useQuery<{ entries: any[]; total: number }>({
    queryKey: ["/api/v1/logs/master"],
    refetchInterval: 15000,
  });

  const { data: spendData } = useQuery<any>({
    queryKey: ["/api/v1/metrics/spend"],
    refetchInterval: 30000,
  });

  const rawAlerts = logData?.entries ? classifyLogs(logData.entries) : [];

  if (spendData?.limitUsd && spendData?.totalAll) {
    const pct = (spendData.totalAll / spendData.limitUsd) * 100;
    if (pct >= 80) {
      rawAlerts.unshift({
        id: "spend-global",
        type: pct >= 95 ? "error" : "warning",
        title: `Spend ${pct.toFixed(0)}% of limit`,
        body: `$${Number(spendData.totalAll).toFixed(4)} of $${spendData.limitUsd} limit used`,
        ts: Date.now(),
      });
    }
  }

  const dismissedArr = Array.from(dismissed);
  const alerts = rawAlerts.filter(a => !dismissedArr.includes(a.id));

  function dismiss(id: string) {
    setDismissed(prev => new Set(Array.from(prev).concat(id)));
  }

  const iconFor = (type: AlertItem["type"]) => {
    if (type === "error") return <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />;
    if (type === "warning") return <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />;
    return <Zap className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />;
  };

  const badgeFor = (type: AlertItem["type"]) => {
    if (type === "error") return <Badge variant="destructive" className="text-xs">Error</Badge>;
    if (type === "warning") return <Badge className="text-xs bg-amber-500 hover:bg-amber-500">Warning</Badge>;
    return <Badge variant="secondary" className="text-xs">Info</Badge>;
  };

  return (
    <div className="h-full w-full overflow-y-auto overflow-x-hidden px-3 py-3 space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-500" />
        <h3 className="text-sm font-semibold" data-testid="text-alerts-title">Runtime Alerts</h3>
        {alerts.length > 0 && (
          <Badge variant="destructive" className="text-xs ml-auto">{alerts.length}</Badge>
        )}
        {dismissed.size > 0 && (
          <Button
            size="sm"
            variant="ghost"
            className="text-xs h-6 ml-1"
            onClick={() => setDismissed(new Set())}
            data-testid="button-alerts-restore"
          >
            Restore {dismissed.size}
          </Button>
        )}
      </div>

      {isLoading && (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-16" />)}
        </div>
      )}

      {!isLoading && alerts.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
          <CheckCircle className="w-8 h-8 text-green-500" />
          <span className="text-sm">No active alerts</span>
        </div>
      )}

      {!isLoading && alerts.map((alert) => (
        <div
          key={alert.id}
          className="rounded-lg border border-border bg-card p-3 flex gap-3"
          data-testid={`alert-${alert.type}`}
        >
          {iconFor(alert.type)}
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              {badgeFor(alert.type)}
              <span className="text-xs font-medium">{alert.title}</span>
            </div>
            <p className="text-xs text-muted-foreground break-words">{alert.body}</p>
            <p className="text-xs text-muted-foreground">{new Date(alert.ts).toLocaleString()}</p>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 flex-shrink-0"
            onClick={() => dismiss(alert.id)}
            data-testid={`button-dismiss-${alert.id}`}
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      ))}
    </div>
  );
}
