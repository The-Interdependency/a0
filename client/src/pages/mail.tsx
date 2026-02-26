import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Mail, RefreshCw, Send, ChevronLeft, AlertCircle, Inbox, Pen,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface EmailSummary {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
}

interface EmailDetail extends EmailSummary {
  to: string;
  body: string;
}

function formatDate(dateStr: string) {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return dateStr.slice(0, 10);
  }
}

function fromShort(from: string) {
  const match = from.match(/^([^<]+)</);
  if (match) return match[1].trim();
  return from.split("@")[0];
}

export default function MailPage() {
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const { data: emails, isLoading, error, refetch } = useQuery<EmailSummary[]>({
    queryKey: ["/api/gmail/messages"],
    queryFn: async () => {
      const res = await fetch("/api/gmail/messages");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      return data;
    },
  });

  const { data: emailDetail, isLoading: detailLoading } = useQuery<EmailDetail>({
    queryKey: ["/api/gmail/messages", selectedId],
    queryFn: async () => {
      const res = await fetch(`/api/gmail/messages/${selectedId}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      return data;
    },
    enabled: !!selectedId,
  });

  const sendEmail = useMutation({
    mutationFn: () => apiRequest("POST", "/api/gmail/send", { to, subject, body }),
    onSuccess: () => {
      toast({ title: "Sent", description: "Email sent successfully" });
      setComposeOpen(false);
      setTo(""); setSubject(""); setBody("");
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (selectedId) {
    return (
      <div className="flex flex-col h-full">
        <header className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card flex-shrink-0">
          <Button size="icon" variant="ghost" onClick={() => setSelectedId(null)} data-testid="button-mail-back">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="font-semibold text-sm flex-1 truncate">
            {emailDetail?.subject || "Loading..."}
          </span>
        </header>
        <ScrollArea className="flex-1 p-4">
          {detailLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-40 w-full mt-4" />
            </div>
          ) : emailDetail ? (
            <div>
              <h2 className="font-semibold text-base mb-2">{emailDetail.subject}</h2>
              <div className="text-xs text-muted-foreground space-y-0.5 mb-4">
                <p>From: <span className="text-foreground">{emailDetail.from}</span></p>
                <p>To: <span className="text-foreground">{emailDetail.to}</span></p>
                <p>Date: <span className="text-foreground">{emailDetail.date}</span></p>
              </div>
              <div className="border-t border-border pt-4">
                <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans break-words">
                  {emailDetail.body || emailDetail.snippet}
                </pre>
              </div>
            </div>
          ) : null}
        </ScrollArea>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card flex-shrink-0">
        <Inbox className="w-4 h-4 text-blue-400 flex-shrink-0" />
        <span className="font-semibold text-sm flex-1">Inbox</span>
        <Button size="icon" variant="ghost" onClick={() => refetch()} data-testid="button-mail-refresh">
          <RefreshCw className="w-4 h-4" />
        </Button>
        <Button size="icon" variant="ghost" onClick={() => setComposeOpen(true)} data-testid="button-compose">
          <Pen className="w-4 h-4" />
        </Button>
      </header>

      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="px-2 py-1 space-y-0.5">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-md" />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-center px-4">
            <AlertCircle className="w-8 h-8 text-destructive" />
            <div>
              <p className="font-medium text-sm">Gmail not connected</p>
              <p className="text-xs text-muted-foreground mt-1">
                Connect your Google account to access Gmail.
              </p>
            </div>
          </div>
        ) : (
          <div className="px-2 py-1 space-y-0.5">
            {emails?.map((email) => (
              <div
                key={email.id}
                className="rounded-md px-2 py-2.5 cursor-pointer hover-elevate"
                onClick={() => setSelectedId(email.id)}
                data-testid={`email-item-${email.id}`}
              >
                <div className="flex items-baseline justify-between gap-2 mb-0.5">
                  <span className="text-sm font-medium truncate">{fromShort(email.from)}</span>
                  <span className="text-[10px] text-muted-foreground flex-shrink-0">{formatDate(email.date)}</span>
                </div>
                <p className="text-xs font-medium truncate text-foreground/80">{email.subject}</p>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{email.snippet}</p>
              </div>
            ))}
            {emails?.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">No emails</div>
            )}
          </div>
        )}
      </ScrollArea>

      <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
        <DialogContent className="w-[95vw] max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="w-4 h-4" />
              Compose Email
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="To"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              data-testid="input-mail-to"
            />
            <Input
              placeholder="Subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              data-testid="input-mail-subject"
            />
            <Textarea
              placeholder="Message..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="min-h-[120px] resize-none"
              data-testid="textarea-mail-body"
            />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setComposeOpen(false)}>Cancel</Button>
            <Button
              onClick={() => sendEmail.mutate()}
              disabled={!to || !subject || !body || sendEmail.isPending}
              data-testid="button-send-mail"
            >
              <Send className="w-3.5 h-3.5 mr-1" />
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
