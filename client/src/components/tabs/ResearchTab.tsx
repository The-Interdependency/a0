import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useState } from "react";
import { ChevronDown, ChevronRight, Target } from "lucide-react";

type LogEntry = { timestamp: string; stream: string; subsystem: string; event: string; data?: any };

export function ResearchTab() {
  const [expanded, setExpanded] = useState<number | null>(null);

  const { data, isLoading } = useQuery<{ entries: LogEntry[]; total: number }>({
    queryKey: ["/api/v1/logs/master"],
    staleTime: 15000,
  });

  const runs = (data?.entries || []).filter(l =>
    l.stream === "synthesis" || l.subsystem?.includes("synthesis") ||
    l.event?.includes("research") || l.event?.includes("compete") ||
    l.event?.includes("hub_run") || l.event?.includes("brain_run")
  );

  return (
    <div className="h-full w-full overflow-y-auto overflow-x-hidden px-3 py-3 space-y-3">
      <div className="flex items-center gap-2">
        <Target className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold" data-testid="text-research-title">Research Runs</h3>
        <Badge variant="outline" className="text-xs ml-auto">{runs.length}</Badge>
      </div>

      {isLoading && <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-14" />)}</div>}

      {!isLoading && runs.length === 0 && (
        <div className="text-center py-12 space-y-2">
          <Target className="w-8 h-8 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">No research runs yet.</p>
          <p className="text-xs text-muted-foreground">Research and synthesis events will appear here as the agent runs tasks.</p>
        </div>
      )}

      {!isLoading && runs.map((log, idx) => (
        <div
          key={idx}
          className="rounded-lg border border-border bg-card"
          data-testid={`run-${idx}`}
        >
          <div
            className="flex items-center gap-2 p-3 cursor-pointer"
            onClick={() => setExpanded(prev => prev === idx ? null : idx)}
          >
            {expanded === idx
              ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            }
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">{log.stream}</Badge>
                <span className="text-xs font-medium truncate">{log.event}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {log.timestamp ? new Date(log.timestamp).toLocaleString() : ""}
              </p>
            </div>
          </div>
          {expanded === idx && log.data && (
            <div className="border-t border-border p-3">
              <pre className="text-xs font-mono bg-muted/30 rounded p-2 overflow-x-auto max-h-48 text-muted-foreground">
                {JSON.stringify(log.data, null, 2).slice(0, 1000)}
              </pre>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
