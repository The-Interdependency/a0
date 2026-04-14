// 310:0
import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useSEO } from "@/hooks/use-seo";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Send, Trash2, Bot, User, Loader2, AlertTriangle,
  ChevronDown, ChevronUp, Target, Zap, Copy, X, Archive, ArchiveRestore,
} from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

interface Conversation {
  id: number;
  title: string | null;
  model: string | null;
  archived: boolean;
  total_tokens: number;
  created_at: string;
  updated_at: string;
}

interface UsageData {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  [key: string]: unknown;
}

interface Message {
  id: number;
  conversation_id: number;
  role: string;
  content: string;
  model: string | null;
  created_at: string;
  metadata?: {
    error?: boolean;
    error_detail?: string;
    focus_regain?: boolean;
    subagent?: boolean;
    usage?: UsageData;
    [key: string]: unknown;
  } | null;
}

const CONV_KEY = "a0p_active_conv";

function tokenCount(usage?: UsageData | null): number | null {
  if (!usage) return null;
  if (usage.total_tokens) return Number(usage.total_tokens);
  const i = Number(usage.input_tokens ?? 0);
  const o = Number(usage.output_tokens ?? 0);
  if (i || o) return i + o;
  const p = Number(usage.prompt_tokens ?? 0);
  const c = Number(usage.completion_tokens ?? 0);
  if (p || c) return p + c;
  return null;
}

function fmtTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function ConversationList({
  conversations,
  archivedConvs,
  activeId,
  onSelect,
  onCreate,
  onDelete,
  onArchive,
  isCreating,
  showArchived,
  onToggleArchived,
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
      key={c.id}
      className={cn(
        "group flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer text-xs transition-colors",
        c.id === activeId
          ? "bg-primary/10 text-primary font-medium"
          : "text-muted-foreground hover:bg-muted"
      )}
      onClick={() => onSelect(c.id)}
      data-testid={`conversation-${c.id}`}
    >
      <div className="flex-1 min-w-0">
        <div className="truncate">{c.title || `Conv #${c.id}`}</div>
        {c.total_tokens > 0 && (
          <div className="text-[9px] text-muted-foreground/60 mt-0.5" data-testid={`tokens-conv-${c.id}`}>
            {fmtTokens(c.total_tokens)} tok
          </div>
        )}
      </div>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 shrink-0 ml-1">
        <Button
          size="icon"
          variant="ghost"
          className="h-5 w-5"
          title={c.archived ? "Unarchive" : "Archive"}
          onClick={(e) => { e.stopPropagation(); onArchive(c.id, !c.archived); }}
          data-testid={`archive-conversation-${c.id}`}
        >
          {c.archived ? <ArchiveRestore className="h-3 w-3" /> : <Archive className="h-3 w-3" />}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-5 w-5"
          onClick={(e) => { e.stopPropagation(); onDelete(c.id); }}
          data-testid={`delete-conversation-${c.id}`}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full border-r border-border bg-muted/30" data-testid="conversation-list">
      <div className="flex items-center justify-between px-3 py-3 border-b border-border">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Conversations
        </span>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          onClick={onCreate}
          disabled={isCreating}
          data-testid="btn-new-conversation"
        >
          {isCreating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-0.5 p-2">
          {conversations.map((c) => <ConvItem key={c.id} c={c} />)}
          {conversations.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">No conversations</p>
          )}
          {/* Archived section */}
          <button
            className="flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-muted-foreground mt-2 px-1 transition-colors"
            onClick={onToggleArchived}
            data-testid="btn-toggle-archived"
          >
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

function MarkdownContent({ content, isUser }: { content: string; isUser: boolean }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || "");
          const isBlock = !!match || (String(children).includes("\n") && String(children).length > 80);
          return isBlock ? (
            <SyntaxHighlighter
              style={oneDark as Record<string, React.CSSProperties>}
              language={match ? match[1] : "text"}
              PreTag="div"
              className="rounded text-xs my-1"
              customStyle={{ margin: "4px 0", borderRadius: "6px", fontSize: "11px" }}
            >
              {String(children).replace(/\n$/, "")}
            </SyntaxHighlighter>
          ) : (
            <code
              className={cn(
                "px-1 py-0.5 rounded text-[11px] font-mono",
                isUser ? "bg-primary-foreground/20" : "bg-black/10 dark:bg-white/10"
              )}
              {...props}
            >
              {children}
            </code>
          );
        },
        p({ children }) { return <p className="mb-1 last:mb-0 leading-relaxed">{children}</p>; },
        ul({ children }) { return <ul className="list-disc list-inside mb-1 space-y-0.5">{children}</ul>; },
        ol({ children }) { return <ol className="list-decimal list-inside mb-1 space-y-0.5">{children}</ol>; },
        li({ children }) { return <li className="text-sm">{children}</li>; },
        blockquote({ children }) {
          return <blockquote className="border-l-2 border-muted-foreground/30 pl-3 my-1 opacity-80 italic">{children}</blockquote>;
        },
        h1({ children }) { return <h1 className="text-base font-bold mt-2 mb-1">{children}</h1>; },
        h2({ children }) { return <h2 className="text-sm font-bold mt-2 mb-1">{children}</h2>; },
        h3({ children }) { return <h3 className="text-sm font-semibold mt-1 mb-0.5">{children}</h3>; },
        table({ children }) { return <div className="overflow-x-auto my-1"><table className="text-xs border-collapse w-full">{children}</table></div>; },
        th({ children }) { return <th className="border border-border px-2 py-1 bg-muted font-semibold text-left">{children}</th>; },
        td({ children }) { return <td className="border border-border px-2 py-1">{children}</td>; },
        strong({ children }) { return <strong className="font-semibold">{children}</strong>; },
        a({ children, href }) {
          return <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:opacity-80">{children}</a>;
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const isError = !isUser && message.metadata?.error === true;
  const isFocusRegain = message.metadata?.focus_regain === true;
  const [showDetail, setShowDetail] = useState(false);
  const { toast } = useToast();
  const tokCount = tokenCount(message.metadata?.usage);

  const copyContent = () => {
    navigator.clipboard.writeText(isError ? (message.metadata?.error_detail ?? message.content) : message.content);
    toast({ title: "Copied" });
  };

  return (
    <div
      className={cn("flex gap-2 max-w-[92%]", isUser ? "ml-auto flex-row-reverse" : "")}
      data-testid={`message-${message.id}`}
    >
      <div className={cn(
        "flex items-center justify-center h-7 w-7 rounded-full shrink-0 mt-0.5",
        isUser ? "bg-primary/20" : isError ? "bg-destructive/20" : isFocusRegain ? "bg-amber-500/20" : "bg-muted"
      )}>
        {isUser
          ? <User className="h-3.5 w-3.5" />
          : isError ? <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
          : isFocusRegain ? <Target className="h-3.5 w-3.5 text-amber-500" />
          : <Bot className="h-3.5 w-3.5" />}
      </div>
      <div className={cn(
        "rounded-lg px-3 py-2 text-sm break-words min-w-0 max-w-full overflow-hidden",
        isUser ? "bg-primary text-primary-foreground" :
        isError ? "bg-destructive/10 border border-destructive/30 text-destructive-foreground" :
        isFocusRegain ? "bg-amber-500/10 border border-amber-500/30" :
        "bg-muted"
      )}>
        {!isUser && (
          <div className="flex items-center gap-1 mb-1 opacity-0 hover:opacity-100 transition-opacity" style={{ opacity: undefined }}>
            <div className={cn("flex items-center gap-1 mb-1", isError ? "opacity-100" : "opacity-60 hover:opacity-100")}>
              {isError && <span className="text-[10px] font-semibold text-destructive uppercase tracking-wide">Model Error</span>}
              <button onClick={copyContent} className="ml-auto hover:opacity-80" data-testid={`copy-msg-${message.id}`} title="Copy">
                <Copy className="h-3 w-3" />
              </button>
              {isError && (
                <button onClick={() => setShowDetail(!showDetail)} className="hover:opacity-80" data-testid={`toggle-error-${message.id}`}>
                  {showDetail ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>
              )}
            </div>
          </div>
        )}

        <div className={cn("prose prose-sm max-w-none dark:prose-invert", isUser && "text-primary-foreground")}>
          <MarkdownContent content={message.content} isUser={isUser} />
        </div>

        {isError && showDetail && message.metadata?.error_detail && (
          <pre className="mt-2 text-[10px] bg-black/10 rounded p-2 overflow-x-auto whitespace-pre-wrap opacity-80" data-testid={`error-detail-${message.id}`}>
            {message.metadata.error_detail}
          </pre>
        )}

        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
          {message.model && (
            <Badge variant="outline" className="text-[9px] h-4 px-1">{message.model}</Badge>
          )}
          {tokCount !== null && !isUser && (
            <Badge variant="outline" className="text-[9px] h-4 px-1 text-muted-foreground" data-testid={`tokens-msg-${message.id}`}>
              {fmtTokens(tokCount)} tok
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

function ContextBoostPanel({ convId }: { convId: number }) {
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
      <button
        className="w-full flex items-center gap-2 px-4 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        onClick={() => setOpen(!open)}
        data-testid="btn-toggle-boost"
      >
        <Zap className="h-3 w-3" />
        <span>Context Boost {boost ? `(active)` : ""}</span>
        {open ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
      </button>
      {open && (
        <div className="px-4 pb-3 space-y-2" data-testid="boost-editor">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Additional context injected into every model call in this conversation…"
            className="text-xs min-h-[60px] max-h-[140px] resize-none"
            data-testid="boost-textarea"
          />
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

function ChatInput({ onSend, isSending }: { onSend: (content: string) => void; isSending: boolean }) {
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
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  return (
    <div className="flex gap-2 items-end px-4 py-3 border-t border-border" data-testid="chat-input-area">
      <Textarea
        ref={textareaRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Message a0... (Ctrl+Enter to send)"
        className="resize-none min-h-[40px] max-h-[120px] text-sm"
        rows={1}
        data-testid="chat-input"
      />
      <Button
        size="icon"
        onClick={handleSubmit}
        disabled={!input.trim() || isSending}
        className="shrink-0 h-10 w-10"
        data-testid="btn-send"
      >
        {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
      </Button>
    </div>
  );
}

export default function ChatPage() {
  useSEO({ title: "a0p — Chat with ZFAE", description: "Chat with a0(zeta fun alpha echo), your autonomous AI agent." });
  const { toast } = useToast();
  const qc = useQueryClient();
  const [activeConvId, setActiveConvId] = useState<number | null>(() => {
    const saved = localStorage.getItem(CONV_KEY);
    return saved ? parseInt(saved, 10) : null;
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showArchived, setShowArchived] = useState(false);

  const selectConv = (id: number) => {
    setActiveConvId(id);
    localStorage.setItem(CONV_KEY, String(id));
  };

  const { data: conversations = [], isLoading: convsLoading } = useQuery<Conversation[]>({
    queryKey: ["/api/v1/conversations"],
    refetchInterval: 15_000,
  });

  const { data: archivedConvs = [] } = useQuery<Conversation[]>({
    queryKey: ["/api/v1/conversations", "archived"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/v1/conversations?archived=true");
      return res.json();
    },
    enabled: showArchived,
    refetchInterval: showArchived ? 30_000 : false,
  });

  const { data: messages = [], isLoading: msgsLoading } = useQuery<Message[]>({
    queryKey: ["/api/v1/conversations", activeConvId, "messages"],
    enabled: !!activeConvId,
    refetchInterval: 5_000,
  });

  useEffect(() => {
    if (conversations.length > 0 && !conversations.find((c) => c.id === activeConvId)) {
      const found = archivedConvs.find((c) => c.id === activeConvId);
      if (!found) selectConv(conversations[0].id);
    }
  }, [conversations, activeConvId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const createConv = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/v1/conversations", { title: "New conversation" });
      return res.json();
    },
    onSuccess: (data: Conversation) => {
      qc.invalidateQueries({ queryKey: ["/api/v1/conversations"] });
      selectConv(data.id);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteConv = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/v1/conversations/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/v1/conversations"] });
      qc.invalidateQueries({ queryKey: ["/api/v1/conversations", "archived"] });
      const remaining = conversations.filter((c) => c.id !== activeConvId);
      if (remaining.length > 0) selectConv(remaining[0].id);
      else setActiveConvId(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const archiveConv = useMutation({
    mutationFn: async ({ id, archived }: { id: number; archived: boolean }) => {
      await apiRequest("PATCH", `/api/v1/conversations/${id}/archive`, { archived });
    },
    onSuccess: (_, { id, archived }) => {
      qc.invalidateQueries({ queryKey: ["/api/v1/conversations"] });
      qc.invalidateQueries({ queryKey: ["/api/v1/conversations", "archived"] });
      if (archived && id === activeConvId) {
        const remaining = conversations.filter((c) => c.id !== id);
        if (remaining.length > 0) selectConv(remaining[0].id);
        else setActiveConvId(null);
      }
      toast({ title: archived ? "Conversation archived" : "Conversation restored" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const sendMessage = useMutation({
    mutationFn: async (content: string) => {
      if (!activeConvId) throw new Error("No conversation selected");
      const res = await apiRequest("POST", `/api/v1/conversations/${activeConvId}/messages`, {
        role: "user",
        content,
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/v1/conversations", activeConvId, "messages"] });
      qc.invalidateQueries({ queryKey: ["/api/v1/conversations"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const focusMutation = useMutation({
    mutationFn: async () => {
      if (!activeConvId) throw new Error("No conversation selected");
      const res = await apiRequest("POST", `/api/v1/conversations/${activeConvId}/focus`);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/v1/conversations", activeConvId, "messages"] });
    },
    onError: (e: Error) => toast({ title: "Focus failed", description: e.message, variant: "destructive" }),
  });

  const [subagentTask, setSubagentTask] = useState("");
  const [showSubagent, setShowSubagent] = useState(false);
  const [subagentConvId, setSubagentConvId] = useState<number | null>(null);

  const { data: subagentStatus } = useQuery<{
    status: string; reply?: string; error?: string;
  }>({
    queryKey: ["/api/v1/subagent", subagentConvId, "status"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/v1/subagent/${subagentConvId}/status`);
      return res.json();
    },
    enabled: !!subagentConvId,
    refetchInterval: (query) => {
      const data = query.state.data as { status?: string } | undefined;
      return data?.status === "running" ? 3000 : false;
    },
  });

  const launchSubagent = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/v1/subagent", {
        task: subagentTask,
        parent_conv_id: activeConvId,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setSubagentConvId(data.subagent_conv_id);
      setSubagentTask("");
      toast({ title: "Sub-agent launched", description: "Primary a0 remains available." });
    },
    onError: (e: Error) => toast({ title: "Sub-agent failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="flex h-full" data-testid="chat-page">
      <div className="w-56 shrink-0 hidden md:block">
        {convsLoading ? (
          <div className="p-3 space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
          </div>
        ) : (
          <ConversationList
            conversations={conversations}
            archivedConvs={archivedConvs}
            activeId={activeConvId}
            onSelect={selectConv}
            onCreate={() => createConv.mutate()}
            onDelete={(id) => deleteConv.mutate(id)}
            onArchive={(id, archived) => archiveConv.mutate({ id, archived })}
            isCreating={createConv.isPending}
            showArchived={showArchived}
            onToggleArchived={() => setShowArchived(!showArchived)}
          />
        )}
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {!activeConvId ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground" data-testid="chat-empty">
            <Bot className="h-10 w-10" />
            <p className="text-sm">Start a conversation</p>
            <Button size="sm" onClick={() => createConv.mutate()} disabled={createConv.isPending} data-testid="btn-start-chat">
              <Plus className="h-3.5 w-3.5 mr-1" /> New Chat
            </Button>
          </div>
        ) : (
          <>
            <ContextBoostPanel convId={activeConvId} />

            {/* Sub-agent panel */}
            <div className="border-b border-border" data-testid="subagent-panel">
              <button
                className="w-full flex items-center gap-2 px-4 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                onClick={() => setShowSubagent(!showSubagent)}
                data-testid="btn-toggle-subagent"
              >
                <Zap className="h-3 w-3" />
                <span>Sub-agent {subagentConvId ? `(${subagentStatus?.status ?? "…"})` : ""}</span>
                {showSubagent ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
              </button>
              {showSubagent && (
                <div className="px-4 pb-3 space-y-2" data-testid="subagent-editor">
                  {subagentConvId && subagentStatus ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs">
                        {subagentStatus.status === "running" && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
                        {subagentStatus.status === "done" && <Target className="h-3 w-3 text-green-500" />}
                        {subagentStatus.status === "error" && <AlertTriangle className="h-3 w-3 text-destructive" />}
                        <span className="font-medium capitalize">{subagentStatus.status}</span>
                        <button className="ml-auto text-muted-foreground hover:text-foreground" onClick={() => setSubagentConvId(null)} data-testid="btn-close-subagent">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                      {subagentStatus.reply && (
                        <pre className="text-[10px] bg-muted rounded p-2 whitespace-pre-wrap max-h-32 overflow-auto" data-testid="subagent-reply">{subagentStatus.reply}</pre>
                      )}
                      {subagentStatus.error && (
                        <p className="text-[10px] text-destructive" data-testid="subagent-error">{subagentStatus.error}</p>
                      )}
                    </div>
                  ) : (
                    <>
                      <Textarea
                        value={subagentTask}
                        onChange={(e) => setSubagentTask(e.target.value)}
                        placeholder="Task for background sub-agent… (primary a0 stays available)"
                        className="text-xs min-h-[60px] max-h-[120px] resize-none"
                        data-testid="subagent-task-input"
                      />
                      <Button
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => launchSubagent.mutate()}
                        disabled={!subagentTask.trim() || launchSubagent.isPending}
                        data-testid="btn-launch-subagent"
                      >
                        {launchSubagent.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Zap className="h-3 w-3 mr-1" />}
                        Launch
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>

            <div ref={scrollRef} className="flex-1 overflow-auto p-4">
              {msgsLoading ? (
                <div className="flex flex-col gap-3">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-3/4" />)}
                </div>
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground" data-testid="no-messages">
                  <p className="text-sm">No messages yet</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {messages.map((m) => <MessageBubble key={m.id} message={m} />)}
                </div>
              )}
            </div>

            <div className="flex items-center gap-1 px-4 pt-2 border-t border-border">
              <Button
                size="sm"
                variant="ghost"
                className="text-xs h-7 gap-1 text-muted-foreground"
                onClick={() => focusMutation.mutate()}
                disabled={focusMutation.isPending}
                data-testid="btn-regain-focus"
                title="Regain model focus"
              >
                {focusMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Target className="h-3 w-3" />}
                Focus
              </Button>
            </div>
            <ChatInput onSend={(c) => sendMessage.mutate(c)} isSending={sendMessage.isPending} />
          </>
        )}
      </div>
    </div>
  );
}
// 310:0
