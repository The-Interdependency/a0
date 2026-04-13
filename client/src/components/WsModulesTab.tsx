// 353:0
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useBillingStatus } from "@/hooks/use-billing-status";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Blocks, Lock, LockOpen, ChevronRight, X, AlertTriangle, Shield, Eye, Zap, Plus,
} from "lucide-react";
import UiMetaFieldEditor from "@/components/UiMetaFieldEditor";
import NewModulePanel from "@/components/NewModulePanel";

interface WsModule {
  id: number;
  slug: string;
  name: string;
  description: string;
  owner_id: string;
  status: "system" | "active" | "inactive" | "locked" | "error";
  ui_meta: Record<string, unknown>;
  route_config: Record<string, unknown>;
  handler_code?: string | null;
  error_log: string | null;
  version: number;
  content_hash: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  system:   { label: "system",   variant: "secondary" },
  active:   { label: "active",   variant: "default" },
  inactive: { label: "inactive", variant: "outline" },
  locked:   { label: "locked",   variant: "secondary" },
  error:    { label: "error",    variant: "destructive" },
};

const WS_TIERS = new Set(["ws", "pro", "admin"]);

function fmtTs(iso: string) {
  try { return new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }); }
  catch { return iso; }
}

function canWrite(mod: WsModule, userId: string | null, isAdmin: boolean): boolean {
  if (mod.status === "system") return false;
  if (mod.status === "locked") return isAdmin || mod.owner_id === userId;
  return isAdmin || mod.owner_id === userId;
}

function ModuleEditor({
  mod, userId, isAdmin, onClose,
}: { mod: WsModule; userId: string | null; isAdmin: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const isSystem = mod.status === "system";
  const isLocked = mod.status === "locked";
  const writeable = canWrite(mod, userId, isAdmin) && !isLocked;

  const [name, setName] = useState(mod.name);
  const [description, setDescription] = useState(mod.description);
  const [handlerCode, setHandlerCode] = useState(mod.handler_code ?? "");
  const [uiMetaStr, setUiMetaStr] = useState(JSON.stringify(mod.ui_meta || {}, null, 2));
  const [routeConfigStr, setRouteConfigStr] = useState(JSON.stringify(mod.route_config || {}, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);

  const validateJson = (str: string, field: string): Record<string, unknown> | null => {
    try { return JSON.parse(str); }
    catch { setJsonError(`${field} is not valid JSON`); return null; }
  };

  const lockMutation = useMutation({
    mutationFn: async (locked: boolean) =>
      apiRequest("PATCH", `/api/v1/ws/modules/${mod.id}/lock`, { locked }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/ws/modules"] });
      toast({ title: isLocked ? "Module unlocked" : "Module locked" });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Lock toggle failed", description: e.message, variant: "destructive" }),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      setJsonError(null);
      const uiMeta = validateJson(uiMetaStr, "UI Meta");
      if (!uiMeta) throw new Error("JSON validation failed");
      const routeConfig = validateJson(routeConfigStr, "Route Config");
      if (!routeConfig) throw new Error("JSON validation failed");
      const tokenRes = await apiRequest("GET", `/api/v1/ws/modules/${mod.id}/write-token`);
      const { token } = await tokenRes.json();
      return apiRequest("PATCH", `/api/v1/ws/modules/${mod.id}`, {
        name, description, handler_code: handlerCode || null,
        ui_meta: uiMeta, route_config: routeConfig, write_token: token,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/ws/modules"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/ui/structure"] });
      toast({ title: "Module saved", description: `v${(mod.version || 1) + 1}` });
      onClose();
    },
    onError: (e: Error) => {
      if (!jsonError) toast({ title: "Save failed", description: e.message, variant: "destructive" });
    },
  });

  const swapMutation = useMutation({
    mutationFn: async () => {
      const tokenRes = await apiRequest("GET", `/api/v1/ws/modules/${mod.id}/write-token`);
      const { token } = await tokenRes.json();
      const res = await apiRequest("POST", `/api/v1/ws/modules/${mod.id}/swap`, {
        write_token: token,
        handler_code: handlerCode || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/ws/modules"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/ui/structure"] });
      toast({ title: "Module deployed", description: "Routes hot-swapped successfully." });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Deploy failed", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const tokenRes = await apiRequest("GET", `/api/v1/ws/modules/${mod.id}/write-token`);
      const { token } = await tokenRes.json();
      return apiRequest("DELETE", `/api/v1/ws/modules/${mod.id}`, { write_token: token });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/ws/modules"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/ui/structure"] });
      toast({ title: "Module deleted" });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="flex flex-col h-full" data-testid={`module-editor-${mod.id}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Badge variant={STATUS_BADGE[mod.status]?.variant ?? "outline"}>
            {STATUS_BADGE[mod.status]?.label ?? mod.status}
          </Badge>
          <span className="text-xs text-muted-foreground font-mono truncate">{mod.slug}</span>
          <span className="text-xs text-muted-foreground">v{mod.version}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!isSystem && canWrite(mod, userId, isAdmin) && (
            <Button size="sm" variant="ghost"
              onClick={() => lockMutation.mutate(!isLocked)}
              disabled={lockMutation.isPending}
              data-testid={`btn-lock-${mod.id}`}
              title={isLocked ? "Unlock module" : "Lock module"}
            >
              {isLocked ? <LockOpen className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
              <span className="ml-1 text-xs">{isLocked ? "Unlock" : "Lock"}</span>
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onClose} data-testid="btn-close-editor">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {isSystem && (
          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2 border border-border">
            <Shield className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>System module — backed by hardcoded route code. Read-only reference; cannot be edited via the API.</span>
          </div>
        )}
        {isLocked && !isSystem && (
          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2 border border-border">
            <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>Module is locked. {canWrite(mod, userId, isAdmin) ? "Unlock above to edit." : "Only the owner or an admin can unlock it."}</span>
          </div>
        )}
        {mod.status === "error" && mod.error_log && (
          <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2 border border-destructive/20" data-testid={`error-log-${mod.id}`}>
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <pre className="whitespace-pre-wrap break-all font-mono">{mod.error_log}</pre>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor={`name-${mod.id}`} className="text-xs">Name</Label>
            <Input id={`name-${mod.id}`} value={name} onChange={(e) => setName(e.target.value)}
              disabled={!writeable} className="h-8 text-sm font-mono" data-testid={`input-name-${mod.id}`} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`desc-${mod.id}`} className="text-xs">Description</Label>
            <Input id={`desc-${mod.id}`} value={description} onChange={(e) => setDescription(e.target.value)}
              disabled={!writeable} className="h-8 text-sm" data-testid={`input-desc-${mod.id}`} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`handler-${mod.id}`} className="text-xs">Handler Code (Python)</Label>
          <Textarea id={`handler-${mod.id}`} value={handlerCode}
            onChange={(e) => setHandlerCode(e.target.value)}
            disabled={!writeable || isSystem}
            className="font-mono text-xs min-h-[200px] resize-y"
            spellCheck={false}
            placeholder={isSystem ? "System module — handler code is hardcoded." : "from fastapi import APIRouter\n\nrouter = APIRouter(prefix=\"/api/v1/custom/slug\")\n\n@router.get(\"/\")\nasync def hello():\n    return {\"ok\": True}"}
            data-testid={`textarea-handler-${mod.id}`}
          />
        </div>

        <UiMetaFieldEditor
          value={uiMetaStr}
          onChange={(json) => { setUiMetaStr(json); setJsonError(null); }}
          disabled={!writeable}
        />

        <div className="space-y-1.5">
          <Label htmlFor={`routeconfig-${mod.id}`} className="text-xs">Route Config (JSON)</Label>
          <Textarea id={`routeconfig-${mod.id}`} value={routeConfigStr}
            onChange={(e) => { setRouteConfigStr(e.target.value); setJsonError(null); }}
            disabled={!writeable} className="font-mono text-xs min-h-[80px] resize-y"
            spellCheck={false} data-testid={`textarea-routeconfig-${mod.id}`} />
        </div>

        {jsonError && <p className="text-xs text-destructive" data-testid="json-error">{jsonError}</p>}
        <p className="text-[10px] text-muted-foreground">Last updated: {fmtTs(mod.updated_at)}</p>
      </div>

      {writeable && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-border shrink-0">
          <Button size="sm" variant="destructive"
            onClick={() => { if (confirm(`Delete "${mod.name}"? This cannot be undone.`)) deleteMutation.mutate(); }}
            disabled={deleteMutation.isPending} data-testid={`btn-delete-${mod.id}`}>
            Delete
          </Button>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || swapMutation.isPending}
              data-testid={`btn-save-${mod.id}`}>
              {saveMutation.isPending ? "Saving…" : "Save"}
            </Button>
            <Button size="sm"
              onClick={() => swapMutation.mutate()}
              disabled={swapMutation.isPending || saveMutation.isPending || !handlerCode.trim()}
              data-testid={`btn-deploy-${mod.id}`}>
              <Zap className="h-3.5 w-3.5 mr-1" />
              {swapMutation.isPending ? "Deploying…" : "Deploy"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function WsModulesTab() {
  const { tier, isAdmin, userId } = useBillingStatus();
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const canAccess = WS_TIERS.has(tier) || isAdmin;

  const { data: modules = [], isLoading } = useQuery<WsModule[]>({
    queryKey: ["/api/v1/ws/modules"],
    enabled: canAccess,
  });

  const selectedModule = modules.find((m) => m.id === selectedId);
  const systemModules = modules.filter((m) => m.status === "system");
  const userModules = modules.filter((m) => m.status !== "system");

  if (!canAccess) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground" data-testid="ws-modules-no-access">
        <Blocks className="h-8 w-8 opacity-30" />
        <p className="text-sm">Module editor requires ws, pro, or admin tier.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground" data-testid="ws-modules-loading">
        <span className="text-sm">Loading modules…</span>
      </div>
    );
  }

  const rowCls = (id: number) =>
    `w-full text-left flex items-center justify-between px-3 py-2 text-sm transition-colors ${
      selectedId === id && !isCreating ? "bg-primary/10 text-primary" : "hover:bg-muted text-foreground"
    }`;

  return (
    <div className="flex h-full" data-testid="ws-modules-tab">
      <div className="w-56 shrink-0 border-r border-border flex flex-col overflow-hidden">
        <div className="px-3 py-2 border-b border-border shrink-0 flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Modules</p>
          <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs gap-1"
            onClick={() => { setIsCreating(true); setSelectedId(null); }}
            data-testid="btn-new-module">
            <Plus className="h-3 w-3" /> New
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isCreating && (
            <div className="px-3 py-2 text-xs font-medium bg-primary/10 text-primary border-b border-border">
              + New Module
            </div>
          )}

          {userModules.length > 0 && (
            <div>
              <p className="px-3 pt-2 pb-0.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">User</p>
              {userModules.map((mod) => (
                <button key={mod.id} onClick={() => { setSelectedId(mod.id === selectedId && !isCreating ? null : mod.id); setIsCreating(false); }}
                  className={`${rowCls(mod.id)} items-start py-2`} data-testid={`module-row-${mod.id}`}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{mod.name}</div>
                    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                      <Badge variant={STATUS_BADGE[mod.status]?.variant ?? "outline"} className="text-[9px] px-1 py-0 h-4 shrink-0">
                        {mod.status}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">v{mod.version}</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground font-mono truncate mt-0.5">{mod.slug}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{fmtTs(mod.updated_at)}</div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-1 mt-0.5">
                    {mod.status === "locked" && <Lock className="h-3 w-3 text-muted-foreground" />}
                    {mod.status === "error" && <AlertTriangle className="h-3 w-3 text-destructive" />}
                    <ChevronRight className="h-3 w-3 text-muted-foreground" />
                  </div>
                </button>
              ))}
            </div>
          )}

          <div>
            <p className="px-3 pt-2 pb-0.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">System</p>
            {systemModules.map((mod) => (
              <button key={mod.id} onClick={() => { setSelectedId(mod.id === selectedId && !isCreating ? null : mod.id); setIsCreating(false); }}
                className={`${rowCls(mod.id)} opacity-70 hover:opacity-100`} data-testid={`module-row-${mod.id}`}>
                <span className="truncate flex-1">{mod.name}</span>
                <Eye className="h-3 w-3 text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>

          {modules.length === 0 && !isCreating && (
            <p className="px-3 py-4 text-xs text-muted-foreground">No modules yet.</p>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {isCreating ? (
          <NewModulePanel
            onClose={() => setIsCreating(false)}
            onCreated={(id) => { setIsCreating(false); setSelectedId(id); }}
          />
        ) : selectedModule ? (
          <ModuleEditor mod={selectedModule} userId={userId} isAdmin={isAdmin} onClose={() => setSelectedId(null)} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground" data-testid="ws-modules-empty">
            <Blocks className="h-8 w-8 opacity-30" />
            <p className="text-sm">Select a module or create a new one.</p>
            <p className="text-xs text-center max-w-[240px]">
              System modules are read-only mirrors of hardcoded routes. User modules can be edited if not locked.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
// 353:0
