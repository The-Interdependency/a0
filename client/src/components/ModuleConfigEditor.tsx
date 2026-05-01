// 192:1
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Save, Lock } from "lucide-react";

// DOC tab: module_config — registered in CUSTOM_TAB_RENDERERS (console.tsx)

interface ModuleConfigRow {
  id: number;
  slug: string;
  name: string;
  status: string;
  route_config: Record<string, unknown>;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  inactive: "outline",
  system: "secondary",
  locked: "outline",
  error: "destructive",
};

function ConfigEditor({ mod }: { mod: ModuleConfigRow }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const isReadOnly = mod.status === "system";
  const isLocked = mod.status === "locked";

  const [configStr, setConfigStr] = useState(
    JSON.stringify(mod.route_config, null, 2)
  );
  const [jsonError, setJsonError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async () => {
      setJsonError(null);
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(configStr);
      } catch {
        setJsonError("Invalid JSON — fix before saving");
        throw new Error("JSON parse error");
      }
      const tokenRes = await apiRequest(
        "GET",
        `/api/v1/modules/config/${mod.id}/write-token`
      );
      const { token } = await tokenRes.json();
      await apiRequest("PATCH", `/api/v1/modules/config/${mod.id}`, {
        route_config: parsed,
        write_token: token,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/v1/modules/config"] });
      toast({ title: "Config saved", description: mod.slug });
    },
    onError: (e: Error) => {
      if (!jsonError) {
        toast({
          title: "Save failed",
          description: e.message,
          variant: "destructive",
        });
      }
    },
  });

  return (
    <div
      className="flex flex-col gap-3 h-full"
      data-testid={`config-editor-${mod.id}`}
    >
      <div className="flex items-center gap-2 shrink-0 flex-wrap">
        <span className="text-sm font-semibold text-foreground truncate max-w-[160px]">
          {mod.name}
        </span>
        <span className="text-xs font-mono text-muted-foreground">
          {mod.slug}
        </span>
        <Badge
          variant={STATUS_VARIANT[mod.status] ?? "outline"}
          className="ml-auto text-[10px]"
        >
          {mod.status}
        </Badge>
      </div>

      {isReadOnly && (
        <p className="text-xs text-muted-foreground italic shrink-0">
          System modules are read-only.
        </p>
      )}
      {isLocked && (
        <p className="text-xs text-amber-500 flex items-center gap-1 shrink-0">
          <Lock className="w-3 h-3" />
          Locked — unlock in the Modules tab first.
        </p>
      )}

      <Textarea
        value={configStr}
        onChange={(e) => {
          setConfigStr(e.target.value);
          setJsonError(null);
        }}
        readOnly={isReadOnly || isLocked}
        className="flex-1 font-mono text-xs resize-none min-h-[200px]"
        data-testid={`textarea-config-${mod.id}`}
      />

      {jsonError && (
        <p
          className="text-xs text-destructive shrink-0"
          data-testid="config-json-error"
        >
          {jsonError}
        </p>
      )}

      {!isReadOnly && !isLocked && (
        <div className="flex justify-end shrink-0">
          <Button
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            data-testid={`btn-save-config-${mod.id}`}
          >
            {saveMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            <span className="ml-1.5">
              {saveMutation.isPending ? "Saving…" : "Save Config"}
            </span>
          </Button>
        </div>
      )}
    </div>
  );
}

export default function ModuleConfigEditor() {
  const { data: modules = [], isLoading } = useQuery<ModuleConfigRow[]>({
    queryKey: ["/api/v1/modules/config"],
    staleTime: 30_000,
  });

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected =
    modules.find((m) => m.id === selectedId) ?? modules[0] ?? null;

  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center h-full"
        data-testid="module-config-loading"
      >
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div
      className="flex h-full overflow-hidden"
      data-testid="module-config-editor"
    >
      <div className="w-52 shrink-0 border-r border-border overflow-y-auto">
        {modules.map((mod) => (
          <button
            key={mod.id}
            onClick={() => setSelectedId(mod.id)}
            className={`w-full text-left px-3 py-2.5 border-b border-border text-xs transition-colors ${
              selected?.id === mod.id
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
            data-testid={`module-config-item-${mod.id}`}
          >
            <div className="font-mono truncate">{mod.slug}</div>
            <div className="truncate text-[10px] opacity-70 mt-0.5">
              {mod.name}
            </div>
          </button>
        ))}
        {modules.length === 0 && (
          <p className="p-3 text-xs text-muted-foreground">No modules found.</p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {selected ? (
          <ConfigEditor key={selected.id} mod={selected} />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p className="text-sm">Select a module</p>
          </div>
        )}
      </div>
    </div>
  );
}
// 192:1
