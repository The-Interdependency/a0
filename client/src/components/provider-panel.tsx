// 362:2
import { useMemo, useState } from "react";
import { useProviderActions } from "@/hooks/use-provider-actions";
import {
  Loader2,
  RefreshCw,
  Wand2,
  Check,
  AlertTriangle,
  Cpu,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type RoleKey = "record" | "practice" | "conduct" | "perform" | "derive";
export const ROLES: RoleKey[] = ["record", "practice", "conduct", "perform", "derive"];
const ROLE_DESC: Record<RoleKey, string> = {
  record: "Classify / log",
  practice: "Worker turns",
  conduct: "Plan / orchestrate",
  perform: "High-stakes acts",
  derive: "Deep analysis",
};

export const PRESETS = ["balance", "speed", "depth", "price", "creativity", "coding"] as const;
export type Preset = (typeof PRESETS)[number];

export type ModelEntry = {
  id: string;
  stale?: boolean;
  context_window?: number;
  last_seen_at?: number;
  pricing?: { input_per_1m?: number; output_per_1m?: number };
  capabilities?: Record<string, unknown>;
};

export type RouteConfig = {
  model_assignments?: Partial<Record<RoleKey, string>>;
  available_models?: ModelEntry[];
  presets?: Partial<Record<Preset, Partial<Record<RoleKey, string>>>>;
  active_preset?: Preset;
  enabled?: boolean;
  disabled_models?: string[];
  pricing_url?: string;
  prices_updated_at?: number;
};

export type Provider = {
  id: string;
  label: string;
  vendor: string;
  available: boolean;
  active: boolean;
  route_config: RouteConfig;
  seed_updated_at: string | null;
};

function priceFmt(n?: number): string {
  if (!n || n <= 0) return "—";
  return `$${n.toFixed(2)}`;
}

function timeAgo(ts?: number): string {
  if (!ts) return "never";
  const secs = Math.floor(Date.now() / 1000 - ts);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

function RolePill({
  role,
  modelId,
  models,
  isAdmin,
  onPick,
}: {
  role: RoleKey;
  modelId?: string;
  models: ModelEntry[];
  isAdmin: boolean;
  onPick: (newModelId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = (
    <button
      type="button"
      disabled={!isAdmin}
      className={cn(
        "flex flex-col items-start gap-0.5 rounded-md border border-border bg-card px-3 py-2 text-left transition-colors min-w-[140px]",
        isAdmin && "hover-elevate cursor-pointer",
      )}
      data-testid={`pill-role-${role}`}
    >
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        {role}
      </span>
      <span className="text-xs font-mono text-foreground truncate max-w-[180px]">
        {modelId || "—"}
      </span>
      <span className="text-[10px] text-muted-foreground">{ROLE_DESC[role]}</span>
    </button>
  );
  if (!isAdmin) return trigger;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 p-1 max-h-80 overflow-y-auto"
        data-testid={`popover-role-${role}`}
      >
        <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold border-b border-border mb-1">
          Assign {role}
        </div>
        {models.length === 0 && (
          <div className="px-2 py-3 text-xs text-muted-foreground">
            No models available. Refresh pricing to hydrate.
          </div>
        )}
        {models.map((m) => {
          const selected = m.id === modelId;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                onPick(m.id);
                setOpen(false);
              }}
              className={cn(
                "flex items-center gap-2 w-full px-2 py-2 rounded-sm hover-elevate text-left text-xs",
                selected && "bg-accent/10",
              )}
              data-testid={`option-role-${role}-${m.id}`}
            >
              <span className="font-mono flex-1 truncate">{m.id}</span>
              {m.stale && (
                <AlertTriangle className="w-3 h-3 text-amber-500" aria-label="stale" />
              )}
              {selected && <Check className="w-3.5 h-3.5 text-accent" />}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

function ModelCard({
  m,
  assignedRoles,
  disabled,
  isAdmin,
  onToggleDisabled,
}: {
  m: ModelEntry;
  assignedRoles: RoleKey[];
  disabled: boolean;
  isAdmin: boolean;
  onToggleDisabled: () => void;
}) {
  const inP = m.pricing?.input_per_1m ?? 0;
  const outP = m.pricing?.output_per_1m ?? 0;
  return (
    <div
      className={cn(
        "rounded-lg border p-3 bg-card transition-opacity",
        disabled && "opacity-40",
        m.stale ? "border-amber-500/40" : "border-border",
      )}
      data-testid={`card-model-${m.id}`}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className="font-mono text-xs font-medium truncate flex-1">{m.id}</span>
        {m.stale && (
          <Badge variant="outline" className="text-[9px] border-amber-500/40 text-amber-500 px-1 py-0 h-4">
            stale
          </Badge>
        )}
      </div>
      <div className="flex flex-wrap gap-1 mb-1.5 min-h-[18px]">
        {assignedRoles.map((r) => (
          <Badge
            key={r}
            variant="secondary"
            className="text-[9px] px-1 py-0 h-4 uppercase tracking-wider"
            data-testid={`badge-assigned-${m.id}-${r}`}
          >
            {r}
          </Badge>
        ))}
      </div>
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
        <span title="input per 1M tokens">in {priceFmt(inP)}</span>
        <span>·</span>
        <span title="output per 1M tokens">out {priceFmt(outP)}</span>
        {m.context_window && m.context_window > 0 && (
          <>
            <span>·</span>
            <span>{Math.round(m.context_window / 1000)}K ctx</span>
          </>
        )}
      </div>
      {isAdmin && (
        <button
          type="button"
          onClick={onToggleDisabled}
          className="mt-2 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          data-testid={`button-toggle-disabled-${m.id}`}
        >
          {disabled ? "enable" : "disable"}
        </button>
      )}
    </div>
  );
}

export function ProviderPanel({ p, isAdmin }: { p: Provider; isAdmin: boolean }) {
  const rc = p.route_config || {};
  const models = rc.available_models || [];
  const assignments = rc.model_assignments || {};
  const disabledIds = new Set(rc.disabled_models || []);
  const [pendingPreset, setPendingPreset] = useState<Preset>(rc.active_preset || "balance");
  const { patchSeed, applyPreset, refreshPricing } = useProviderActions(p.id, p.label);

  const rolesByModel = useMemo(() => {
    const map = new Map<string, RoleKey[]>();
    for (const role of ROLES) {
      const mid = assignments[role];
      if (!mid) continue;
      if (!map.has(mid)) map.set(mid, []);
      map.get(mid)!.push(role);
    }
    return map;
  }, [assignments]);

  function handleAssignRole(role: RoleKey, newModelId: string) {
    // Send partial patch — backend merges into existing assignments
    // (see _update_seed_route_config). Avoids lost-update on rapid edits.
    patchSeed.mutate({ model_assignments: { [role]: newModelId } });
  }

  function handleToggleDisabled(modelId: string) {
    const next = disabledIds.has(modelId)
      ? Array.from(disabledIds).filter((x) => x !== modelId)
      : [...Array.from(disabledIds), modelId];
    patchSeed.mutate({ disabled_models: next });
  }

  return (
    <div className="space-y-4" data-testid={`panel-provider-${p.id}`}>
      <div className="flex items-center flex-wrap gap-2">
        <div className="flex items-center gap-2 mr-auto">
          <Cpu className="w-5 h-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">{p.label}</h2>
          <Badge variant="outline" className="text-[10px] uppercase">
            {p.vendor}
          </Badge>
          {p.active && (
            <Badge className="text-[10px] uppercase bg-emerald-500/20 text-emerald-400 border-emerald-500/40">
              <Zap className="w-3 h-3 mr-0.5" />
              active
            </Badge>
          )}
          {!p.available && (
            <Badge variant="outline" className="text-[10px] uppercase border-amber-500/40 text-amber-500">
              no api key
            </Badge>
          )}
        </div>
        <Select value={pendingPreset} onValueChange={(v) => setPendingPreset(v as Preset)}>
          <SelectTrigger className="w-[140px]" data-testid={`select-preset-${p.id}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRESETS.map((pr) => (
              <SelectItem key={pr} value={pr} data-testid={`preset-option-${pr}`}>
                {pr}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant="outline"
          disabled={!isAdmin || applyPreset.isPending}
          onClick={() => applyPreset.mutate(pendingPreset)}
          data-testid={`button-apply-preset-${p.id}`}
        >
          {applyPreset.isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Wand2 className="w-3.5 h-3.5" />
          )}
          <span className="ml-1">Apply</span>
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!isAdmin || refreshPricing.isPending}
          onClick={() => refreshPricing.mutate()}
          data-testid={`button-refresh-pricing-${p.id}`}
        >
          {refreshPricing.isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
          <span className="ml-1">Refresh pricing</span>
        </Button>
      </div>
      <div className="text-xs text-muted-foreground" data-testid={`text-prices-updated-${p.id}`}>
        Active preset:{" "}
        <span className="text-foreground font-mono">{rc.active_preset || "—"}</span>
        {" · "}Prices updated: {timeAgo(rc.prices_updated_at)}
        {" · "}{models.length} models · {disabledIds.size} disabled
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
          Role assignments {!isAdmin && "(admin-only to edit)"}
        </div>
        <div className="flex flex-wrap gap-2">
          {ROLES.map((role) => (
            <RolePill
              key={role}
              role={role}
              modelId={assignments[role]}
              models={models.filter((m) => !disabledIds.has(m.id))}
              isAdmin={isAdmin}
              onPick={(mid) => handleAssignRole(role, mid)}
            />
          ))}
        </div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
          Available models
        </div>
        {models.length === 0 ? (
          <div className="text-xs text-muted-foreground rounded-md border border-dashed border-border p-4">
            No models hydrated. Click "Refresh pricing" to load from the manifest.
          </div>
        ) : (
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}
          >
            {models.map((m) => (
              <ModelCard
                key={m.id}
                m={m}
                assignedRoles={rolesByModel.get(m.id) || []}
                disabled={disabledIds.has(m.id)}
                isAdmin={isAdmin}
                onToggleDisabled={() => handleToggleDisabled(m.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
// 362:2
