import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Download, FileSearch, RefreshCw } from "lucide-react";

const DOMAINS = ["all", "omega_autonomy", "psi_selfmodel", "heartbeat", "bandit", "synthesis", "omega", "psi"];

export function AuditTab() {
  const [page, setPage] = useState(1);
  const [domain, setDomain] = useState("all");
  const [search, setSearch] = useState("");
  const PAGE_SIZE = 50;

  const queryKey = `/api/v1/audit?page=${page}&domain=${encodeURIComponent(domain)}&search=${encodeURIComponent(search)}`;

  const { data, isLoading, refetch, isFetching } = useQuery<{ logs: any[]; total: number }>({
    queryKey: [queryKey],
    staleTime: 10000,
  });

  const logs = data?.logs || [];
  const total = data?.total || 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function exportCsv() {
    if (!logs.length) return;
    const headers = ["id", "domain", "event", "createdAt", "params"];
    const rows = logs.map(l => [
      l.id, l.domain, l.event,
      l.createdAt,
      JSON.stringify(l.params || {}).replace(/"/g, '""'),
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const domainColor: Record<string, string> = {
    omega_autonomy: "bg-blue-500/10 text-blue-600",
    omega: "bg-blue-500/10 text-blue-600",
    psi_selfmodel: "bg-purple-500/10 text-purple-600",
    psi: "bg-purple-500/10 text-purple-600",
    heartbeat: "bg-green-500/10 text-green-600",
    bandit: "bg-orange-500/10 text-orange-600",
    synthesis: "bg-pink-500/10 text-pink-600",
    system: "bg-slate-500/10 text-slate-600",
  };

  return (
    <div className="h-full w-full overflow-y-auto overflow-x-hidden px-3 py-3 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <FileSearch className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold" data-testid="text-audit-title">Audit Log</h3>
        <Badge variant="outline" className="text-xs ml-auto">{total} events</Badge>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={() => refetch()}
          disabled={isFetching}
          data-testid="button-audit-refresh"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={exportCsv}
          disabled={logs.length === 0}
          data-testid="button-audit-export"
        >
          <Download className="w-3.5 h-3.5 mr-1" />CSV
        </Button>
      </div>

      <div className="flex gap-2">
        <Select value={domain} onValueChange={v => { setDomain(v); setPage(1); }}>
          <SelectTrigger className="h-7 text-xs w-36" data-testid="select-audit-domain">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DOMAINS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input
          className="h-7 text-xs flex-1"
          placeholder="Search event…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          data-testid="input-audit-search"
        />
      </div>

      {isLoading ? (
        <div className="space-y-1.5">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12" />)}</div>
      ) : logs.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-8">No audit events found.</p>
      ) : (
        <div className="space-y-1">
          {logs.map((log, idx) => (
            <div
              key={log.id || idx}
              className="rounded border border-border bg-card px-3 py-2 space-y-0.5"
              data-testid={`audit-row-${log.id}`}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <Badge
                  variant="secondary"
                  className={`text-xs ${domainColor[log.domain] || ""}`}
                >
                  {log.domain}
                </Badge>
                <span className="text-xs font-medium">{log.event}</span>
                <span className="text-xs text-muted-foreground ml-auto">
                  {log.createdAt ? new Date(log.createdAt).toLocaleString() : ""}
                </span>
              </div>
              {log.params && Object.keys(log.params).length > 0 && (
                <p className="text-xs text-muted-foreground font-mono truncate">
                  {JSON.stringify(log.params).slice(0, 120)}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {pageCount > 1 && (
        <div className="flex items-center justify-between">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            data-testid="button-audit-prev"
          >
            Prev
          </Button>
          <span className="text-xs text-muted-foreground">Page {page} / {pageCount}</span>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => setPage(p => Math.min(pageCount, p + 1))}
            disabled={page >= pageCount}
            data-testid="button-audit-next"
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
