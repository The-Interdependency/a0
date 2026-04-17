// 99:0
import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import TabShell from "@/components/TabShell";
import FieldRenderer from "@/components/FieldRenderer";
import type { TabDef, SectionDef } from "@/hooks/use-ui-structure";

function hasTemplateParams(endpoint: string): boolean {
  return /\{[^}]+\}/.test(endpoint);
}

function SectionRenderer({ section }: { section: SectionDef }) {
  const isTemplated = hasTemplateParams(section.endpoint);
  // Stable, unique key per section so different sections targeting the same
  // endpoint don't collide. Explicit queryFn keeps the URL = section.endpoint
  // (the default fetcher would otherwise concatenate the whole key as a URL).
  const { data, isLoading, error } = useQuery<unknown>({
    queryKey: ["section-data", section.id, section.endpoint],
    queryFn: async () => {
      const res = await fetch(section.endpoint, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${(await res.text()) || res.statusText}`);
      return res.json();
    },
    refetchInterval: section.refresh_ms ?? 30_000,
    enabled: !isTemplated,
  });

  if (isTemplated) {
    return (
      <div className="text-xs text-muted-foreground py-4 text-center italic" data-testid={`section-templated-${section.id}`}>
        Select an item to view {section.label.toLowerCase()}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8" data-testid={`section-loading-${section.id}`}>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return (
      <div className="text-xs text-destructive p-2" data-testid={`section-error-${section.id}`}>
        {msg}
      </div>
    );
  }

  const rows: Record<string, unknown>[] = Array.isArray(data)
    ? data
    : data && typeof data === "object"
      ? [data as Record<string, unknown>]
      : [];

  if (rows.length === 0) {
    return (
      <div className="text-xs text-muted-foreground py-4 text-center" data-testid={`section-empty-${section.id}`}>
        No data
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid={`section-${section.id}`}>
      {rows.map((row, ri) => (
        <Card key={ri} className="p-3">
          <div className="flex flex-col gap-2">
            {section.fields.map((field) => (
              <FieldRenderer key={field.key} field={field} data={row} />
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

interface TabRendererProps {
  tab: TabDef;
}

export default function TabRenderer({ tab }: TabRendererProps) {
  const qc = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all(
      tab.sections.map((s) =>
        qc.invalidateQueries({ queryKey: ["section-data", s.id, s.endpoint] })
      )
    );
    setIsRefreshing(false);
  }, [tab.sections, qc]);

  return (
    <TabShell
      label={tab.label}
      icon={tab.icon}
      onRefresh={handleRefresh}
      isRefreshing={isRefreshing}
    >
      <div className="flex flex-col gap-6">
        {tab.sections.map((section, i) => (
          <div key={section.id}>
            {i > 0 && <Separator className="mb-4" />}
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3" data-testid={`section-header-${section.id}`}>
              {section.label}
            </h3>
            <SectionRenderer section={section} />
          </div>
        ))}
      </div>
    </TabShell>
  );
}
// 99:0
