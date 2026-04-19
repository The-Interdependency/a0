// 233:0
import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useSEO } from "@/hooks/use-seo";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Loader2, Bot, Zap, Target, AlertTriangle, ChevronDown, ChevronUp, X, Archive, Menu,
} from "lucide-react";
import {
  type Message,
  MessageBubble,
} from "@/components/chat-messages";
import {
  type Conversation,
  ConversationList,
  ContextBoostPanel,
  ChatInput,
} from "@/components/chat-widgets";

const CONV_KEY = "a0p_active_conv";

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

  const clearActiveConv = () => {
    localStorage.removeItem(CONV_KEY);
    setActiveConvId(null);
  };

  const { data: messages = [], isLoading: msgsLoading } = useQuery<Message[]>({
    queryKey: ["/api/v1/conversations", activeConvId, "messages"],
    enabled: !!activeConvId,
    refetchInterval: 5_000,
    retry: false,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/v1/conversations/${activeConvId}/messages`);
      if (res.status === 404) {
        // Stale localStorage id — drop it and let auto-select pick a fresh one.
        clearActiveConv();
        return [];
      }
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  useEffect(() => {
    // Only run validation once the conversations list has actually loaded.
    if (convsLoading || !activeConvId) return;
    const inActive = conversations.some((c) => c.id === activeConvId);
    if (inActive) return;
    const inArchived = archivedConvs.some((c) => c.id === activeConvId);
    if (inArchived) return;
    // Active id refers to a conversation we can't see — clear it. If there
    // are other conversations, jump to the most recent; otherwise leave
    // empty (user will land on the "Start a conversation" card).
    if (conversations.length > 0) selectConv(conversations[0].id);
    else clearActiveConv();
  }, [conversations, archivedConvs, activeConvId, convsLoading]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
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
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/v1/conversations/${id}`); },
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

  const archiveAll = useMutation({
    mutationFn: async () => {
      await Promise.all(conversations.map((c) =>
        apiRequest("PATCH", `/api/v1/conversations/${c.id}/archive`, { archived: true })
      ));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/v1/conversations"] });
      qc.invalidateQueries({ queryKey: ["/api/v1/conversations", "archived"] });
      setActiveConvId(null);
      toast({ title: `Archived ${conversations.length} conversation${conversations.length !== 1 ? "s" : ""}` });
    },
    onError: (e: Error) => toast({ title: "Archive failed", description: e.message, variant: "destructive" }),
  });

  const sendMessage = useMutation({
    mutationFn: async (content: string) => {
      if (!activeConvId) throw new Error("No conversation selected");
      const res = await apiRequest("POST", `/api/v1/conversations/${activeConvId}/messages`, { role: "user", content });
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/v1/conversations", activeConvId, "messages"] }); },
    onError: (e: Error) => toast({ title: "Focus failed", description: e.message, variant: "destructive" }),
  });

  const [showSidebar, setShowSidebar] = useState(false);
  const [subagentTask, setSubagentTask] = useState("");
  const [showSubagent, setShowSubagent] = useState(false);
  const [subagentConvId, setSubagentConvId] = useState<number | null>(null);

  const { data: subagentStatus } = useQuery<{ status: string; reply?: string; error?: string }>({
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
      const res = await apiRequest("POST", "/api/v1/subagent", { task: subagentTask, parent_conv_id: activeConvId });
      return res.json();
    },
    onSuccess: (data) => {
      setSubagentConvId(data.subagent_conv_id);
      setSubagentTask("");
      toast({ title: "Sub-agent launched", description: "Primary a0 remains available." });
    },
    onError: (e: Error) => toast({ title: "Sub-agent failed", description: e.message, variant: "destructive" }),
  });

  const activeTitle = conversations.find((c) => c.id === activeConvId)?.title ?? "a0p";

  const sidebar = convsLoading ? (
    <div className="p-3 space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
  ) : (
    <ConversationList
      conversations={conversations} archivedConvs={archivedConvs} activeId={activeConvId}
      onSelect={(id) => { selectConv(id); setShowSidebar(false); }}
      onCreate={() => { createConv.mutate(); setShowSidebar(false); }}
      onDelete={(id) => deleteConv.mutate(id)}
      onArchive={(id, archived) => archiveConv.mutate({ id, archived })}
      onArchiveAll={() => archiveAll.mutate()}
      isCreating={createConv.isPending} showArchived={showArchived}
      onToggleArchived={() => setShowArchived(!showArchived)}
    />
  );

  return (
    <div className="flex h-full" data-testid="chat-page">
      {/* mobile overlay drawer */}
      {showSidebar && (
        <div className="fixed inset-0 z-50 flex md:hidden" data-testid="mobile-sidebar-overlay">
          <div className="w-72 h-full bg-background shadow-xl flex flex-col">{sidebar}</div>
          <button
            type="button"
            aria-label="Close sidebar"
            className="flex-1 bg-black/40"
            onClick={() => setShowSidebar(false)}
            data-testid="btn-close-mobile-sidebar"
          />
        </div>
      )}

      {/* desktop sidebar */}
      <div className="w-56 shrink-0 hidden md:flex md:flex-col">{sidebar}</div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* mobile top bar */}
        <div className="flex items-center gap-2 px-2 py-1 border-b border-border bg-card md:hidden" data-testid="mobile-chat-header">
          <Button size="icon" variant="ghost" className="h-10 w-10 shrink-0" onClick={() => setShowSidebar(true)} data-testid="btn-open-sidebar">
            <Menu className="h-5 w-5" />
          </Button>
          <span className="flex-1 text-sm font-medium truncate text-foreground">{activeTitle}</span>
          <Button size="icon" variant="ghost" className="h-10 w-10 shrink-0" onClick={() => createConv.mutate()} disabled={createConv.isPending} data-testid="btn-new-chat-mobile">
            {createConv.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </Button>
        </div>
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

            <div className="border-b border-border" data-testid="subagent-panel">
              <button className="w-full flex items-center gap-2 px-4 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors" onClick={() => setShowSubagent(!showSubagent)} data-testid="btn-toggle-subagent">
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
                        {subagentStatus.status !== "running" && (
                          <button
                            className="text-primary hover:underline text-[10px]"
                            onClick={() => { selectConv(subagentConvId); setShowSubagent(false); setSubagentConvId(null); }}
                            data-testid="btn-view-subagent-conv"
                          >
                            View conversation
                          </button>
                        )}
                        <button className="ml-auto text-muted-foreground hover:text-foreground" onClick={() => setSubagentConvId(null)} data-testid="btn-close-subagent"><X className="h-3 w-3" /></button>
                      </div>
                      {subagentStatus.reply && <pre className="text-[10px] bg-muted rounded p-2 whitespace-pre-wrap max-h-32 overflow-auto" data-testid="subagent-reply">{subagentStatus.reply}</pre>}
                      {subagentStatus.error && <p className="text-[10px] text-destructive" data-testid="subagent-error">{subagentStatus.error}</p>}
                    </div>
                  ) : (
                    <>
                      <Textarea value={subagentTask} onChange={(e) => setSubagentTask(e.target.value)} placeholder="Task for background sub-agent… (primary a0 stays available)" className="text-xs min-h-[60px] max-h-[120px] resize-none" data-testid="subagent-task-input" />
                      <Button size="sm" className="text-xs h-7" onClick={() => launchSubagent.mutate()} disabled={!subagentTask.trim() || launchSubagent.isPending} data-testid="btn-launch-subagent">
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
                <div className="flex flex-col gap-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-3/4" />)}</div>
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground" data-testid="no-messages"><p className="text-sm">No messages yet</p></div>
              ) : (
                <div className="flex flex-col gap-3">
                  {messages.map((m) => <MessageBubble key={m.id} message={m} onSend={(c) => sendMessage.mutate(c)} />)}
                </div>
              )}
            </div>

            <div className="flex items-center gap-1 px-4 pt-2 border-t border-border">
              <Button size="sm" variant="ghost" className="text-xs h-7 gap-1 text-muted-foreground" onClick={() => focusMutation.mutate()} disabled={focusMutation.isPending} data-testid="btn-regain-focus" title="Regain model focus">
                {focusMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Target className="h-3 w-3" />}
                Focus
              </Button>
              {activeConvId && (
                <Button size="sm" variant="ghost" className="text-xs h-7 gap-1 text-muted-foreground ml-auto" onClick={() => archiveConv.mutate({ id: activeConvId, archived: true })} disabled={archiveConv.isPending} data-testid="btn-archive-current" title="Archive this conversation">
                  {archiveConv.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Archive className="h-3 w-3" />}
                  Archive
                </Button>
              )}
            </div>
            <ChatInput onSend={(c) => sendMessage.mutate(c)} isSending={sendMessage.isPending} />
          </>
        )}
      </div>
    </div>
  );
}
// 233:0
