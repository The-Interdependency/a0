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
import { Plus, Send, Trash2, Bot, User, Loader2 } from "lucide-react";
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
  return (
    <div
      className={cn("flex gap-2 max-w-[85%]", isUser ? "ml-auto flex-row-reverse" : "")}
      data-testid={`message-${message.id}`}
    >
      <div className={cn(
        "flex items-center justify-center h-7 w-7 rounded-full shrink-0 mt-0.5",
        isUser ? "bg-primary/20" : "bg-muted"
      )}>
        {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
      </div>
      <div className={cn(
        "rounded-lg px-3 py-2 text-sm break-words",
        isUser ? "bg-primary text-primary-foreground" : "bg-muted"
      )}>
        <p className="whitespace-pre-wrap">{message.content}</p>
        {message.model && (
          <Badge variant="outline" className="mt-1 text-[9px]">{message.model}</Badge>
        )}
      </div>
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
            <ChatInput onSend={(c) => sendMessage.mutate(c)} isSending={sendMessage.isPending} />
          </>
        )}
      </div>
    </div>
  );
}
