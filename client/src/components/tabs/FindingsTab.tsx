import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useState } from "react";
import { ChevronDown, ChevronRight, BookOpen } from "lucide-react";

type LogEntry = { timestamp: string; stream: string; subsystem: string; event: string; data?: any };

function normalizeFinding(l: LogEntry, idx: number) {
  const d = l.data || {};
  return {
    id: idx,
    createdAt: l.timestamp,
    domain: l.subsystem || l.stream,
    synthesis: d.synthesis || d.summary || d.result || "",
    claims: Array.isArray(d.claims) ? d.claims : [],
    title: d.title || d.query || l.event,
    params: d,
  };
}

export function FindingsTab() {
  const [expanded, setExpanded] = useState<number | null>(null);

  const { data, isLoading } = useQuery<LogEntry[]>({
    queryKey: ["/api/v1/research/findings"],
    staleTime: 15000,
  });

  const rawEntries = Array.isArray(data) ? data : [];
  const findings = rawEntries.map(normalizeFinding);

  return (
    <div className="h-full w-full overflow-y-auto overflow-x-hidden px-3 py-3 space-y-3">
      <div className="flex items-center gap-2">
        <BookOpen className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold" data-testid="text-findings-title">Research Findings</h3>
        <Badge variant="outline" className="text-xs ml-auto">{findings.length}</Badge>
      </div>

      {isLoading && <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-20" />)}</div>}

      {!isLoading && findings.length === 0 && (
        <div className="text-center py-12 space-y-2">
          <BookOpen className="w-8 h-8 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">No research findings yet.</p>
          <p className="text-xs text-muted-foreground">Run a research loop to generate synthesis findings.</p>
        </div>
      )}

      {!isLoading && findings.map(f => {
        const id = f.id;
        const title = f.title || f.domain || `Finding ${id}`;
        const synthesis = f.synthesis;
        const claims: string[] = f.claims;
        const date = f.createdAt ? new Date(f.createdAt).toLocaleString() : "";
        return (
          <div
            key={id}
            className="rounded-lg border border-border bg-card"
            data-testid={`finding-${id}`}
          >
            <div
              className="flex items-center gap-2 p-3 cursor-pointer"
              onClick={() => setExpanded(prev => prev === id ? null : id)}
            >
              {expanded === id
                ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              }
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{title}</p>
                <p className="text-xs text-muted-foreground">{date}</p>
              </div>
              {claims.length > 0 && (
                <Badge variant="secondary" className="text-xs flex-shrink-0">{claims.length} claims</Badge>
              )}
            </div>
            {expanded === id && (
              <div className="border-t border-border p-3 space-y-3">
                {synthesis && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Synthesis</p>
                    <ScrollArea className="max-h-48">
                      <p className="text-xs whitespace-pre-wrap">{synthesis}</p>
                    </ScrollArea>
                  </div>
                )}
                {claims.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Claims</p>
                    <ul className="space-y-1">
                      {claims.map((claim, i) => (
                        <li key={i} className="text-xs text-muted-foreground flex gap-2">
                          <span className="text-primary flex-shrink-0">{i + 1}.</span>
                          <span>{claim}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {!synthesis && claims.length === 0 && (
                  <pre className="text-xs font-mono text-muted-foreground overflow-x-auto">
                    {JSON.stringify(f.params || {}, null, 2).slice(0, 500)}
                  </pre>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
