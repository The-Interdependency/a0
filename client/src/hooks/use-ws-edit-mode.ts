// 62:0
import { createContext, useContext, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { FRONTEND_EDITABLE_SCHEMA, type FrontendEditableField } from "@/lib/editable-registry";

export interface BackendEditableField {
  key: string;
  label: string;
  description: string;
  controlType: "text" | "select" | "textarea" | "toggle";
  module: string;
  getEndpoint: string;
  patchEndpoint: string;
  queryKey: string;
  options: string[];
}

export type AnyEditableField =
  | (BackendEditableField & { source: "backend" })
  | (FrontendEditableField & { source: "frontend" });

export interface WsEditContextValue {
  editMode: boolean;
  toggleEditMode: () => void;
  schema: Map<string, AnyEditableField>;
  schemaLoading: boolean;
}

export const WsEditContext = createContext<WsEditContextValue>({
  editMode: false,
  toggleEditMode: () => {},
  schema: new Map(),
  schemaLoading: false,
});

export function useWsEditMode(): WsEditContextValue {
  return useContext(WsEditContext);
}

export function useWsEditModeProvider(isWs: boolean) {
  const [editMode, setEditMode] = useState(false);
  const [fetchEnabled, setFetchEnabled] = useState(false);

  const { data: backendFields, isLoading } = useQuery<BackendEditableField[]>({
    queryKey: ["/api/v1/editable-schema/index"],
    enabled: fetchEnabled && isWs,
    staleTime: 60_000,
  });

  const toggleEditMode = useCallback(() => {
    if (!isWs) return;
    setEditMode((prev) => {
      const next = !prev;
      if (next) setFetchEnabled(true);
      return next;
    });
  }, [isWs]);

  const schema = new Map<string, AnyEditableField>();
  for (const f of FRONTEND_EDITABLE_SCHEMA) {
    schema.set(f.key, { ...f, source: "frontend" as const });
  }
  for (const f of backendFields ?? []) {
    schema.set(f.key, { ...f, source: "backend" as const });
  }

  return {
    editMode: editMode && isWs,
    toggleEditMode,
    schema,
    schemaLoading: isLoading,
  };
}
// 62:0
