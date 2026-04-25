// 308:11
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { fmtTokens, fmtCostUSD } from "./chat-messages";

// Live per-voice progress panel rendered while a multi-model chat send
// is in flight. Subscribes to /api/v1/orchestration/{cid}/stream and
// re-renders cards as call_progress / call_complete events arrive.

type CallKey = string;

interface CallState {
  model: string;
  call_idx: number;
  status: "pending" | "in_flight" | "complete" | "error";
  started_at?: number;
  elapsed_ms?: number | null;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  } | null;
  cost_usd?: number | null;
  error?: string | null;
  // Monotonic high-water mark of streamed output_token estimates.
  live_tokens_est?: number;
}

interface Plan {
  mode: string;
  providers: string[];
  rounds: number;
}

function callKey(model: string, idx: number): CallKey {
  return `${model}:${idx}`;
}

export function LiveOrchProgress({
  clientRunId,
  fallbackProviders,
  fallbackMode,
}: {
  clientRunId: string | null;
  fallbackProviders?: string[];
  fallbackMode?: string;
}) {
  const [calls, setCalls] = useState<Record<CallKey, CallState>>({});
  const [plan, setPlan] = useState<Plan | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!clientRunId) return;
    const url = `/api/v1/orchestration/${encodeURIComponent(clientRunId)}/stream`;
    const es = new EventSource(url, { withCredentials: true });
    esRef.current = es;

    const onMessage = (msg: MessageEvent) => {
      try {
        const ev = JSON.parse(msg.data);
        const t = String(ev.type ?? "");
        if (t === "orchestration_start") {
          setPlan({
            mode: String(ev.orchestration_mode ?? ""),
            providers: Array.isArray(ev.providers) ? ev.providers : [],
            rounds: Number(ev.rounds ?? 1),
          });
          // Pre-seed pending cards so slots render immediately.
          setCalls((prev) => {
            const next = { ...prev };
            const provs = Array.isArray(ev.providers) ? ev.providers : [];
            const rounds = Math.max(1, Number(ev.rounds ?? 1));
            for (const p of provs) {
              for (let r = 0; r < rounds; r += 1) {
                const k = callKey(String(p), r);
                if (!next[k]) {
                  next[k] = { model: String(p), call_idx: r, status: "pending" };
                }
              }
            }
            return next;
          });
          return;
        }
        if (t === "call_start") {
          const k = callKey(String(ev.model), Number(ev.call_idx ?? 0));
          setCalls((prev) => ({
            ...prev,
            [k]: {
              ...(prev[k] ?? { model: String(ev.model), call_idx: Number(ev.call_idx ?? 0) }),
              status: "in_flight",
              started_at: Date.now(),
              live_tokens_est: 0,
            },
          }));
          return;
        }
        if (t === "call_progress") {
          const k = callKey(String(ev.model), Number(ev.call_idx ?? 0));
          const incoming = Number(ev.output_tokens_est ?? 0);
          setCalls((prev) => {
            const cur = prev[k] ?? {
              model: String(ev.model),
              call_idx: Number(ev.call_idx ?? 0),
              status: "in_flight" as const,
            };
            // Monotonic guard: never regress on out-of-order events.
            const prior = cur.live_tokens_est ?? 0;
            if (incoming <= prior) return prev;
            return {
              ...prev,
              [k]: { ...cur, status: "in_flight", live_tokens_est: incoming },
            };
          });
          return;
        }
        if (t === "call_complete") {
          const k = callKey(String(ev.model), Number(ev.call_idx ?? 0));
          setCalls((prev) => ({
            ...prev,
            [k]: {
              ...(prev[k] ?? { model: String(ev.model), call_idx: Number(ev.call_idx ?? 0) }),
              status: "complete",
              elapsed_ms: typeof ev.elapsed_ms === "number" ? ev.elapsed_ms : null,
              usage: ev.usage ?? null,
              cost_usd: typeof ev.cost_usd === "number" ? ev.cost_usd : null,
            },
          }));
          return;
        }
        if (t === "call_error") {
          const k = callKey(String(ev.model), Number(ev.call_idx ?? 0));
          setCalls((prev) => ({
            ...prev,
            [k]: {
              ...(prev[k] ?? { model: String(ev.model), call_idx: Number(ev.call_idx ?? 0) }),
              status: "error",
              elapsed_ms: typeof ev.elapsed_ms === "number" ? ev.elapsed_ms : null,
              error: typeof ev.error === "string" ? ev.error : "call failed",
            },
          }));
          return;
        }
        if (t === "orchestration_done") {
          es.close();
          esRef.current = null;
        }
      } catch {
        // Malformed event — ignore; final values still arrive via the chat POST.
      }
    };

    es.addEventListener("progress", onMessage);
    es.onerror = () => {
      // Browser auto-reconnects; reconnect to a closed run idles out.
    };

    return () => {
      es.removeEventListener("progress", onMessage);
      es.close();
      esRef.current = null;
    };
  }, [clientRunId]);

  // Show placeholder cards before orchestration_start arrives, using the
  // provider list resolved by ChatInput.
  const ordered = useMemo(() => {
    const fromState = Object.values(calls);
    if (fromState.length > 0) {
      return [...fromState].sort((a, b) => {
        if (a.call_idx !== b.call_idx) return a.call_idx - b.call_idx;
        return a.model.localeCompare(b.model);
      });
    }
    if (fallbackProviders && fallbackProviders.length > 0) {
      return fallbackProviders.map((p) => ({
        model: p,
        call_idx: 0,
        status: "pending" as const,
      }));
    }
    return [];
  }, [calls, fallbackProviders]);

  if (!clientRunId || ordered.length === 0) return null;

  const mode = plan?.mode || fallbackMode || "multi";
  const completed = ordered.filter((c) => c.status === "complete").length;
  const total = ordered.length;

  return (
    <div
      className="rounded-md border border-primary/30 bg-primary/5 p-3 mb-3 max-w-2xl"
      data-testid="live-orch-progress"
    >
      <div className="flex items-center gap-2 mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin text-primary" />
        <span>{mode}</span>
        <span className="opacity-60">·</span>
        <span data-testid="live-orch-progress-count">
          {completed}/{total} voices
        </span>
        <span className="opacity-60 normal-case ml-1">— streaming…</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {ordered.map((c) => (
          <LiveCard key={callKey(c.model, c.call_idx)} c={c} />
        ))}
      </div>
    </div>
  );
}

function LiveCard({ c }: { c: CallState }) {
  const inFlight = c.status === "in_flight" || c.status === "pending";
  const isError = c.status === "error";
  const isDone = c.status === "complete";

  // Tick the elapsed clock for in-flight cards even when no token chunks arrive.
  const [now, setNow] = useState<number>(Date.now());
  useEffect(() => {
    if (!inFlight || !c.started_at) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [inFlight, c.started_at]);

  const liveElapsedMs =
    inFlight && c.started_at ? Math.max(0, now - c.started_at) : c.elapsed_ms ?? 0;

  return (
    <div
      className={cn(
        "rounded-md border bg-background/60 p-2 text-[11px] min-w-0",
        inFlight && "border-primary/40 animate-pulse",
        isError && "border-destructive/40",
        isDone && "border-border",
      )}
      data-testid={`live-orch-card-${c.model}-${c.call_idx}`}
    >
      <div className="flex items-center gap-1 text-[9px] text-muted-foreground flex-wrap">
        <Badge variant="outline" className="text-[9px] h-3.5 px-1">
          {c.model}
        </Badge>
        {c.call_idx > 0 && (
          <Badge variant="secondary" className="text-[9px] h-3.5 px-1">
            round {c.call_idx + 1}
          </Badge>
        )}
        {isDone && c.usage ? (
          <>
            <Badge
              variant="outline"
              className="text-[9px] h-3.5 px-1 font-mono"
              title="Input tokens (fresh, excluding cache reads)"
              data-testid={`live-tokens-in-${c.model}-${c.call_idx}`}
            >
              ↓{fmtTokens(Number(c.usage.input_tokens ?? 0))}
            </Badge>
            <Badge
              variant="outline"
              className="text-[9px] h-3.5 px-1 font-mono"
              title="Output tokens"
              data-testid={`live-tokens-out-${c.model}-${c.call_idx}`}
            >
              ↑{fmtTokens(Number(c.usage.output_tokens ?? 0))}
            </Badge>
            {typeof c.cost_usd === "number" && (
              <Badge
                variant="outline"
                className="text-[9px] h-3.5 px-1 font-mono"
                title="Estimated USD cost for this voice"
                data-testid={`live-cost-${c.model}-${c.call_idx}`}
              >
                {fmtCostUSD(c.cost_usd)}
              </Badge>
            )}
            {typeof c.elapsed_ms === "number" && c.elapsed_ms > 0 && (
              <Badge
                variant="outline"
                className="text-[9px] h-3.5 px-1 font-mono"
                title="Wall-clock time for this voice"
              >
                {c.elapsed_ms < 1000 ? `${c.elapsed_ms}ms` : `${(c.elapsed_ms / 1000).toFixed(1)}s`}
              </Badge>
            )}
          </>
        ) : isError ? (
          <Badge
            variant="outline"
            className="text-[9px] h-3.5 px-1 font-mono text-destructive border-destructive/40"
            data-testid={`live-error-${c.model}-${c.call_idx}`}
          >
            error
          </Badge>
        ) : (
          <>
            <Badge
              variant="outline"
              className={cn(
                "text-[9px] h-3.5 px-1 font-mono",
                (c.live_tokens_est ?? 0) > 0 && "text-primary border-primary/40",
              )}
              title={
                (c.live_tokens_est ?? 0) > 0
                  ? "Output tokens (live estimate from streamed chunks; final value may differ)"
                  : "Output tokens (waiting for first chunk — non-streaming providers stay on '…' until complete)"
              }
              data-testid={`live-tokens-out-${c.model}-${c.call_idx}`}
            >
              {(c.live_tokens_est ?? 0) > 0
                ? `↑~${fmtTokens(c.live_tokens_est ?? 0)}`
                : "↑…"}
            </Badge>
            <Badge
              variant="outline"
              className="text-[9px] h-3.5 px-1 font-mono"
              title={c.started_at ? "Wall-clock time so far" : "Waiting in queue"}
              data-testid={`live-elapsed-${c.model}-${c.call_idx}`}
            >
              {c.started_at
                ? liveElapsedMs < 1000
                  ? `${liveElapsedMs}ms`
                  : `${(liveElapsedMs / 1000).toFixed(1)}s`
                : "queued"}
            </Badge>
          </>
        )}
      </div>
      {isError && c.error && (
        <p className="text-destructive text-[10px] mt-1 truncate" title={c.error}>
          {c.error}
        </p>
      )}
    </div>
  );
}
// 308:11
