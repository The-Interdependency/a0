// 410:0
import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useSEO } from "@/hooks/use-seo";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Plus, Send, Trash2, Bot, User, Loader2, AlertTriangle, ChevronDown, ChevronUp, Target, Zap, Copy, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Conversation {
  id: number;
  title: string | null;
  model: string | null;
  created_at: string;
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
    [key: string]: unknown;
  } | null;
}

const CONV_KEY = "a0p_active_conv";

function ConversationList({
  conversations,
  activeId,
  onSelect,
  onCreate,
  onDelete,
  isCreating,
}: {
  conversations: Conversation[];
  activeId: number | null;
  onSelect: (id: number) => void;
  onCreate: () => void;
  onDelete: (id: number) => void;
  isCreating: boolean;
}) {
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
          {conversations.map((c) => (
            <div
              key={c.id}
              className={cn(
                "group flex items-center justify-between px-3 py-2 rounded-md cursor-pointer text-xs transition-colors",
                c.id === activeId
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-muted"
              )}
              onClick={() => onSelect(c.id)}
              data-testid={`conversation-${c.id}`}
            >
              <span className="truncate flex-1">{c.title || `Conv #${c.id}`}</span>
              <Button
                size="icon"
                variant="ghost"
                className="h-5 w-5 opacity-0 group-hover:opacity-100 shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(c.id);
                }}
                data-testid={`delete-conversation-${c.id}`}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
          {conversations.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">No conversations</p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const isError = !isUser && message.metadata?.error === true;
  const isFocusRegain = message.metadata?.focus_regain === true;
  const [showDetail, setShowDetail] = useState(false);
  const { toast } = useToast();

  const copyError = () => {
    navigator.clipboard.writeText(message.metadata?.error_detail ?? message.content);
    toast({ title: "Error detail copied" });
  };

  return (
    <div
      className={cn("flex gap-2 max-w-[90%]", isUser ? "ml-auto flex-row-reverse" : "")}
      data-testid={`message-${message.id}`}
    >
      <div className={cn(
        "flex items-center justify-center h-7 w-7 rounded-full shrink-0 mt-0.5",
        isUser ? "bg-primary/20" : isError ? "bg-destructive/20" : isFocusRegain ? "bg-amber-500/20" : "bg-muted"
      )}>
        {isUser ? <User className="h-3.5 w-3.5" /> : isError ? <AlertTriangle className="h-3.5 w-3.5 text-destructive" /> : isFocusRegain ? <Target className="h-3.5 w-3.5 text-amber-500" /> : <Bot className="h-3.5 w-3.5" />}
      </div>
      <div className={cn(
        "rounded-lg px-3 py-2 text-sm break-words min-w-0",
        isUser ? "bg-primary text-primary-foreground" :
        isError ? "bg-destructive/10 border border-destructive/30 text-destructive-foreground" :
        isFocusRegain ? "bg-amber-500/10 border border-amber-500/30" :
        "bg-muted"
      )}>
        {isError && (
          <div className="flex items-center gap-1 mb-1">
            <span className="text-[10px] font-semibold text-destructive uppercase tracking-wide">Model Error</span>
            <button onClick={copyError} className="ml-auto opacity-60 hover:opacity-100" data-testid={`copy-error-${message.id}`}>
              <Copy className="h-3 w-3" />
            </button>
            <button onClick={() => setShowDetail(!showDetail)} className="opacity-60 hover:opacity-100" data-testid={`toggle-error-${message.id}`}>
              {showDetail ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          </div>
        )}
        <p className="whitespace-pre-wrap">{message.content}</p>
        {isError && showDetail && message.metadata?.error_detail && (
          <pre className="mt-2 text-[10px] bg-black/10 rounded p-2 overflow-x-auto whitespace-pre-wrap opacity-80" data-testid={`error-detail-${message.id}`}>
            {message.metadata.error_detail}
          </pre>
        )}
        {message.model && (
          <Badge variant="outline" className="mt-1 text-[9px]">{message.model}</Badge>
        )}
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

function ChatInput({
  onSend,
  isSending,
}: {
  onSend: (content: string) => void;
  isSending: boolean;
}) {
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

  const selectConv = (id: number) => {
    setActiveConvId(id);
    localStorage.setItem(CONV_KEY, String(id));
  };

  const { data: conversations = [], isLoading: convsLoading } = useQuery<Conversation[]>({
    queryKey: ["/api/v1/conversations"],
    refetchInterval: 15_000,
  });

  const { data: messages = [], isLoading: msgsLoading } = useQuery<Message[]>({
    queryKey: ["/api/v1/conversations", activeConvId, "messages"],
    enabled: !!activeConvId,
    refetchInterval: 5_000,
  });

  useEffect(() => {
    if (conversations.length > 0 && !conversations.find((c) => c.id === activeConvId)) {
      selectConv(conversations[0].id);
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
      if (conversations.length > 1) {
        const remaining = conversations.filter((c) => c.id !== activeConvId);
        if (remaining.length > 0) selectConv(remaining[0].id);
      } else {
        setActiveConvId(null);
      }
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

  const { data: subagentStatus, refetch: refetchSubagent } = useQuery<{
    status: string; reply?: string; error?: string;
  }>({
    queryKey: ["/api/v1/subagent", subagentConvId, "status"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/v1/subagent/${subagentConvId}/status`);
      return res.json();
    },
    enabled: !!subagentConvId && (subagentStatus?.status === "running" || !subagentStatus),
    refetchInterval: subagentConvId && subagentStatus?.status === "running" ? 3000 : false,
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
        <ConversationList
          conversations={conversations}
          activeId={activeConvId}
          onSelect={selectConv}
          onCreate={() => createConv.mutate()}
          onDelete={(id) => deleteConv.mutate(id)}
          isCreating={createConv.isPending}
        />
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
// 291:0
