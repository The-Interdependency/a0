// 178:0
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Loader2, BookOpen, ChevronRight } from "lucide-react";

interface Endpoint {
  method: string;
  path: string;
  description: string;
}

interface DocEntry {
  module: string;
  label: string;
  description: string;
  tier: string;
  endpoints: Endpoint[];
  notes?: string[];
  code_lines?: number;
  comment_lines?: number;
}

function tierVariant(tier: string): string {
  switch (tier) {
    case "admin":   return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    case "ws":      return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
    case "pro":     return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400";
    case "founder": return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
    default:        return "bg-muted text-muted-foreground";
  }
}

function methodColor(method: string): string {
  switch (method.toUpperCase()) {
    case "GET":    return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
    case "POST":   return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
    case "PATCH":  return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
    case "PUT":    return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";
    case "DELETE": return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    default:       return "bg-muted text-muted-foreground";
  }
}

function ModuleDetail({ entry }: { entry: DocEntry }) {
  return (
    <div className="flex flex-col gap-5 p-6 overflow-y-auto h-full">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <h2 className="text-lg font-semibold text-foreground" data-testid="docs-module-label">
          {entry.label}
        </h2>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${tierVariant(entry.tier)}`} data-testid="docs-tier-badge">
            {entry.tier}
          </span>
          {entry.code_lines !== undefined && (
            <span
              className="text-xs font-mono px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
              title="code lines : comment lines"
              data-testid="docs-ratio-badge"
            >
              {entry.code_lines}:{entry.comment_lines ?? 0}
            </span>
          )}
        </div>
      </div>

      <p className="text-sm text-muted-foreground leading-relaxed" data-testid="docs-description">
        {entry.description}
      </p>

      {entry.endpoints.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Endpoints
          </h3>
          <div className="rounded-md border border-border overflow-hidden">
            <table className="w-full text-sm" data-testid="docs-endpoint-table">
              <tbody>
                {entry.endpoints.map((ep, i) => (
                  <tr
                    key={i}
                    className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors"
                    data-testid={`docs-endpoint-${i}`}
                  >
                    <td className="px-3 py-2 w-16 shrink-0">
                      <span className={`text-xs font-mono font-semibold px-1.5 py-0.5 rounded ${methodColor(ep.method)}`}>
                        {ep.method}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-foreground whitespace-nowrap">
                      {ep.path}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {ep.description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {entry.notes && entry.notes.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Notes
          </h3>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            {entry.notes.map((n, i) => (
              <li key={i} data-testid={`docs-note-${i}`}>{n}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function DocsTab() {
  const { data, isLoading, error } = useQuery<DocEntry[]>({
    queryKey: ["/api/v1/docs"],
  });

  const [selected, setSelected] = useState<string | null>(null);

  const entries = data ?? [];
  const activeModule = selected
    ? entries.find((e) => e.module === selected)
    : entries[0];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full" data-testid="docs-loading">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-destructive text-sm" data-testid="docs-error">
        Failed to load documentation
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm" data-testid="docs-empty">
        No module documentation found
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden" data-testid="docs-tab">
      <div className="w-44 shrink-0 border-r border-border flex flex-col overflow-y-auto" data-testid="docs-sidebar">
        <div className="px-3 py-3 border-b border-border flex items-center gap-2 shrink-0">
          <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Modules</span>
        </div>
        {entries.map((entry) => {
          const isActive = (selected ?? entries[0]?.module) === entry.module;
          return (
            <button
              key={entry.module}
              onClick={() => setSelected(entry.module)}
              className={`w-full text-left px-3 py-2.5 text-sm flex items-center justify-between gap-1 transition-colors ${
                isActive
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              }`}
              data-testid={`docs-nav-${entry.module}`}
            >
              <span className="truncate">{entry.label}</span>
              {isActive && <ChevronRight className="h-3 w-3 shrink-0" />}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-hidden">
        {activeModule ? (
          <ModuleDetail entry={activeModule} />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Select a module
          </div>
        )}
      </div>
    </div>
  );
}
// 178:0
