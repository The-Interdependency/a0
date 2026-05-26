// 327:10 2:1 2:8
import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useSEO } from "@/hooks/use-seo";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Loader2, Bot, Target, Archive, Menu,
} from "lucide-react";
import {
  type Message,
  MessageBubble,
  conversationCostUSD,
  fmtCostUSD,
} from "@/components/chat-messages";
import { LiveOrchProgress } from "@/components/LiveOrchProgress";
import { Badge } from "@/components/ui/badge";
import {
  type Conversation,
  ConversationList,
  ContextBoostPanel,
  ChatInput,
  PreChatInspectorPanel,
  ConvToolsPopover,
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

  // Per-send state for the LiveOrchProgress panel; cleared on success.
  const [liveSend, setLiveSend] = useState<{
    runId: string;
    providers: string[];
    mode: string;
  } | null>(null);
  const sendMessage = useMutation({
    mutationFn: async (payload: {
      content: string;
      attachment_ids?: number[];
      orchestration_mode?: string;
      providers?: string[];
      cut_mode?: string;
      resolved_providers?: string[];
      model?: string;
    }) => {
      if (!activeConvId) throw new Error("No conversation selected");
      const isMulti =
        !!payload.orchestration_mode && payload.orchestration_mode !== "single";
      // Fallback id keeps the request flowing if crypto.randomUUID is missing.
      const runId = isMulti
        ? typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
        : null;
      if (runId) {
        setLiveSend({
          runId,
          providers: payload.resolved_providers ?? payload.providers ?? [],
          mode: payload.orchestration_mode ?? "",
        });
      }
      const body: Record<string, unknown> = {
        role: "user",
        content: payload.content,
        attachment_ids: payload.attachment_ids ?? [],
      };
      if (payload.orchestration_mode) body.orchestration_mode = payload.orchestration_mode;
      if (payload.providers && payload.providers.length) body.providers = payload.providers;
      if (payload.cut_mode) body.cut_mode = payload.cut_mode;
      // Per-message model override. Backend chain is body.model > agent
      // model > active_provider > conv.model — sending it here pins this
      // single turn to the chosen model without flipping global defaults.
      if (payload.model) body.model = payload.model;
      if (runId) body.client_run_id = runId;
      const res = await apiRequest("POST", `/api/v1/conversations/${activeConvId}/messages`, body);
      return res.json();
    },
    onSuccess: () => {
      setLiveSend(null);
      qc.invalidateQueries({ queryKey: ["/api/v1/conversations", activeConvId, "messages"] });
      qc.invalidateQueries({ queryKey: ["/api/v1/conversations"] });
    },
    onError: (e: Error) => {
      setLiveSend(null);
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
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

  const activeTitle = conversations.find((c) => c.id === activeConvId)?.title ?? "a0p";
  const runningCost = conversationCostUSD(messages);
  const showRunningCost = runningCost > 0;
  const runningCostBadge = showRunningCost ? (
    <Badge
      variant="outline"
      className="text-[10px] h-5 px-1.5 font-mono text-muted-foreground"
      title="Estimated USD spent on this conversation so far"
      data-testid="badge-running-cost"
    >
      {fmtCostUSD(runningCost)}
    </Badge>
  ) : null;

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
          {runningCostBadge}
          <Button size="icon" variant="ghost" className="h-10 w-10 shrink-0" onClick={() => createConv.mutate()} disabled={createConv.isPending} data-testid="btn-new-chat-mobile">
            {createConv.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </Button>
        </div>
        {/* desktop conversation header — shows the active conversation title and
            the running cost total so the user knows what they've spent without
            adding up per-message pills by hand. Hidden when no conversation is
            selected (the empty-state card already says "Start a conversation"). */}
        {activeConvId && (
          <div className="hidden md:flex items-center gap-2 px-4 py-1.5 border-b border-border bg-card/50" data-testid="desktop-chat-header">
            <span className="flex-1 text-sm font-medium truncate text-foreground" data-testid="text-conv-title">{activeTitle}</span>
            {runningCostBadge}
          </div>
        )}
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

            <div ref={scrollRef} className="flex-1 overflow-auto p-4">
              {msgsLoading ? (
                <div className="flex flex-col gap-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-3/4" />)}</div>
              ) : (
                <div className="flex flex-col gap-3">
                  {messages.length === 0 && !sendMessage.isPending && (
                    <PreChatInspectorPanel convId={activeConvId} />
                  )}
                  {messages.map((m) => <MessageBubble key={m.id} message={m} onSend={(c) => sendMessage.mutate({ content: c })} />)}
                  {/* Mounted for any in-flight multi-model send, including the first turn. */}
                  {sendMessage.isPending && liveSend && (
                    <LiveOrchProgress
                      clientRunId={liveSend.runId}
                      fallbackProviders={liveSend.providers}
                      fallbackMode={liveSend.mode}
                    />
                  )}
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
            <div className="flex items-end gap-1 border-t border-border">
              <ConvToolsPopover convId={activeConvId} />
              <div className="flex-1">
                <ChatInput
                  onSend={(content, attachment_ids, opts) =>
                    sendMessage.mutate({ content, attachment_ids, ...(opts ?? {}) })
                  }
                  isSending={sendMessage.isPending}
                  hideBorderTop
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
// 327:10 2:1 2:8
