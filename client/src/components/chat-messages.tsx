// 253:0
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Bot, User, Loader2 as _L, AlertTriangle, Target, Copy,
  ChevronDown, ChevronUp, CheckCheck,
  ShieldAlert, ShieldCheck, ShieldX, Info,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface UsageData {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  [key: string]: unknown;
}

export interface Message {
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

export function tokenCount(usage?: UsageData | null): number | null {
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

export function fmtTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

export function MarkdownContent({ content, isUser }: { content: string; isUser: boolean }) {
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
              className={cn("px-1 py-0.5 rounded text-[11px] font-mono", isUser ? "bg-primary-foreground/20" : "bg-black/10 dark:bg-white/10")}
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

export interface ApprovalGate {
  gateId: string;
  action: string;
  impact: string;
  rollback: string;
  approveCmd: string;
  scopeHints: { label: string; scope: string; cmd: string }[];
}

export function parseApprovalGate(content: string): ApprovalGate | null {
  if (!content.startsWith("[APPROVAL REQUIRED")) return null;
  const gateMatch = content.match(/gate_id:\s*(gate-[0-9a-f]+)/i);
  if (!gateMatch) return null;
  const gateId = gateMatch[1];
  const actionMatch = content.match(/^Action:\s*(.+)$/m);
  const impactMatch = content.match(/^Impact:\s*(.+)$/m);
  const rollbackMatch = content.match(/^Rollback:\s*(.+)$/m);
  const scopeRegex = /Pre-approve all ([^:]+):\s*(APPROVE SCOPE (\S+))/gm;
  const scopeHints: ApprovalGate["scopeHints"] = [];
  let m: RegExpExecArray | null;
  while ((m = scopeRegex.exec(content)) !== null) {
    scopeHints.push({ label: m[1].trim(), scope: m[3], cmd: m[2] });
  }
  return {
    gateId,
    action: (actionMatch?.[1] ?? "").trim(),
    impact: (impactMatch?.[1] ?? "").trim(),
    rollback: (rollbackMatch?.[1] ?? "").trim(),
    approveCmd: `APPROVE ${gateId}`,
    scopeHints,
  };
}

export type SystemStatus = { kind: "granted" | "denied" | "approved" | "error" | "unknown" | "info"; text: string };

export function parseSystemStatus(content: string): SystemStatus | null {
  if (content.startsWith("[SCOPE GRANTED]"))
    return { kind: "granted", text: content.replace("[SCOPE GRANTED]", "").trim() };
  if (content.startsWith("[SCOPE DENIED]"))
    return { kind: "denied", text: content.replace("[SCOPE DENIED]", "").trim() };
  if (content.startsWith("[SCOPE UNKNOWN]"))
    return { kind: "unknown", text: content.replace("[SCOPE UNKNOWN]", "").trim() };
  if (content.startsWith("[APPROVED —"))
    return { kind: "approved", text: content.replace(/^\[APPROVED[^\]]*\]/, "").trim() };
  if (content.startsWith("[APPROVE ERROR]"))
    return { kind: "error", text: content.replace("[APPROVE ERROR]", "").trim() };
  return null;
}

export function ApprovalCard({ gate, onSend }: { gate: ApprovalGate; onSend: (cmd: string) => void }) {
  const { toast } = useToast();
  const copy = (cmd: string) => { navigator.clipboard.writeText(cmd); toast({ title: "Copied" }); };
  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 space-y-2 text-xs" data-testid="approval-card">
      <div className="flex items-center gap-1.5 font-semibold text-amber-600 dark:text-amber-400">
        <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
        <span>Approval Required — <code className="font-mono">{gate.gateId}</code></span>
      </div>
      {gate.action && <div className="text-muted-foreground"><span className="font-medium text-foreground">Action: </span>{gate.action}</div>}
      {gate.impact && <div className="text-muted-foreground"><span className="font-medium text-foreground">Impact: </span>{gate.impact}</div>}
      {gate.rollback && <div className="text-muted-foreground"><span className="font-medium text-foreground">Rollback: </span>{gate.rollback}</div>}
      <div className="flex flex-wrap gap-1.5 pt-1">
        <Button size="sm" className="h-6 text-[11px] px-2 gap-1 bg-amber-600 hover:bg-amber-700 text-white" onClick={() => onSend(gate.approveCmd)} data-testid="btn-approve-gate">
          <CheckCheck className="h-3 w-3" /> Approve this action
        </Button>
        <Button size="sm" variant="ghost" className="h-6 text-[11px] px-2 gap-1 text-muted-foreground" onClick={() => copy(gate.approveCmd)} data-testid="btn-copy-approve">
          <Copy className="h-3 w-3" /> Copy command
        </Button>
      </div>
      {gate.scopeHints.length > 0 && (
        <div className="border-t border-amber-500/20 pt-2 space-y-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Pre-approve entire category</p>
          <div className="flex flex-wrap gap-1">
            {gate.scopeHints.map((h) => (
              <Button key={h.scope} size="sm" variant="outline" className="h-6 text-[11px] px-2 gap-1" onClick={() => onSend(h.cmd)} data-testid={`btn-approve-scope-${h.scope}`}>
                <ShieldCheck className="h-3 w-3" /> {h.label}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function SystemStatusBanner({ status }: { status: SystemStatus }) {
  const cfg = {
    granted: { icon: <ShieldCheck className="h-3.5 w-3.5" />, cls: "text-green-600 dark:text-green-400 border-green-500/30 bg-green-500/5", label: "Scope Granted" },
    denied:  { icon: <ShieldX className="h-3.5 w-3.5" />,    cls: "text-destructive border-destructive/30 bg-destructive/5", label: "Scope Denied" },
    unknown: { icon: <Info className="h-3.5 w-3.5" />,        cls: "text-muted-foreground border-border bg-muted/30", label: "Unknown Scope" },
    approved:{ icon: <CheckCheck className="h-3.5 w-3.5" />,  cls: "text-green-600 dark:text-green-400 border-green-500/30 bg-green-500/5", label: "Approved" },
    error:   { icon: <AlertTriangle className="h-3.5 w-3.5" />,cls: "text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/5", label: "Approve Error" },
    info:    { icon: <Info className="h-3.5 w-3.5" />,        cls: "text-muted-foreground border-border bg-muted/30", label: "Info" },
  }[status.kind];
  return (
    <div className={cn("rounded-md border px-3 py-2 text-xs flex items-start gap-2", cfg.cls)} data-testid={`status-${status.kind}`}>
      <span className="shrink-0 mt-0.5">{cfg.icon}</span>
      <div>
        <span className="font-semibold">{cfg.label}</span>
        {status.text && <span className="ml-1 text-muted-foreground">{status.text}</span>}
      </div>
    </div>
  );
}

export function MessageBubble({ message, onSend }: { message: Message; onSend: (cmd: string) => void }) {
  const isUser = message.role === "user";
  const isError = !isUser && message.metadata?.error === true;
  const isFocusRegain = message.metadata?.focus_regain === true;
  const [showDetail, setShowDetail] = useState(false);
  const { toast } = useToast();
  const tokCount = tokenCount(message.metadata?.usage);
  const gate = !isUser ? parseApprovalGate(message.content) : null;
  const sysStatus = !isUser && !gate ? parseSystemStatus(message.content) : null;

  const copyContent = () => {
    navigator.clipboard.writeText(isError ? (message.metadata?.error_detail ?? message.content) : message.content);
    toast({ title: "Copied" });
  };

  if (gate) {
    return <div className="max-w-[92%]" data-testid={`message-${message.id}`}><ApprovalCard gate={gate} onSend={onSend} /></div>;
  }
  if (sysStatus) {
    return <div className="max-w-[92%]" data-testid={`message-${message.id}`}><SystemStatusBanner status={sysStatus} /></div>;
  }

  return (
    <div className={cn("flex gap-2 max-w-[92%]", isUser ? "ml-auto flex-row-reverse" : "")} data-testid={`message-${message.id}`}>
      <div className={cn("flex items-center justify-center h-7 w-7 rounded-full shrink-0 mt-0.5", isUser ? "bg-primary/20" : isError ? "bg-destructive/20" : isFocusRegain ? "bg-amber-500/20" : "bg-muted")}>
        {isUser ? <User className="h-3.5 w-3.5" /> : isError ? <AlertTriangle className="h-3.5 w-3.5 text-destructive" /> : isFocusRegain ? <Target className="h-3.5 w-3.5 text-amber-500" /> : <Bot className="h-3.5 w-3.5" />}
      </div>
      <div className={cn("rounded-lg px-3 py-2 text-sm break-words min-w-0 max-w-full overflow-hidden", isUser ? "bg-primary text-primary-foreground" : isError ? "bg-destructive/10 border border-destructive/30 text-destructive-foreground" : isFocusRegain ? "bg-amber-500/10 border border-amber-500/30" : "bg-muted")}>
        {!isUser && (
          <div className={cn("flex items-center gap-1 mb-1", isError ? "opacity-100" : "opacity-60 hover:opacity-100")}>
            {isError && <span className="text-[10px] font-semibold text-destructive uppercase tracking-wide">Model Error</span>}
            <button onClick={copyContent} className="ml-auto hover:opacity-80" data-testid={`copy-msg-${message.id}`} title="Copy"><Copy className="h-3 w-3" /></button>
            {isError && (
              <button onClick={() => setShowDetail(!showDetail)} className="hover:opacity-80" data-testid={`toggle-error-${message.id}`}>
                {showDetail ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
            )}
          </div>
        )}
        <div className={cn("prose prose-sm max-w-none dark:prose-invert", isUser && "text-primary-foreground")}>
          <MarkdownContent content={message.content} isUser={isUser} />
        </div>
        {isError && showDetail && message.metadata?.error_detail && (
          <pre className="mt-2 text-[10px] bg-black/10 rounded p-2 overflow-x-auto whitespace-pre-wrap opacity-80" data-testid={`error-detail-${message.id}`}>{message.metadata.error_detail}</pre>
        )}
        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
          {message.model && !isUser && <Badge variant="outline" className="text-[9px] h-4 px-1">{message.model}</Badge>}
          {tokCount !== null && !isUser && (
            <Badge variant="outline" className="text-[9px] h-4 px-1 text-muted-foreground" data-testid={`tokens-msg-${message.id}`}>{fmtTokens(tokCount)} tok</Badge>
          )}
        </div>
      </div>
    </div>
  );
}
// 253:0
