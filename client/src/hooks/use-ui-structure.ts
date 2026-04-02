import { useQuery } from "@tanstack/react-query";

export interface FieldDef {
  key: string;
  type: "gauge" | "text" | "badge" | "list" | "timeline" | "sparkline" | "json";
  label: string;
}

export interface SectionDef {
  id: string;
  label: string;
  endpoint: string;
  refresh_ms?: number;
  fields: FieldDef[];
}

export interface TabDef {
  tab_id: string;
  label: string;
  icon: string;
  order: number;
  sections: SectionDef[];
}

export interface UiStructure {
  tabs: TabDef[];
  agent: string;
  version: string;
}

export function useUiStructure() {
  return useQuery<UiStructure>({
    queryKey: ["/api/v1/ui/structure"],
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}
