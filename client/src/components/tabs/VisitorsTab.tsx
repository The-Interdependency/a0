import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { MessageSquare, User, Shield, ChevronRight, ChevronDown, Send, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Conversation, Message } from "@shared/schema";

function timeAgo(date: string | Date): string {
  const ms = Date.now() - new Date(date).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function shortId(userId: string | null | undefined): string {
  if (!userId || userId === "default") return "anon";
  return userId.replace("visitor_", "").slice(0, 8);
}

function ConversationDetail({ conv, onInject }: { conv: Conversation; onInject: () => void }) {
  const { data, isLoading } = useQuery<Conversation & { messages: Message[] }>({
    queryKey: ["/api/v1/conversations", conv.id],
    refetchInterval: 5000,
  });
  const { toast } = useToast();
  const qc = useQueryClient();
  const [msg, setMsg] = useState("");

  const injectMutation = useMutation({
    mutationFn: (content: string) => apiRequest("POST", `/api/v1/admin/conversations/${conv.id}/inject`, { content }).then(r => r.json()),
    onSuccess: () => {
      setMsg("");
      qc.invalidateQueries({ queryKey: ["/api/v1/conversations", conv.id] });
      qc.invalidateQueries({ queryKey: ["/api/v1/admin/visitors"] });
      toast({ title: "Message sent to visitor" });
      onInject();
    },
    onError: () => toast({ title: "Failed to send", variant: "destructive" }),
  });

  const messages = data?.messages || [];

  return (
    <div className="border-t border-border mt-2 pt-2 space-y-2">
      {isLoading ? (
        <Skeleton className="h-20" />
      ) : (
        <ScrollArea className="h-52 rounded-md bg-muted/20 p-2">
          <div className="space-y-2">
            {messages.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No messages yet</p>}
            {messages.map((m) => (
              <div key={m.id} className={cn("flex gap-1.5 items-start", m.role === "user" ? "flex-row-reverse" : "")}>
                <div className={cn("w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5", m.role === "user" ? "bg-secondary" : "bg-primary/10")}>
                  {m.role === "user" ? <User className="w-2.5 h-2.5" /> : <Shield className="w-2.5 h-2.5 text-primary" />}
                </div>
                <div className={cn("rounded-lg px-2 py-1 text-[11px] max-w-[80%]", m.role === "user" ? "bg-primary text-primary-foreground" : "bg-card border border-border")}>
                  <p className="whitespace-pre-wrap break-words">{m.content}</p>
                  {(m as any).model === "owner" && <span className="text-[9px] opacity-60 block mt-0.5">— from owner</span>}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
      <div className="flex gap-2">
        <Textarea
          value={msg}
          onChange={e => setMsg(e.target.value)}
          placeholder="Send a direct message to this visitor…"
          className="text-xs min-h-[48px] resize-none flex-1"
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (msg.trim()) injectMutation.mutate(msg.trim()); } }}
          data-testid={`input-inject-${conv.id}`}
        />
        <Button
          size="sm"
          className="self-end h-8 w-8 p-0"
          onClick={() => { if (msg.trim()) injectMutation.mutate(msg.trim()); }}
          disabled={injectMutation.isPending || !msg.trim()}
          data-testid={`button-inject-${conv.id}`}
        >
          <Send className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}

export function VisitorsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<number | null>(null);

  const { data: conversations = [], isLoading, refetch } = useQuery<Conversation[]>({
    queryKey: ["/api/v1/admin/visitors"],
    refetchInterval: 10000,
  });

  if (isLoading) return <div className="p-4"><Skeleton className="h-40" /></div>;

  const uniqueVisitors = new Set(conversations.map(c => c.userId || "default")).size;

  return (
    <div className="h-full w-full overflow-y-auto overflow-x-hidden">
      <div className="p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold" data-testid="text-visitors-title">Visitor Conversations</h3>
            <p className="text-xs text-muted-foreground">{conversations.length} conversations · {uniqueVisitors} unique visitors</p>
          </div>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => refetch()} data-testid="button-refresh-visitors">
            <RefreshCw className="w-3 h-3" />
          </Button>
        </div>

        {conversations.length === 0 && (
          <div className="text-center py-8">
            <MessageSquare className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">No conversations yet. Visitors who chat with a0p will appear here.</p>
          </div>
        )}

        <div className="space-y-2">
          {conversations.map((conv) => {
            const isOpen = expanded === conv.id;
            const isVisitor = conv.userId && conv.userId !== "default" && conv.userId.startsWith("visitor_");
            return (
              <div key={conv.id} className="border border-border rounded-lg overflow-hidden" data-testid={`visitor-conv-${conv.id}`}>
                <button
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/30 transition-colors text-left"
                  onClick={() => setExpanded(isOpen ? null : conv.id)}
                  data-testid={`button-expand-conv-${conv.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Badge variant={isVisitor ? "default" : "secondary"} className="text-[9px] h-4 px-1 shrink-0">
                        {isVisitor ? `#${shortId(conv.userId)}` : "owner"}
                      </Badge>
                      <span className="text-xs font-medium truncate">{conv.title}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">{timeAgo(conv.updatedAt)}</span>
                  </div>
                  {isOpen ? <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" /> : <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
                </button>
                {isOpen && (
                  <div className="px-3 pb-3">
                    <ConversationDetail conv={conv} onInject={() => qc.invalidateQueries({ queryKey: ["/api/v1/admin/visitors"] })} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
