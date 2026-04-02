import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import TabShell from "@/components/TabShell";
import FieldRenderer from "@/components/FieldRenderer";
import type { TabDef, SectionDef } from "@/hooks/use-ui-structure";

function SectionRenderer({ section }: { section: SectionDef }) {
  const { data, isLoading, error } = useQuery<unknown>({
    queryKey: [section.endpoint],
    refetchInterval: section.refresh_ms ?? 30_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8" data-testid={`section-loading-${section.id}`}>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-xs text-destructive p-2" data-testid={`section-error-${section.id}`}>
        {(error as Error).message}
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
      tab.sections.map((s) => qc.invalidateQueries({ queryKey: [s.endpoint] }))
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
