// 629:11 0:5 0:12
import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Trash2, Loader2, ChevronDown, ChevronUp, ChevronRight, Zap, X,
  Archive, ArchiveRestore, CornerDownRight, AlertTriangle, CheckCircle2,
  Eye, Wrench, Settings,
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { fmtTokens } from "@/components/chat-messages";
import { cn } from "@/lib/utils";

export interface Conversation {
  id: number;
  title: string | null;
  model: string | null;
  archived: boolean;
  total_tokens: number;
  created_at: string;
  updated_at: string;
  parent_conv_id?: number | null;
  subagent_status?: string | null;
}

export function ConversationList({
  conversations, archivedConvs, activeId, onSelect, onCreate,
  onDelete, onArchive, onArchiveAll, isCreating, showArchived, onToggleArchived,
}: {
  conversations: Conversation[];
  archivedConvs: Conversation[];
  activeId: number | null;
  onSelect: (id: number) => void;
  onCreate: () => void;
  onDelete: (id: number) => void;
  onArchive: (id: number, archived: boolean) => void;
  onArchiveAll?: () => void;
  isCreating: boolean;
  showArchived: boolean;
  onToggleArchived: () => void;
}) {
  // Build parent → children map. Top-level rows are conversations whose
  // parent_conv_id is null OR whose parent isn't in the visible set
  // (orphans surface at the root rather than vanishing).
  const idSet = new Set(conversations.map((c) => c.id));
  const childrenByParent = new Map<number, Conversation[]>();
  const roots: Conversation[] = [];
  for (const c of conversations) {
    const p = c.parent_conv_id;
    if (p && idSet.has(p)) {
      const arr = childrenByParent.get(p) ?? [];
      arr.push(c);
      childrenByParent.set(p, arr);
    } else {
      roots.push(c);
    }
  }

  // Sub-agent branches default to expanded so the user can see the full
  // tree on first load. Manual collapse persists per session via state.
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const toggleCollapse = (id: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const StatusDot = ({ status }: { status?: string | null }) => {
    if (!status || status === "done") return <CheckCircle2 className="h-2.5 w-2.5 text-green-500 shrink-0" />;
    if (status === "running") return <Loader2 className="h-2.5 w-2.5 animate-spin text-primary shrink-0" />;
    if (status === "error") return <AlertTriangle className="h-2.5 w-2.5 text-destructive shrink-0" />;
    return null;
  };

  const ConvItem = ({ c, depth = 0 }: { c: Conversation; depth?: number }) => {
    // Hard guard against pathological parent-chain cycles in the DB. Real
    // sub-agent trees are at most a few levels; anything beyond this is
    // almost certainly bad data and would otherwise blow the stack.
    if (depth > 10) return null;
    const kids = childrenByParent.get(c.id) ?? [];
    const hasKids = kids.length > 0;
    const isCollapsed = collapsed.has(c.id);
    const isSubagent = c.parent_conv_id != null;

    return (
      <>
        <div
          className={cn(
            "group flex items-center gap-1 px-2 py-1.5 rounded-md cursor-pointer text-xs transition-colors",
            c.id === activeId ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted",
          )}
          style={{ paddingLeft: `${8 + depth * 12}px` }}
          onClick={() => onSelect(c.id)}
          data-testid={`conversation-${c.id}`}
        >
          {hasKids ? (
            <button
              className="shrink-0 -ml-1 p-0.5 rounded hover:bg-muted-foreground/10"
              onClick={(e) => { e.stopPropagation(); toggleCollapse(c.id); }}
              data-testid={`btn-toggle-children-${c.id}`}
              aria-label={isCollapsed ? "Expand sub-agents" : "Collapse sub-agents"}
            >
              {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          ) : isSubagent ? (
            <CornerDownRight className="h-3 w-3 shrink-0 text-muted-foreground/60" />
          ) : (
            <span className="w-3 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              {isSubagent && <StatusDot status={c.subagent_status} />}
              <span className="truncate">{c.title || `Conv #${c.id}`}</span>
              {hasKids && (
                <span className="text-[9px] text-muted-foreground/60 shrink-0" data-testid={`badge-subagent-count-${c.id}`}>
                  ({kids.length})
                </span>
              )}
            </div>
            {c.total_tokens > 0 && (
              <div className="text-[9px] text-muted-foreground/60 mt-0.5" data-testid={`tokens-conv-${c.id}`}>{fmtTokens(c.total_tokens)} tok</div>
            )}
          </div>
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 shrink-0 ml-1">
            <Button size="icon" variant="ghost" className="h-5 w-5" title={c.archived ? "Unarchive" : "Archive"} onClick={(e) => { e.stopPropagation(); onArchive(c.id, !c.archived); }} data-testid={`archive-conversation-${c.id}`}>
              {c.archived ? <ArchiveRestore className="h-3 w-3" /> : <Archive className="h-3 w-3" />}
            </Button>
            <Button size="icon" variant="ghost" className="h-5 w-5" onClick={(e) => { e.stopPropagation(); onDelete(c.id); }} data-testid={`delete-conversation-${c.id}`}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
        {hasKids && !isCollapsed && kids.map((k) => <ConvItem key={k.id} c={k} depth={depth + 1} />)}
      </>
    );
  };

  return (
    <div className="flex flex-col h-full border-r border-border bg-muted/30" data-testid="conversation-list">
      <div className="flex items-center justify-between px-3 py-3 border-b border-border">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Conversations</span>
        <div className="flex items-center gap-0.5">
          {onArchiveAll && conversations.length > 0 && (
            <Button size="icon" variant="ghost" className="h-6 w-6" title="Archive all" onClick={onArchiveAll} data-testid="btn-archive-all">
              <Archive className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onCreate} disabled={isCreating} data-testid="btn-new-conversation">
            {isCreating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-0.5 p-2">
          {roots.map((c) => <ConvItem key={c.id} c={c} />)}
          {conversations.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">No conversations</p>
          )}
          <button className="flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-muted-foreground mt-2 px-1 transition-colors" onClick={onToggleArchived} data-testid="btn-toggle-archived">
            <Archive className="h-2.5 w-2.5" />
            Archived ({archivedConvs.length})
            {showArchived ? <ChevronUp className="h-2.5 w-2.5 ml-auto" /> : <ChevronDown className="h-2.5 w-2.5 ml-auto" />}
          </button>
          {showArchived && archivedConvs.map((c) => <ConvItem key={c.id} c={c} />)}
        </div>
      </ScrollArea>
    </div>
  );
}

export function ContextBoostPanel({ convId }: { convId: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");

  const { data } = useQuery<{ context_boost: string }>({
    queryKey: ["/api/v1/conversations", convId, "boost"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/v1/conversations/${convId}/boost`);
      return res.json();
    },
    enabled: open,
  });

  const boost = data?.context_boost ?? "";

  const save = useMutation({
    mutationFn: async (text: string) => {
      if (!text.trim()) {
        await apiRequest("DELETE", `/api/v1/conversations/${convId}/boost`);
      } else {
        await apiRequest("PUT", `/api/v1/conversations/${convId}/boost`, { text });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/v1/conversations", convId, "boost"] });
      toast({ title: draft.trim() ? "Context boost saved" : "Context boost cleared" });
    },
  });

  useEffect(() => { if (open) setDraft(boost); }, [open, boost]);

  return (
    <div className="border-b border-border" data-testid="context-boost-panel">
      <button className="w-full flex items-center gap-2 px-4 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors" onClick={() => setOpen(!open)} data-testid="btn-toggle-boost">
        <Zap className="h-3 w-3" />
        <span>Context Boost {boost ? `(active)` : ""}</span>
        {open ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
      </button>
      {open && (
        <div className="px-4 pb-3 space-y-2" data-testid="boost-editor">
          <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Additional context injected into every model call in this conversation…" className="text-xs min-h-[60px] max-h-[140px] resize-none" data-testid="boost-textarea" />
          <div className="flex gap-2">
            <Button size="sm" className="text-xs h-7" onClick={() => save.mutate(draft)} disabled={save.isPending} data-testid="btn-save-boost">
              {save.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
            </Button>
            {boost && (
              <Button size="sm" variant="ghost" className="text-xs h-7 text-destructive" onClick={() => { setDraft(""); save.mutate(""); }} disabled={save.isPending} data-testid="btn-clear-boost">
                <X className="h-3 w-3 mr-1" />Clear
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Pre-chat inspector panel ────────────────────────────────────────────────

interface ToolEntry {
  name: string;
  description: string;
  tier: string;
  category: string;
  enabled: boolean;
}

interface ConvToolsRes {
  conversation_id: number;
  enabled_tools: string[] | null;
  tools: ToolEntry[];
}

interface ContextPreviewRes {
  conversation_id: number;
  system_prompt: string;
  char_count: number;
  active_seed_titles: string[];
}

interface InferenceSettingsRes {
  conversation_id: number;
  max_tool_rounds: number | null;
  inference_mode: string;
}

function InferenceTab({ convId }: { convId: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [localRounds, setLocalRounds] = useState<string>("");

  const { data, isLoading, error } = useQuery<InferenceSettingsRes>({
    queryKey: ["/api/v1/conversations", convId, "inference-settings"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/v1/conversations/${convId}/inference-settings`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    staleTime: 30_000,
  });

  useEffect(() => {
    if (data) setLocalRounds(data.max_tool_rounds !== null ? String(data.max_tool_rounds) : "");
  }, [data]);

  const patch = useMutation({
    mutationFn: async (body: { max_tool_rounds?: number; inference_mode?: string }) => {
      const res = await apiRequest("PATCH", `/api/v1/conversations/${convId}/inference-settings`, body);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/v1/conversations", convId, "inference-settings"] });
      toast({ title: "Saved" });
    },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return (
    <div className="flex items-center justify-center py-8 text-muted-foreground text-xs" data-testid="inference-loading">
      <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />Loading…
    </div>
  );
  if (error || !data) return (
    <div className="text-xs text-destructive py-4 px-2" data-testid="inference-error">
      {error instanceof Error ? error.message : "Failed to load inference settings"}
    </div>
  );

  const roundsNum = localRounds.trim() === "" ? null : parseInt(localRounds, 10);
  const roundsValid = localRounds.trim() === "" || (!isNaN(roundsNum!) && roundsNum! >= 1 && roundsNum! <= 20);
  const roundsChanged = localRounds.trim() !== String(data.max_tool_rounds ?? "");

  const MODE_DESC: Record<string, string> = {
    agentic: "Full tool loop — up to max-rounds of tool calls before answering.",
    direct: "No tools. Model answers in a single pass.",
    swarm: "Multi-provider swarm — reserved, not yet active.",
  };

  return (
    <div className="flex flex-col gap-3" data-testid="inference-tab-content">
      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] text-muted-foreground font-medium">Mode</label>
        <Select
          value={data.inference_mode}
          onValueChange={(v) => patch.mutate({ inference_mode: v })}
          disabled={patch.isPending}
        >
          <SelectTrigger className="h-8 text-xs" data-testid="select-inference-mode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="agentic" data-testid="option-mode-agentic">agentic</SelectItem>
            <SelectItem value="direct" data-testid="option-mode-direct">direct</SelectItem>
            <SelectItem value="swarm" data-testid="option-mode-swarm">swarm</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          {MODE_DESC[data.inference_mode] ?? MODE_DESC.agentic}
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] text-muted-foreground font-medium">Max tool rounds</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={20}
            value={localRounds}
            onChange={(e) => setLocalRounds(e.target.value)}
            placeholder="default (5)"
            className={cn(
              "h-8 w-28 rounded-md border px-2.5 text-xs bg-background text-foreground",
              "focus:outline-none focus:ring-1 focus:ring-ring",
              !roundsValid && "border-destructive",
            )}
            data-testid="input-max-tool-rounds"
          />
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs px-3"
            disabled={patch.isPending || !roundsValid || !roundsChanged || localRounds.trim() === ""}
            onClick={() => {
              if (!roundsValid || !roundsNum) return;
              patch.mutate({ max_tool_rounds: roundsNum });
            }}
            data-testid="btn-save-max-rounds"
          >
            {patch.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground">
          {data.max_tool_rounds !== null
            ? `Currently ${data.max_tool_rounds} rounds. Range: 1–20.`
            : "Using global default (5 rounds). Range: 1–20."}
        </p>
      </div>
    </div>
  );
}

function ContextTab({ convId }: { convId: number }) {
  const { data, isLoading, error } = useQuery<ContextPreviewRes>({
    queryKey: ["/api/v1/conversations", convId, "context-preview"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/v1/conversations/${convId}/context-preview`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground text-xs" data-testid="context-loading">
        <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
        Assembling context…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="text-xs text-destructive py-4 px-2" data-testid="context-error">
        {error instanceof Error ? error.message : "Failed to load context preview"}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2" data-testid="context-tab-content">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] text-muted-foreground font-mono">
          {data.char_count.toLocaleString()} chars
        </span>
        {data.active_seed_titles.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[10px] text-muted-foreground">seeds:</span>
            {data.active_seed_titles.map((t) => (
              <Badge key={t} variant="secondary" className="text-[10px] h-4 px-1.5" data-testid={`badge-seed-${t}`}>
                {t}
              </Badge>
            ))}
          </div>
        )}
      </div>
      <ScrollArea className="h-56 rounded border border-border bg-muted/30">
        <pre
          className="text-[10px] font-mono whitespace-pre-wrap p-3 leading-relaxed text-foreground/80"
          data-testid="context-preview-text"
        >
          {data.system_prompt}
        </pre>
      </ScrollArea>
    </div>
  );
}

function ToolsTab({ convId }: { convId: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading, error: toolsError } = useQuery<ConvToolsRes>({
    queryKey: ["/api/v1/conversations", convId, "tools"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/v1/conversations/${convId}/tools`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    staleTime: 30_000,
  });

  const patch = useMutation({
    mutationFn: async (enabledTools: string[] | null) => {
      const res = await apiRequest("PATCH", `/api/v1/conversations/${convId}/tools`, { enabled_tools: enabledTools });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/v1/conversations", convId, "tools"] });
    },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground text-xs" data-testid="tools-loading">
        <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
        Loading tools…
      </div>
    );
  }
  if (toolsError || !data) {
    return (
      <div className="text-xs text-destructive py-4 px-2" data-testid="tools-error">
        {toolsError instanceof Error ? toolsError.message : "Failed to load tools"}
      </div>
    );
  }

  const allEnabled = data.enabled_tools === null;
  const enabledSet = new Set<string>(data.enabled_tools ?? data.tools.map((t) => t.name));

  const toggleTool = (name: string, checked: boolean) => {
    if (allEnabled) {
      // Currently all-on; switching one off means we go explicit.
      const nowEnabled = data.tools.map((t) => t.name).filter((n) => (n === name ? checked : true));
      patch.mutate(nowEnabled);
    } else {
      const next = checked
        ? [...Array.from(enabledSet), name]
        : Array.from(enabledSet).filter((n) => n !== name);
      // If every tool is on, reset to null (all-on shorthand).
      const all = data.tools.map((t) => t.name);
      patch.mutate(next.length === all.length ? null : next);
    }
  };

  const enableAll = () => patch.mutate(null);
  const disableAll = () => patch.mutate([]);

  const tierColor: Record<string, string> = {
    free: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    supporter: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    ws: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    admin: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  };

  return (
    <div className="flex flex-col gap-2" data-testid="tools-tab-content">
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground">
          {allEnabled ? `All ${data.tools.length} tools enabled` : `${enabledSet.size} / ${data.tools.length} enabled`}
        </span>
        <div className="flex gap-1 ml-auto">
          <button
            type="button"
            onClick={enableAll}
            disabled={patch.isPending || allEnabled}
            className="text-[10px] text-muted-foreground hover:text-primary underline underline-offset-2 disabled:opacity-40"
            data-testid="btn-enable-all-tools"
          >
            all on
          </button>
          <span className="text-muted-foreground text-[10px]">·</span>
          <button
            type="button"
            onClick={disableAll}
            disabled={patch.isPending || (!allEnabled && enabledSet.size === 0)}
            className="text-[10px] text-muted-foreground hover:text-primary underline underline-offset-2 disabled:opacity-40"
            data-testid="btn-disable-all-tools"
          >
            all off
          </button>
        </div>
      </div>
      <ScrollArea className="h-56 rounded border border-border">
        <div className="divide-y divide-border" data-testid="tools-list">
          {data.tools.map((tool) => {
            const on = allEnabled || enabledSet.has(tool.name);
            return (
              <div
                key={tool.name}
                className="flex items-start gap-3 px-3 py-2"
                data-testid={`tool-row-${tool.name}`}
              >
                <Switch
                  checked={on}
                  onCheckedChange={(checked) => toggleTool(tool.name, checked)}
                  disabled={patch.isPending}
                  className="mt-0.5 shrink-0"
                  data-testid={`switch-tool-${tool.name}`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-medium font-mono">{tool.name}</span>
                    <span
                      className={cn(
                        "text-[9px] px-1 rounded font-medium uppercase tracking-wide",
                        tierColor[tool.tier] ?? tierColor.free,
                      )}
                      data-testid={`badge-tier-${tool.name}`}
                    >
                      {tool.tier}
                    </span>
                    {tool.category !== "misc" && (
                      <span className="text-[9px] text-muted-foreground">{tool.category}</span>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">
                    {tool.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

export function PreChatInspectorPanel({ convId }: { convId: number }) {
  return (
    <div
      className="mx-4 mb-4 rounded-lg border border-border bg-card shadow-sm"
      data-testid="pre-chat-inspector"
    >
      <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b border-border">
        <Eye className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-foreground">Pre-send Inspector</span>
        <span className="text-[10px] text-muted-foreground ml-1">
          — collapses after your first message
        </span>
      </div>
      <div className="p-3">
        <Tabs defaultValue="context">
          <TabsList className="h-7 text-[11px] mb-3">
            <TabsTrigger value="context" className="h-6 px-3 text-[11px]" data-testid="tab-context">
              <Eye className="h-3 w-3 mr-1" />Context
            </TabsTrigger>
            <TabsTrigger value="tools" className="h-6 px-3 text-[11px]" data-testid="tab-tools">
              <Wrench className="h-3 w-3 mr-1" />Tools
            </TabsTrigger>
            <TabsTrigger value="inference" className="h-6 px-3 text-[11px]" data-testid="tab-inference">
              <Settings className="h-3 w-3 mr-1" />Inference
            </TabsTrigger>
          </TabsList>
          <TabsContent value="context" className="mt-0">
            <ContextTab convId={convId} />
          </TabsContent>
          <TabsContent value="tools" className="mt-0">
            <ToolsTab convId={convId} />
          </TabsContent>
          <TabsContent value="inference" className="mt-0">
            <InferenceTab convId={convId} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export function ConvToolsPopover({ convId }: { convId: number }) {
  const [open, setOpen] = useState(false);

  const { data } = useQuery<ConvToolsRes>({
    queryKey: ["/api/v1/conversations", convId, "tools"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/v1/conversations/${convId}/tools`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: open,
    staleTime: 30_000,
  });

  const activeCount = data
    ? (data.enabled_tools === null ? data.tools.length : data.enabled_tools.length)
    : null;
  const totalCount = data?.tools.length ?? null;
  const allOn = data?.enabled_tools === null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className={cn(
            "h-8 w-8 shrink-0",
            !allOn && activeCount !== null && "text-primary",
          )}
          title={`Tools (${activeCount ?? "…"}/${totalCount ?? "…"} enabled)`}
          data-testid="btn-tools-popover"
        >
          <Wrench className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className="w-80 p-3"
        data-testid="tools-popover-content"
      >
        <div className="flex items-center gap-2 mb-3">
          <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">Tool selection</span>
          {activeCount !== null && (
            <Badge variant="secondary" className="ml-auto text-[10px] h-4 px-1.5">
              {activeCount}/{totalCount}
            </Badge>
          )}
        </div>
        <ToolsTab convId={convId} />
      </PopoverContent>
    </Popover>
  );
}

export { ChatInput } from "./chat-input";
// 629:11 0:5 0:12
