// 165:0
import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Send, Trash2, Loader2, ChevronDown, ChevronUp, Zap, X,
  Archive, ArchiveRestore,
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
}

export function ConversationList({
  conversations, archivedConvs, activeId, onSelect, onCreate,
  onDelete, onArchive, isCreating, showArchived, onToggleArchived,
}: {
  conversations: Conversation[];
  archivedConvs: Conversation[];
  activeId: number | null;
  onSelect: (id: number) => void;
  onCreate: () => void;
  onDelete: (id: number) => void;
  onArchive: (id: number, archived: boolean) => void;
  isCreating: boolean;
  showArchived: boolean;
  onToggleArchived: () => void;
}) {
  const ConvItem = ({ c }: { c: Conversation }) => (
    <div
      className={cn("group flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer text-xs transition-colors", c.id === activeId ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted")}
      onClick={() => onSelect(c.id)}
      data-testid={`conversation-${c.id}`}
    >
      <div className="flex-1 min-w-0">
        <div className="truncate">{c.title || `Conv #${c.id}`}</div>
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
  );

  return (
    <div className="flex flex-col h-full border-r border-border bg-muted/30" data-testid="conversation-list">
      <div className="flex items-center justify-between px-3 py-3 border-b border-border">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Conversations</span>
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onCreate} disabled={isCreating} data-testid="btn-new-conversation">
          {isCreating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-0.5 p-2">
          {conversations.map((c) => <ConvItem key={c.id} c={c} />)}
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

export function ChatInput({ onSend, isSending }: { onSend: (content: string) => void; isSending: boolean }) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed || isSending) return;
    onSend(trimmed);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleSubmit(); }
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  return (
    <div className="flex gap-2 items-end px-4 py-3 border-t border-border" data-testid="chat-input-area">
      <Textarea ref={textareaRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder="Message a0... (Ctrl+Enter to send)" className="resize-none min-h-[40px] max-h-[120px] text-sm" rows={1} data-testid="chat-input" />
      <Button size="icon" onClick={handleSubmit} disabled={!input.trim() || isSending} className="shrink-0 h-10 w-10" data-testid="btn-send">
        {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
      </Button>
    </div>
  );
}
// 165:0
