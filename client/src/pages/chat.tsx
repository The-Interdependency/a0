import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { MarkdownContent } from "@/lib/markdown";
import {
  Plus, Send, Trash2, ChevronLeft, Bot, User, Cpu, Sparkles,
  PanelLeftOpen, PanelLeftClose,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Conversation, Message } from "@shared/schema";

const MODELS = [
  { id: "gemini", label: "Gemini", icon: Sparkles, color: "text-blue-400" },
  { id: "grok", label: "Grok", icon: Cpu, color: "text-emerald-400" },
];

export default function ChatPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [activeConvId, setActiveConvId] = useState<number | null>(null);
  const [model, setModel] = useState<"gemini" | "grok">("gemini");
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: conversations = [], isLoading: convsLoading } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations"],
  });

  const { data: convDetail, isLoading: messagesLoading } = useQuery<
    Conversation & { messages: Message[] }
  >({
    queryKey: ["/api/conversations", activeConvId],
    enabled: !!activeConvId,
  });

  const messages = convDetail?.messages || [];

  const createConv = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/conversations", { title: "New Chat", model });
      return await res.json() as Conversation;
    },
    onSuccess: (conv: Conversation) => {
      qc.invalidateQueries({ queryKey: ["/api/conversations"] });
      setActiveConvId(conv.id);
      setSidebarOpen(false);
    },
  });

  const deleteConv = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/conversations/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/conversations"] });
      setActiveConvId(null);
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamContent]);

  async function sendMessage() {
    if (!input.trim() || streaming) return;
    let convId = activeConvId;

    if (!convId) {
      const conv = await createConv.mutateAsync();
      convId = conv.id;
    }

    const userMsg = input.trim();
    setInput("");
    setStreaming(true);
    setStreamContent("");

    qc.setQueryData(
      ["/api/conversations", convId],
      (prev: any) => ({
        ...prev,
        messages: [
          ...(prev?.messages || []),
          { id: Date.now(), role: "user", content: userMsg, conversationId: convId, createdAt: new Date() },
        ],
      })
    );

    try {
      const response = await fetch(`/api/conversations/${convId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: userMsg, model }),
      });

      if (!response.ok) throw new Error("Failed to send message");

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.content) {
                accumulated += data.content;
                setStreamContent(accumulated);
              }
              if (data.done) {
                setStreaming(false);
                setStreamContent("");
                qc.invalidateQueries({ queryKey: ["/api/conversations", convId] });
                qc.invalidateQueries({ queryKey: ["/api/conversations"] });
              }
            } catch {}
          }
        }
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
      setStreaming(false);
      setStreamContent("");
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  const activeModel = MODELS.find((m) => m.id === model)!;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar */}
      <div
        className={cn(
          "absolute inset-y-0 left-0 z-40 w-72 flex flex-col bg-card border-r border-border transition-transform duration-200",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between p-3 border-b border-border">
          <span className="font-semibold text-sm">Conversations</span>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setSidebarOpen(false)}
            data-testid="button-close-sidebar"
          >
            <PanelLeftClose className="w-4 h-4" />
          </Button>
        </div>
        <div className="p-2">
          <Button
            className="w-full justify-start gap-2"
            variant="secondary"
            onClick={() => { createConv.mutate(); }}
            data-testid="button-new-chat"
          >
            <Plus className="w-4 h-4" />
            New Chat
          </Button>
        </div>
        <ScrollArea className="flex-1 px-2">
          {convsLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full mb-1 rounded-md" />
            ))
          ) : (
            conversations.map((c) => (
              <div
                key={c.id}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-2 cursor-pointer group mb-0.5",
                  activeConvId === c.id ? "bg-accent text-accent-foreground" : "hover-elevate"
                )}
                onClick={() => { setActiveConvId(c.id); setSidebarOpen(false); }}
                data-testid={`conv-item-${c.id}`}
              >
                <MessageSquareIcon className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
                <span className="text-xs flex-1 truncate">{c.title}</span>
                <button
                  className="invisible group-hover:visible text-muted-foreground"
                  onClick={(e) => { e.stopPropagation(); deleteConv.mutate(c.id); }}
                  data-testid={`button-delete-conv-${c.id}`}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))
          )}
        </ScrollArea>
      </div>

      {/* Overlay */}
      {sidebarOpen && (
        <div
          className="absolute inset-0 z-30 bg-black/40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main area */}
      <div className="flex flex-col flex-1 min-w-0 h-full">
        {/* Header */}
        <header className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card flex-shrink-0">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setSidebarOpen(true)}
            data-testid="button-open-sidebar"
          >
            <PanelLeftOpen className="w-4 h-4" />
          </Button>
          <div className="flex-1 flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
              <Bot className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
            <span className="font-semibold text-sm truncate">
              {convDetail?.title || "a0p Agent"}
            </span>
          </div>
          <div className="flex gap-1">
            {MODELS.map((m) => (
              <button
                key={m.id}
                onClick={() => setModel(m.id as any)}
                className={cn(
                  "flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors",
                  model === m.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground"
                )}
                data-testid={`button-model-${m.id}`}
              >
                <m.icon className="w-3 h-3" />
                {m.label}
              </button>
            ))}
          </div>
        </header>

        {/* Messages */}
        <ScrollArea className="flex-1 px-3 py-2">
          {!activeConvId && !streaming && (
            <div className="flex flex-col items-center justify-center h-full py-16 gap-4 text-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Bot className="w-8 h-8 text-primary" />
              </div>
              <div>
                <h2 className="font-bold text-xl mb-1">a0p Agent</h2>
                <p className="text-muted-foreground text-sm max-w-xs">
                  Your AI-powered mobile agent. Ask anything — cloud automation, files, Gmail, Drive, and more.
                </p>
              </div>
              <div className="flex gap-2 flex-wrap justify-center">
                {["Parse spec.md", "List Drive files", "Check Gmail", "Run a command"].map((s) => (
                  <button
                    key={s}
                    onClick={() => { setInput(s); textareaRef.current?.focus(); }}
                    className="px-3 py-1.5 rounded-full text-xs border border-border bg-card hover-elevate"
                    data-testid={`suggestion-${s.replace(/\s+/g, "-").toLowerCase()}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messagesLoading && activeConvId && (
            <div className="space-y-3 py-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className={cn("flex gap-2", i % 2 === 0 ? "" : "flex-row-reverse")}>
                  <Skeleton className="w-6 h-6 rounded-full flex-shrink-0" />
                  <Skeleton className={cn("h-14 rounded-xl", i % 2 === 0 ? "w-64" : "w-48")} />
                </div>
              ))}
            </div>
          )}

          <div className="space-y-3 pb-2">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            {streaming && streamContent && (
              <MessageBubble
                message={{
                  id: -1,
                  role: "assistant",
                  content: streamContent,
                  conversationId: activeConvId!,
                  model,
                  metadata: null,
                  createdAt: new Date(),
                }}
                isStreaming
              />
            )}
            {streaming && !streamContent && (
              <div className="flex gap-2 items-start">
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Bot className="w-3.5 h-3.5 text-primary" />
                </div>
                <div className="bg-card border border-card-border rounded-xl px-3 py-2">
                  <div className="flex gap-1 items-center h-5">
                    <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}
          </div>
          <div ref={bottomRef} />
        </ScrollArea>

        {/* Input */}
        <div className="px-3 py-2 border-t border-border bg-card flex-shrink-0">
          <div className="flex gap-2 items-end">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder={`Message a0p (${activeModel.label})...`}
              className="resize-none min-h-[40px] max-h-32 text-sm"
              rows={1}
              disabled={streaming}
              data-testid="input-message"
            />
            <Button
              size="icon"
              onClick={sendMessage}
              disabled={!input.trim() || streaming}
              data-testid="button-send"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex items-center gap-1 mt-1.5">
            <activeModel.icon className={cn("w-3 h-3", activeModel.color)} />
            <span className={cn("text-xs", activeModel.color)}>{activeModel.label} active</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageSquareIcon({ className }: { className?: string }) {
  return <Bot className={className} />;
}

function MessageBubble({ message, isStreaming }: { message: Message; isStreaming?: boolean }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex gap-2 items-start", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5",
          isUser ? "bg-secondary" : "bg-primary/10"
        )}
      >
        {isUser ? <User className="w-3.5 h-3.5 text-secondary-foreground" /> : <Bot className="w-3.5 h-3.5 text-primary" />}
      </div>
      <div
        className={cn(
          "max-w-[80%] rounded-xl px-3 py-2 text-sm",
          isUser
            ? "bg-primary text-primary-foreground rounded-tr-sm"
            : "bg-card border border-card-border rounded-tl-sm"
        )}
        data-testid={`message-${message.id}`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        ) : (
          <div className="break-words [&_.markdown-content]:text-sm [&_.code-block]:bg-black/20 [&_.code-block]:rounded-md [&_.code-block]:p-2 [&_.code-block]:text-xs [&_.code-block]:overflow-x-auto [&_.code-block]:my-1 [&_.code-block]:font-mono [&_.inline-code]:bg-black/20 [&_.inline-code]:px-1 [&_.inline-code]:rounded [&_.inline-code]:text-xs [&_.inline-code]:font-mono [&_.md-h1]:text-base [&_.md-h1]:font-bold [&_.md-h1]:mb-1 [&_.md-h2]:text-sm [&_.md-h2]:font-bold [&_.md-h2]:mb-1 [&_.md-h3]:text-sm [&_.md-h3]:font-semibold [&_.md-h3]:mb-0.5 [&_.md-ul]:pl-4 [&_.md-li]:list-disc">
            <MarkdownContent content={message.content} />
            {isStreaming && (
              <span className="inline-block w-0.5 h-3.5 bg-current ml-0.5 animate-pulse" />
            )}
          </div>
        )}
        {message.model && (
          <div className="mt-1 opacity-50 text-[10px]">{message.model}</div>
        )}
      </div>
    </div>
  );
}
