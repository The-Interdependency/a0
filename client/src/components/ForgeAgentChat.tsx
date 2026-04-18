import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Loader2, MessageSquare, Trash2, X } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { type Message, MessageBubble } from "@/components/chat-messages";
import { ChatInput } from "@/components/chat-widgets";

type Conversation = {
  id: number;
  title: string;
  model: string;
  agent_id: number | null;
  updated_at: string;
};

type Props = {
  agentId: number;
  agentName: string;
  onClose: () => void;
};

const lsKey = (agentId: number) => `a0p_forge_active_conv_${agentId}`;

export default function ForgeAgentChat({ agentId, agentName, onClose }: Props) {
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [activeConvId, setActiveConvId] = useState<number | null>(() => {
    const saved = localStorage.getItem(lsKey(agentId));
    return saved ? parseInt(saved, 10) : null;
  });

  const selectConv = (id: number | null) => {
    setActiveConvId(id);
    if (id == null) localStorage.removeItem(lsKey(agentId));
    else localStorage.setItem(lsKey(agentId), String(id));
  };

  const convsQ = useQuery<Conversation[]>({
    queryKey: ["/api/v1/conversations", { agent_id: agentId }],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/v1/conversations?agent_id=${agentId}`);
      return res.json();
    },
    refetchInterval: 15_000,
  });

  const messagesQ = useQuery<Message[]>({
    queryKey: ["/api/v1/conversations", activeConvId, "messages"],
    enabled: !!activeConvId,
    refetchInterval: 5_000,
  });

  // Auto-pick first conversation on mount or when active one disappears
  useEffect(() => {
    const list = convsQ.data || [];
    if (list.length === 0) return;
    if (!activeConvId || !list.find((c) => c.id === activeConvId)) {
      selectConv(list[0].id);
    }
  }, [convsQ.data]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messagesQ.data]);

  const newChat = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/v1/forge/agents/${agentId}/start-chat`, {});
      return res.json();
    },
    onSuccess: (data) => {
      const conv = data?.conversation;
      queryClient.invalidateQueries({ queryKey: ["/api/v1/conversations", { agent_id: agentId }] });
      if (conv?.id) selectConv(conv.id);
    },
    onError: (e: Error) => toast({ title: "Could not start chat", description: e.message, variant: "destructive" }),
  });

  const deleteConv = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/v1/conversations/${id}`),
    onSuccess: (_d, id) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/conversations", { agent_id: agentId }] });
      // Pick the next available conversation synchronously to avoid the
      // null→first flicker the auto-select effect would otherwise cause
      // while the invalidated list refetches.
      if (id === activeConvId) {
        const remaining = (convsQ.data || []).filter((c) => c.id !== id);
        selectConv(remaining[0]?.id ?? null);
      }
    },
  });

  const sendMessage = useMutation({
    mutationFn: async (content: string) => {
      if (!activeConvId) throw new Error("Pick or start a conversation first");
      const res = await apiRequest("POST", `/api/v1/conversations/${activeConvId}/messages`, {
        role: "user",
        content,
        agent_id: agentId,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/conversations", activeConvId, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/conversations", { agent_id: agentId }] });
    },
    onError: (e: Error) => toast({ title: "Send failed", description: e.message, variant: "destructive" }),
  });

  const conversations = convsQ.data || [];
  const messages = messagesQ.data || [];

  return (
    <div className="border rounded-lg bg-card flex flex-col h-[60vh] sm:h-[70vh] overflow-hidden"
         data-testid={`forge-chat-${agentId}`}>
      <div className="flex items-center gap-2 px-3 py-2 border-b">
        <MessageSquare className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold truncate">Chat with {agentName}</span>
        <Button size="sm" variant="ghost" className="ml-auto h-7 text-xs"
          onClick={() => newChat.mutate()}
          disabled={newChat.isPending}
          data-testid={`button-new-forge-chat-${agentId}`}>
          {newChat.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3 mr-1" />}
          New
        </Button>
        <Button size="icon" variant="ghost" className="h-7 w-7"
          onClick={onClose}
          data-testid={`button-close-forge-chat-${agentId}`}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {conversations.length > 1 && (
        <div className="flex gap-1 px-2 py-1 border-b overflow-x-auto" data-testid={`forge-conv-tabs-${agentId}`}>
          {conversations.map((c) => (
            <div key={c.id} className="flex items-center shrink-0">
              <button
                className={`text-xs px-2 py-1 rounded-l ${
                  c.id === activeConvId
                    ? "bg-primary/15 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted"
                }`}
                onClick={() => selectConv(c.id)}
                data-testid={`button-pick-forge-conv-${c.id}`}
              >
                {c.title.replace(/^⚔\s*/, "")}
              </button>
              <button
                className="text-xs px-1 py-1 rounded-r text-muted-foreground hover:text-destructive hover:bg-muted"
                onClick={() => deleteConv.mutate(c.id)}
                title="Delete this conversation"
                data-testid={`button-delete-forge-conv-${c.id}`}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-auto p-3">
        {convsQ.isLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => <Skeleton key={i} className="h-10 w-3/4" />)}
          </div>
        ) : conversations.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <p className="text-sm">No conversations with {agentName} yet.</p>
            <Button size="sm" onClick={() => newChat.mutate()} disabled={newChat.isPending}
              data-testid={`button-first-forge-chat-${agentId}`}>
              {newChat.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
              Start the first one
            </Button>
          </div>
        ) : messagesQ.isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-3/4" />)}
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <p className="text-sm">Say hello to {agentName}.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} onSend={(c) => sendMessage.mutate(c)} />
            ))}
          </div>
        )}
      </div>

      {!!activeConvId && (
        <ChatInput onSend={(c) => sendMessage.mutate(c)} isSending={sendMessage.isPending} />
      )}
    </div>
  );
}
