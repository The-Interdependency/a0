// 165:0
import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Trash2, Loader2, ChevronDown, ChevronUp, ChevronRight, Zap, X,
  Archive, ArchiveRestore, CornerDownRight, AlertTriangle, CheckCircle2,
} from "lucide-react";
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

export { ChatInput } from "./chat-input";
// 165:0
