// 581:5
import { useEffect, useMemo, useState } from "react";
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

export interface OrchestrationResponse {
  provider?: string;
  model?: string;
  content?: string;
  error?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
    total_tokens?: number;
  } | null;
  cost_usd?: number | null;
  elapsed_ms?: number | null;
  [key: string]: unknown;
}

export interface UsageData {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  orchestration_mode?: string;
  responses?: OrchestrationResponse[];
  [key: string]: unknown;
}

export interface MessageAttachment {
  id: number;
  storage_url: string;
  mime_type: string;
  width?: number | null;
  height?: number | null;
}

export interface Message {
  id: number;
  conversation_id: number;
  role: string;
  content: string;
  model: string | null;
  created_at: string;
  attachments?: MessageAttachment[];
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

export function fmtCostUSD(usd: number): string {
  if (usd <= 0) return "$0";
  if (usd < 0.0001) return "<$0.0001";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

/** Sum cost_usd across every assistant message's usage dict. Returns 0
 *  when no message has a numeric cost — so the caller can hide the badge. */
export function conversationCostUSD(messages: Message[]): number {
  let total = 0;
  for (const m of messages) {
    if (m.role !== "assistant") continue;
    const c = (m.metadata?.usage as { cost_usd?: number | null } | undefined)?.cost_usd;
    if (typeof c === "number" && Number.isFinite(c) && c > 0) total += c;
  }
  return total;
}

function looksLikeHtmlPage(s: string): boolean {
  const head = s.trimStart().slice(0, 200).toLowerCase();
  return head.startsWith("<!doctype") || head.startsWith("<html") ||
    /<head\b[\s\S]*?<\/head>/i.test(s.slice(0, 2000));
}

export function MarkdownContent({ content, isUser }: { content: string; isUser: boolean }) {
  if (!isUser && looksLikeHtmlPage(content)) {
    return (
      <div className="rounded border border-destructive/40 bg-destructive/10 p-2 text-[11px] space-y-1" data-testid="html-error-shield">
        <div className="font-semibold text-destructive uppercase tracking-wide text-[10px]">
          Server returned an HTML page, not a model response
        </div>
        <div className="opacity-80">
          The request was likely served by an edge / 404 handler instead of the API.
          Showing the first 240 chars verbatim so you can identify the source:
        </div>
        <pre className="whitespace-pre-wrap break-all text-[10px] opacity-70 max-h-24 overflow-auto bg-black/20 rounded p-1">
          {content.trim().slice(0, 240)}
        </pre>
      </div>
    );
  }
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

function OrchestrationCard({
  r, idx, mode, testIdPrefix, indentPx,
}: {
  r: OrchestrationResponse;
  idx: number;
  mode: string;
  testIdPrefix: string;
  indentPx?: number;
}) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const role = String((r as Record<string, unknown>).role ?? "player").toLowerCase();
  const stepNum = Number((r as Record<string, unknown>).step_num ?? 0);
  const isSynth = role === "synthesizer" || stepNum === -1 || (mode === "council" && stepNum === 1 && role === "council");
  const roleLabel = isSynth ? "synthesis" : role === "council" ? "round 1" : null;
  const content = String(r.content ?? "");
  const copy = () => {
    navigator.clipboard.writeText(content);
    toast({ title: "Copied", description: r.provider ? `${r.provider} response` : undefined });
  };
  return (
    <div
      className="rounded-md border border-border bg-background/40 p-2 text-[11px] min-w-0"
      style={indentPx ? { marginLeft: `${indentPx}px` } : undefined}
      data-testid={`${testIdPrefix}-${idx}`}
    >
      <div className="flex items-center gap-1 mb-1 text-[9px] text-muted-foreground flex-wrap">
        {testIdPrefix === "orchestration-step" && <span>step {idx + 1}</span>}
        {r.provider && <Badge variant="outline" className="text-[9px] h-3.5 px-1">{r.provider}</Badge>}
        {roleLabel && <Badge variant="secondary" className="text-[9px] h-3.5 px-1">{roleLabel}</Badge>}
        {r.model && <span className="truncate opacity-60">{r.model}</span>}
        {!r.error && r.usage && (
          <>
            <Badge
              variant="outline"
              className="text-[9px] h-3.5 px-1 font-mono"
              title="Input tokens (fresh, excluding cache reads)"
              data-testid={`tokens-in-${testIdPrefix}-${idx}`}
            >
              ↓{fmtTokens(Number(r.usage.input_tokens ?? 0))}
            </Badge>
            <Badge
              variant="outline"
              className="text-[9px] h-3.5 px-1 font-mono"
              title="Output tokens"
              data-testid={`tokens-out-${testIdPrefix}-${idx}`}
            >
              ↑{fmtTokens(Number(r.usage.output_tokens ?? 0))}
            </Badge>
            {typeof r.cost_usd === "number" && (
              <Badge
                variant="outline"
                className="text-[9px] h-3.5 px-1 font-mono"
                title="Estimated USD cost for this voice"
                data-testid={`cost-${testIdPrefix}-${idx}`}
              >
                {fmtCostUSD(r.cost_usd)}
              </Badge>
            )}
            {typeof r.elapsed_ms === "number" && r.elapsed_ms > 0 && (
              <Badge
                variant="outline"
                className="text-[9px] h-3.5 px-1 font-mono"
                title="Wall-clock time for this voice"
                data-testid={`elapsed-${testIdPrefix}-${idx}`}
              >
                {r.elapsed_ms < 1000 ? `${r.elapsed_ms}ms` : `${(r.elapsed_ms / 1000).toFixed(1)}s`}
              </Badge>
            )}
          </>
        )}
        <button
          onClick={copy}
          className="ml-auto hover:opacity-80 shrink-0"
          title="Copy this response"
          data-testid={`copy-orchestration-${idx}`}
        >
          <Copy className="h-3 w-3" />
        </button>
        {!r.error && content.length > 400 && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="hover:opacity-80 shrink-0"
            title={expanded ? "Collapse" : "Expand"}
            data-testid={`toggle-orchestration-${idx}`}
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        )}
      </div>
      {r.error
        ? <p className="text-destructive text-[10px]">{r.error}</p>
        : (
          <p
            className={cn(
              "whitespace-pre-wrap break-words opacity-90",
              !expanded && "max-h-48 overflow-auto",
            )}
          >
            {content}
          </p>
        )}
    </div>
  );
}

type SortKey = "default" | "cost" | "latency" | "output";

const SORT_STORAGE_KEY = "orchestration-sort";
const SORT_OPTIONS: { key: SortKey; label: string; title: string }[] = [
  { key: "default", label: "default", title: "Original hub-return order" },
  { key: "cost", label: "cost", title: "Cheapest first (missing cost go to bottom)" },
  { key: "latency", label: "latency", title: "Fastest first (missing latency go to bottom)" },
  { key: "output", label: "output", title: "Most output tokens first" },
];

function readStoredSort(): SortKey {
  if (typeof window === "undefined") return "default";
  try {
    const v = window.localStorage.getItem(SORT_STORAGE_KEY);
    if (v === "cost" || v === "latency" || v === "output" || v === "default") return v;
  } catch {
    /* ignore */
  }
  return "default";
}

function sortResponseIndices(responses: OrchestrationResponse[], key: SortKey): number[] {
  const idx = responses.map((_, i) => i);
  if (key === "default") return idx;
  const score = (r: OrchestrationResponse): number => {
    if (r.error) return Number.POSITIVE_INFINITY;
    if (key === "cost") {
      const c = typeof r.cost_usd === "number" && Number.isFinite(r.cost_usd) ? r.cost_usd : null;
      return c ?? Number.POSITIVE_INFINITY;
    }
    if (key === "latency") {
      const e = typeof r.elapsed_ms === "number" && Number.isFinite(r.elapsed_ms) ? r.elapsed_ms : null;
      return e ?? Number.POSITIVE_INFINITY;
    }
    // output: descending — most tokens first
    const o = Number(r.usage?.output_tokens ?? 0);
    return Number.isFinite(o) ? -o : Number.POSITIVE_INFINITY;
  };
  return idx.sort((a, b) => {
    const sa = score(responses[a]);
    const sb = score(responses[b]);
    if (sa !== sb) return sa - sb;
    return a - b; // stable secondary by original index
  });
}

export function OrchestrationResponses({ usage }: { usage?: UsageData | null }) {
  const responses = usage?.responses;
  const mode = String(usage?.orchestration_mode ?? "").toLowerCase();
  const isLadder = mode === "daisy_chain" || mode === "daisy-chain";
  const [sortKey, setSortKey] = useState<SortKey>(() => readStoredSort());

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(SORT_STORAGE_KEY, sortKey);
    } catch {
      /* ignore */
    }
  }, [sortKey]);

  const orderedIndices = useMemo(() => {
    if (!Array.isArray(responses) || responses.length === 0) return [];
    if (isLadder) return responses.map((_, i) => i);
    return sortResponseIndices(responses, sortKey);
  }, [responses, sortKey, isLadder]);

  if (!Array.isArray(responses) || responses.length === 0) return null;

  const sortDisabledTitle = isLadder
    ? "Daisy-chain order is meaningful — each step builds on the previous one"
    : undefined;

  return (
    <div className="mt-2 border-t border-border/40 pt-2" data-testid="orchestration-panel">
      <div className="flex items-center gap-1.5 mb-1.5 text-[9px] uppercase tracking-wider text-muted-foreground flex-wrap">
        <span>{mode || "fan-out"}</span>
        <span className="opacity-60">·</span>
        <span>{responses.length} responses</span>
        <span className="opacity-60 normal-case ml-1">— each card has its own copy button</span>
        <div
          className="ml-auto flex items-center gap-1 normal-case tracking-normal"
          data-testid="orchestration-sort-toolbar"
          title={sortDisabledTitle}
        >
          <span className="opacity-70">sort:</span>
          {SORT_OPTIONS.map((opt) => {
            const active = !isLadder && sortKey === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                disabled={isLadder}
                onClick={() => setSortKey(opt.key)}
                title={isLadder ? sortDisabledTitle : opt.title}
                aria-pressed={active}
                data-testid={`sort-orchestration-${opt.key}`}
                className={cn(
                  "px-1.5 py-0.5 rounded border text-[9px] transition-colors",
                  active
                    ? "border-primary/60 bg-primary/15 text-foreground"
                    : "border-border/60 bg-background/40 text-muted-foreground hover:text-foreground hover:bg-background/70",
                  isLadder && "opacity-50 cursor-not-allowed hover:bg-background/40 hover:text-muted-foreground",
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
      {isLadder ? (
        <div className="flex flex-col gap-1.5">
          {orderedIndices.map((i, pos) => (
            <OrchestrationCard
              key={i}
              r={responses[i]}
              idx={i}
              mode={mode}
              testIdPrefix="orchestration-step"
              indentPx={pos * 8}
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {orderedIndices.map((i) => (
            <OrchestrationCard
              key={i}
              r={responses[i]}
              idx={i}
              mode={mode}
              testIdPrefix="orchestration-card"
            />
          ))}
        </div>
      )}
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
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-1.5" data-testid={`attachments-msg-${message.id}`}>
            {message.attachments.map((a) => (
              <a
                key={a.id}
                href={a.storage_url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-md overflow-hidden border border-border max-w-[240px] hover-elevate"
                data-testid={`attachment-${a.id}`}
              >
                <img
                  src={a.storage_url}
                  alt="attachment"
                  className="block max-h-40 w-auto object-contain bg-muted"
                  loading="lazy"
                />
              </a>
            ))}
          </div>
        )}
        {(() => {
          const responses = !isUser ? message.metadata?.usage?.responses : undefined;
          const hasCards = Array.isArray(responses) && responses.length > 0;
          return (
            <>
              {!hasCards && (
                <div className={cn("prose prose-sm max-w-none dark:prose-invert", isUser && "text-primary-foreground")}>
                  <MarkdownContent content={message.content} isUser={isUser} />
                </div>
              )}
              {!isUser && <OrchestrationResponses usage={message.metadata?.usage} />}
            </>
          );
        })()}
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
// 581:5
