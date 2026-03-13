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
import { usePopout } from "@/lib/popout-context";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus, Send, Trash2, Bot, User, ChevronRight,
  PanelLeftOpen, PanelLeftClose, Terminal as TermIcon,
  FileText, Mail, HardDrive, Search, Pencil,
  Activity, Shield, Zap, Layers, Pin,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Conversation, Message } from "@shared/schema";

const CHAT_MODELS = [
  { id: "agent", label: "Agent (Tools)", icon: Shield },
  { id: "gemini", label: "Gemini", icon: Zap },
  { id: "grok", label: "Grok", icon: Zap },
  { id: "synthesis", label: "Synthesis", icon: Layers },
] as const;

const TOOL_ICONS: Record<string, typeof TermIcon> = {
  run_command: TermIcon,
  read_file: FileText,
  write_file: Pencil,
  list_files: FileText,
  search_files: Search,
  list_gmail: Mail,
  read_gmail: Mail,
  send_gmail: Mail,
  list_drive: HardDrive,
};

const TOOL_LABELS: Record<string, string> = {
  run_command: "Running command",
  read_file: "Reading file",
  write_file: "Writing file",
  list_files: "Listing files",
  search_files: "Searching files",
  list_gmail: "Checking Gmail",
  read_gmail: "Reading email",
  send_gmail: "Sending email",
  list_drive: "Browsing Drive",
};

interface ToolAction {
  type: "tool_call" | "tool_result";
  name: string;
  args?: any;
  result?: string;
}

export default function ChatPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [activeConvId, setActiveConvIdState] = useState<number | null>(() => {
    const stored = localStorage.getItem("a0p-active-conv");
    if (stored) {
      const parsed = parseInt(stored, 10);
      return isNaN(parsed) ? null : parsed;
    }
    return null;
  });

  const setActiveConvId = (id: number | null) => {
    setActiveConvIdState(id);
    if (id !== null) {
      localStorage.setItem("a0p-active-conv", String(id));
    } else {
      localStorage.removeItem("a0p-active-conv");
    }
  };
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState("");
  const [toolActions, setToolActions] = useState<ToolAction[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    return localStorage.getItem("a0p-selected-model") || "agent";
  });

  function handleSetModel(model: string) {
    setSelectedModel(model);
    localStorage.setItem("a0p-selected-model", model);
  }
  const [synthesisPhase, setSynthesisPhase] = useState<string | null>(null);
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

  const { data: engineStatus } = useQuery<{ status: string }>({
    queryKey: ["/api/a0p/status"],
    refetchInterval: 30000,
  });

  const messages = convDetail?.messages || [];

  const createConv = useMutation({
    mutationFn: async (model?: string) => {
      const res = await apiRequest("POST", "/api/conversations", { title: "New Task", model: model || selectedModel });
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
    if (!convsLoading && activeConvId !== null) {
      const exists = conversations.some((c) => c.id === activeConvId);
      if (!exists) {
        setActiveConvId(null);
      }
    }
  }, [convsLoading, conversations]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamContent, toolActions]);

  async function sendMessage() {
    if (!input.trim() || streaming) return;
    let convId = activeConvId;

    if (!convId) {
      const conv = await createConv.mutateAsync(selectedModel);
      convId = conv.id;
    }

    const userMsg = input.trim();
    setInput("");
    setStreaming(true);
    setStreamContent("");
    setToolActions([]);
    setSynthesisPhase(null);

    qc.setQueryData(
      ["/api/conversations", convId],
      (prev: any) => ({
        ...prev,
        messages: [
          ...(prev?.messages || []),
          { id: Date.now(), role: "user", content: userMsg, conversationId: convId, model: "agent", createdAt: new Date() },
        ],
      })
    );

    try {
      const response = await fetch(`/api/conversations/${convId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: userMsg, model: selectedModel }),
      });

      if (!response.ok) throw new Error("Failed to send");

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
              if (data.synthesis && data.phase) {
                setSynthesisPhase(data.phase);
              }
              if (data.content) {
                accumulated += data.content;
                setStreamContent(accumulated);
              }
              if (data.tool_call) {
                setToolActions((prev) => [...prev, { type: "tool_call", name: data.tool_call.name, args: data.tool_call.args }]);
              }
              if (data.tool_result) {
                setToolActions((prev) => [...prev, { type: "tool_result", name: data.tool_result.name, result: data.tool_result.result }]);
              }
              if (data.done) {
                setStreaming(false);
                setStreamContent("");
                setToolActions([]);
                setSynthesisPhase(null);
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
      setToolActions([]);
      setSynthesisPhase(null);
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      sendMessage();
    }
  }

  function autoResize(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }

  const isEngineRunning = engineStatus?.status === "RUNNING";

  return (
    <div className="flex h-full overflow-hidden">
      <div
        className={cn(
          "absolute inset-y-0 left-0 z-40 w-72 flex flex-col bg-card border-r border-border transition-transform duration-200",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between p-3 border-b border-border">
          <span className="font-semibold text-sm">Tasks</span>
          <Button size="icon" variant="ghost" onClick={() => setSidebarOpen(false)} data-testid="button-close-sidebar">
            <PanelLeftClose className="w-4 h-4" />
          </Button>
        </div>
        <div className="p-2">
          <Button className="w-full justify-start gap-2" variant="secondary" onClick={() => createConv.mutate(undefined)} data-testid="button-new-task">
            <Plus className="w-4 h-4" />
            New Task
          </Button>
        </div>
        <ScrollArea className="flex-1 px-2">
          {convsLoading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full mb-1 rounded-md" />)
          ) : (
            conversations.map((c) => (
              <div
                key={c.id}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-2 cursor-pointer group mb-0.5",
                  activeConvId === c.id ? "bg-accent text-accent-foreground" : "hover-elevate"
                )}
                onClick={() => { setActiveConvId(c.id); setSidebarOpen(false); }}
                data-testid={`task-item-${c.id}`}
              >
                <Zap className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
                <span className="text-xs flex-1 truncate">{c.title}</span>
                <button
                  className="invisible group-hover:visible text-muted-foreground"
                  onClick={(e) => { e.stopPropagation(); deleteConv.mutate(c.id); }}
                  data-testid={`button-delete-task-${c.id}`}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))
          )}
        </ScrollArea>
      </div>

      {sidebarOpen && <div className="absolute inset-0 z-30 bg-black/40" onClick={() => setSidebarOpen(false)} />}

      <div className="flex flex-col flex-1 min-w-0 h-full">
        <header className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card flex-shrink-0">
          <Button size="icon" variant="ghost" onClick={() => setSidebarOpen(true)} data-testid="button-open-sidebar">
            <PanelLeftOpen className="w-4 h-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <span className="font-semibold text-sm truncate block" data-testid="text-agent-title">
              {convDetail?.title || "a0p"}
            </span>
          </div>
          <div className={cn(
            "w-2 h-2 rounded-full flex-shrink-0",
            isEngineRunning ? "bg-green-400" : "bg-red-400"
          )} data-testid="badge-engine-status" title={isEngineRunning ? "operational" : "stopped"} />
        </header>

        <ScrollArea className="flex-1 px-3 pr-4 py-2">
          {!activeConvId && !streaming && (
            <div className="flex flex-col items-center justify-center h-full py-12 gap-5 text-center">
              <div className="relative">
                <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20">
                  <Shield className="w-10 h-10 text-primary" />
                </div>
                <div className={cn(
                  "absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-background",
                  isEngineRunning ? "bg-green-400" : "bg-red-400"
                )} />
              </div>
              <div>
                <h2 className="font-bold text-xl mb-1">agent zero</h2>
                <p className="text-muted-foreground text-xs max-w-xs">
                  Autonomous AI agent with tool access. Give me a task — I'll execute commands, manage files, check email, and browse Drive.
                </p>
              </div>
              <div className="w-full max-w-sm space-y-2">
                {[
                  { label: "List project files", icon: FileText },
                  { label: "Check my Gmail inbox", icon: Mail },
                  { label: "Show system info", icon: TermIcon },
                  { label: "Search codebase for TODO", icon: Search },
                ].map((s) => (
                  <button
                    key={s.label}
                    onClick={() => { setInput(s.label); textareaRef.current?.focus(); }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-xs border border-border bg-card hover-elevate text-left"
                    data-testid={`suggestion-${s.label.replace(/\s+/g, "-").toLowerCase()}`}
                  >
                    <s.icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <span>{s.label}</span>
                    <ChevronRight className="w-3 h-3 text-muted-foreground ml-auto" />
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
              <AgentMessage key={msg.id} message={msg} />
            ))}
            {streaming && toolActions.length > 0 && (
              <ToolActionsDisplay actions={toolActions} />
            )}
            {streaming && streamContent && (
              <AgentMessage
                message={{
                  id: -1, role: "assistant", content: streamContent,
                  conversationId: activeConvId!, model: "agent", metadata: null, createdAt: new Date(),
                }}
                isStreaming
              />
            )}
            {streaming && !streamContent && toolActions.length === 0 && (
              <div className="flex gap-2 items-start">
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  {selectedModel === "synthesis" ? (
                    <Layers className="w-3.5 h-3.5 text-primary" />
                  ) : (
                    <Shield className="w-3.5 h-3.5 text-primary" />
                  )}
                </div>
                <div className="bg-card border border-border rounded-xl px-3 py-2">
                  <div className="flex gap-1 items-center h-5">
                    <span className="text-xs text-muted-foreground mr-1">
                      {synthesisPhase === "parallel"
                        ? "querying Gemini + Grok"
                        : synthesisPhase === "merging"
                        ? "merging responses"
                        : "thinking"}
                    </span>
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

        <div className="px-3 pt-2 pb-2 border-t border-border bg-card flex-shrink-0 space-y-2">
          <div className="flex gap-2 items-end">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => { setInput(e.target.value); autoResize(e.target); }}
              onKeyDown={handleKey}
              placeholder="Give a0p a task… (Enter = new line, Ctrl+Enter = send)"
              className="resize-none min-h-[44px] text-sm flex-1"
              rows={2}
              disabled={streaming}
              data-testid="input-message"
              style={{ overflow: "hidden" }}
            />
            <Button size="icon" onClick={sendMessage} disabled={!input.trim() || streaming} data-testid="button-send">
              <Send className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            <span className="text-[9px] text-muted-foreground flex-shrink-0">model:</span>
            {CHAT_MODELS.map((m) => (
              <button
                key={m.id}
                onClick={() => handleSetModel(m.id)}
                className={cn(
                  "flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap transition-colors border flex-shrink-0",
                  selectedModel === m.id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-muted-foreground border-border hover:text-foreground"
                )}
                data-testid={`model-pill-${m.id}`}
              >
                <m.icon className="w-2.5 h-2.5" />
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolActionsDisplay({ actions }: { actions: ToolAction[] }) {
  return (
    <div className="space-y-1.5">
      {actions.map((action, i) => {
        const Icon = TOOL_ICONS[action.name] || TermIcon;
        if (action.type === "tool_call") {
          return (
            <div key={i} className="flex items-start gap-2" data-testid={`tool-call-${i}`}>
              <div className="w-6 h-6 rounded-full bg-amber-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Icon className="w-3 h-3 text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-medium text-amber-400">
                  {TOOL_LABELS[action.name] || action.name}
                </div>
                {action.args && (
                  <div className="text-[10px] font-mono text-muted-foreground truncate">
                    {action.args.command || action.args.path || action.args.pattern || action.args.to || JSON.stringify(action.args).slice(0, 80)}
                  </div>
                )}
              </div>
              <div className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse mt-2" />
            </div>
          );
        }
        return (
          <div key={i} className="ml-8 rounded-md bg-background border border-border p-2 max-h-32 overflow-auto min-w-0" data-testid={`tool-result-${i}`}>
            <pre className="text-[10px] font-mono text-muted-foreground whitespace-pre-wrap break-all max-w-full">
              {action.result?.slice(0, 1000) || "(no output)"}
            </pre>
          </div>
        );
      })}
    </div>
  );
}

function AgentMessage({ message, isStreaming }: { message: Message; isStreaming?: boolean }) {
  const isUser = message.role === "user";
  const { pinContent, content: pinnedContent } = usePopout();
  const isPinned = pinnedContent === message.content;

  return (
    <div className={cn("flex gap-2 items-start group", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5",
          isUser ? "bg-secondary" : "bg-primary/10"
        )}
      >
        {isUser ? <User className="w-3.5 h-3.5 text-secondary-foreground" /> : <Shield className="w-3.5 h-3.5 text-primary" />}
      </div>
      <div className="flex flex-col gap-1 max-w-[85%] min-w-0">
        <div
          className={cn(
            "rounded-xl px-3 py-2 text-sm overflow-hidden min-w-0",
            isUser
              ? "bg-primary text-primary-foreground rounded-tr-sm"
              : "bg-card border border-border rounded-tl-sm"
          )}
          data-testid={`message-${message.id}`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
          ) : (
            <div className="break-words min-w-0 [&_.markdown-content]:text-sm [&_.markdown-content]:min-w-0 [&_.code-block]:bg-black/20 [&_.code-block]:rounded-md [&_.code-block]:p-2 [&_.code-block]:text-xs [&_.code-block]:overflow-x-auto [&_.code-block]:my-1 [&_.code-block]:font-mono [&_.code-block]:max-w-full [&_.inline-code]:bg-black/20 [&_.inline-code]:px-1 [&_.inline-code]:rounded [&_.inline-code]:text-xs [&_.inline-code]:font-mono [&_.inline-code]:break-all [&_.md-h1]:text-base [&_.md-h1]:font-bold [&_.md-h1]:mb-1 [&_.md-h2]:text-sm [&_.md-h2]:font-bold [&_.md-h2]:mb-1 [&_.md-h3]:text-sm [&_.md-h3]:font-semibold [&_.md-h3]:mb-0.5 [&_.md-ul]:pl-4 [&_.md-li]:list-disc">
              <MarkdownContent content={message.content} />
              {isStreaming && (
                <span className="inline-block w-0.5 h-3.5 bg-current ml-0.5 animate-pulse" />
              )}
            </div>
          )}
        </div>
        {!isUser && !isStreaming && (
          <button
            onClick={() => pinContent(message.content, "Pinned Response")}
            className={cn(
              "self-start flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors",
              isPinned
                ? "text-primary bg-primary/10"
                : "text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-primary hover:bg-primary/10"
            )}
            data-testid={`button-pin-${message.id}`}
            title="Pin this response"
          >
            <Pin className="w-2.5 h-2.5" />
            {isPinned ? "pinned" : "pin"}
          </button>
        )}
      </div>
    </div>
  );
}
