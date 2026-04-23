import { useState, useRef, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  Upload as UploadIcon,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

type UploadRow = {
  id: number;
  filename: string;
  mime: string | null;
  byte_size: number;
  status: string;
  error: string | null;
  source_slug: string | null;
  report_id: number | null;
  created_at: string | null;
  finished_at: string | null;
};

type ReportRow = {
  id: number;
  source_slug: string;
  message_count: number;
  avg_cm: number;
  avg_da: number;
  avg_drift: number;
  avg_dvg: number;
  avg_int: number;
  avg_tbf: number;
  peak_metric: number;
  peak_metric_name: string | null;
  directives_fired: string[] | null;
  top_snippets: Array<{ peak: number; round: number; snippet: string }> | null;
  file_breakdown: Array<{ file: string; bytes: number }> | null;
  risk_loop: number;
  risk_fixation: number;
  correction_fidelity: number;
  edcmbone_version: string | null;
  created_at: string | null;
};

type MessageRow = {
  id: number;
  report_id: number;
  idx: number;
  speaker: string | null;
  content: string | null;
  cm: number;
  da: number;
  drift: number;
  dvg: number;
  int_val: number;
  tbf: number;
  directives_fired: string[] | null;
};

const PAGE_SIZE = 50;

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function fmt(n: number | null | undefined, digits = 2): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toFixed(digits);
}

function statusIcon(status: string) {
  if (status === "done") return CheckCircle2;
  if (status === "error") return AlertTriangle;
  return Clock;
}

function statusColor(status: string): string {
  if (status === "done") return "text-emerald-500";
  if (status === "error") return "text-red-500";
  if (status === "processing") return "text-blue-400";
  return "text-muted-foreground";
}

function Sparkline({ values, color = "currentColor" }: { values: number[]; color?: string }) {
  if (!values.length) return null;
  const w = 100;
  const h = 24;
  const max = Math.max(...values, 1e-9);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const step = values.length > 1 ? w / (values.length - 1) : 0;
  const points = values
    .map((v, i) => `${(i * step).toFixed(2)},${(h - ((v - min) / range) * h).toFixed(2)}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-6">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col" data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-base font-mono tabular-nums">{value}</span>
      {hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
    </div>
  );
}

export default function TranscriptsPage() {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);
  const [page, setPage] = useState(0);

  const { data: uploadsData, isLoading: uploadsLoading } = useQuery<{ items: UploadRow[] }>({
    queryKey: ["/api/v1/transcripts/uploads"],
    refetchInterval: (query) => {
      const items = (query.state.data as { items: UploadRow[] } | undefined)?.items ?? [];
      const pending = items.some((u) => u.status === "queued" || u.status === "processing");
      return pending ? 2000 : false;
    },
  });

  const { data: reportsData, isLoading: reportsLoading } = useQuery<{ items: ReportRow[] }>({
    queryKey: ["/api/v1/transcripts/reports"],
  });

  const {
    data: report,
    isError: reportIsError,
    error: reportError,
    refetch: refetchReport,
  } = useQuery<ReportRow>({
    queryKey: ["/api/v1/transcripts/reports", selectedReportId],
    queryFn: async () => {
      const r = await fetch(`/api/v1/transcripts/reports/${selectedReportId}`, { credentials: "include" });
      if (!r.ok) throw new Error(`${r.status}: ${(await r.text()) || r.statusText}`);
      return r.json();
    },
    enabled: selectedReportId != null,
  });

  const {
    data: messagesData,
    isLoading: messagesLoading,
    isError: messagesIsError,
    error: messagesError,
    refetch: refetchMessages,
  } = useQuery<{
    items: MessageRow[];
    report_id: number;
    limit: number;
    offset: number;
  }>({
    queryKey: ["/api/v1/transcripts/reports", selectedReportId, "messages", page],
    queryFn: async () => {
      const r = await fetch(
        `/api/v1/transcripts/reports/${selectedReportId}/messages?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`,
        { credentials: "include" }
      );
      if (!r.ok) throw new Error(`${r.status}: ${(await r.text()) || r.statusText}`);
      return r.json();
    },
    enabled: selectedReportId != null,
  });

  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/v1/transcripts/upload", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!r.ok) {
        const text = await r.text();
        throw new Error(`${r.status}: ${text}`);
      }
      return r.json() as Promise<{ mode: string; upload_id: number; report_id?: number }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/transcripts/uploads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/transcripts/reports"] });
      if (data.mode === "sync" && data.report_id) {
        setSelectedReportId(data.report_id);
        setPage(0);
        toast({ title: "Upload analyzed", description: `Report ${data.report_id} ready.` });
      } else {
        toast({
          title: "Upload queued",
          description: "Large file is processing in the background — status will update here.",
        });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    },
  });

  const handlePickFile = () => fileRef.current?.click();
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) uploadMut.mutate(f);
    if (fileRef.current) fileRef.current.value = "";
  };

  const uploads = uploadsData?.items ?? [];
  const reports = reportsData?.items ?? [];
  const messages = messagesData?.items ?? [];
  const totalMessages = report?.message_count ?? 0;
  const hasNext = (page + 1) * PAGE_SIZE < totalMessages;

  const sparklines = useMemo(() => {
    return {
      cm: messages.map((m) => m.cm),
      da: messages.map((m) => m.da),
      drift: messages.map((m) => m.drift),
      dvg: messages.map((m) => m.dvg),
    };
  }, [messages]);

  const directives = useMemo(() => report?.directives_fired ?? [], [report]);
  const fileBreakdown = useMemo(() => report?.file_breakdown ?? [], [report]);

  return (
    <div className="flex h-full overflow-hidden bg-background text-foreground" data-testid="page-transcripts">
      {/* Left rail */}
      <aside className="w-72 border-r border-border flex flex-col flex-shrink-0">
        <div className="p-3 border-b border-border space-y-2">
          <Button
            onClick={handlePickFile}
            disabled={uploadMut.isPending}
            className="w-full"
            data-testid="button-upload-transcript"
          >
            {uploadMut.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <UploadIcon className="w-4 h-4 mr-2" />
            )}
            Upload transcript
          </Button>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept=".txt,.md,.json,.html,.htm,.pdf,.zip"
            onChange={handleFileChange}
            data-testid="input-file-upload"
          />
          <p className="text-[10px] text-muted-foreground leading-tight">
            txt · md · json · html · pdf · zip · max 25 MB
          </p>
        </div>

        <div className="flex-1 overflow-auto">
          {uploads.length > 0 && (
            <div className="p-3 border-b border-border">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">
                Recent uploads
              </div>
              <div className="space-y-1.5">
                {uploads.slice(0, 8).map((u) => {
                  const Icon = statusIcon(u.status);
                  return (
                    <div
                      key={u.id}
                      className="flex items-start gap-2 text-xs p-1.5 rounded hover-elevate"
                      data-testid={`row-upload-${u.id}`}
                    >
                      <Icon className={cn("w-3.5 h-3.5 mt-0.5 flex-shrink-0", statusColor(u.status))} />
                      <div className="flex-1 min-w-0">
                        <div className="truncate" data-testid={`text-upload-filename-${u.id}`}>
                          {u.filename}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {u.status}
                          {u.error && ` — ${u.error}`}
                          {u.report_id && (
                            <button
                              className="ml-1 underline text-primary"
                              onClick={() => {
                                setSelectedReportId(u.report_id!);
                                setPage(0);
                              }}
                              data-testid={`button-open-report-from-upload-${u.id}`}
                            >
                              open
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">Reports</div>
            {reportsLoading || uploadsLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            ) : reports.length === 0 ? (
              <div className="text-xs text-muted-foreground" data-testid="text-empty-reports">
                No reports yet. Upload a transcript to get started.
              </div>
            ) : (
              <div className="space-y-1">
                {reports.map((r) => {
                  const active = r.id === selectedReportId;
                  return (
                    <button
                      key={r.id}
                      onClick={() => {
                        setSelectedReportId(r.id);
                        setPage(0);
                      }}
                      className={cn(
                        "w-full text-left p-2 rounded text-xs hover-elevate",
                        active && "bg-accent/10 text-accent-foreground"
                      )}
                      data-testid={`button-report-${r.id}`}
                    >
                      <div className="flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        <span className="truncate flex-1" data-testid={`text-report-slug-${r.id}`}>
                          {r.source_slug || `report ${r.id}`}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{r.message_count}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                        {r.created_at?.slice(0, 19).replace("T", " ")}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Right pane */}
      <main className="flex-1 overflow-auto">
        {selectedReportId == null ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            Select a report from the left rail, or upload a transcript to begin.
          </div>
        ) : reportIsError ? (
          <div
            className="flex flex-col items-center justify-center h-full gap-3 text-sm"
            data-testid="status-report-error"
          >
            <AlertTriangle className="w-6 h-6 text-red-500" />
            <div className="text-muted-foreground">Failed to load report.</div>
            <div className="text-[11px] font-mono text-muted-foreground max-w-md text-center break-all">
              {(reportError as Error | undefined)?.message ?? "unknown error"}
            </div>
            <Button variant="outline" size="sm" onClick={() => refetchReport()} data-testid="button-retry-report">
              Retry
            </Button>
          </div>
        ) : !report ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="p-4 space-y-4 max-w-5xl">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h1 className="text-lg font-semibold" data-testid="text-report-title">
                  {report.source_slug || `Report ${report.id}`}
                </h1>
                <div className="text-xs text-muted-foreground" data-testid="text-report-meta">
                  {report.message_count} messages · edcmbone {report.edcmbone_version ?? "—"} ·{" "}
                  {report.created_at?.slice(0, 19).replace("T", " ")}
                </div>
              </div>
              <div className="flex gap-2">
                <Badge
                  variant={report.risk_loop > 0.5 ? "destructive" : "secondary"}
                  data-testid="badge-risk-loop"
                >
                  loop {fmt(report.risk_loop)}
                </Badge>
                <Badge
                  variant={report.risk_fixation > 0.5 ? "destructive" : "secondary"}
                  data-testid="badge-risk-fixation"
                >
                  fixation {fmt(report.risk_fixation)}
                </Badge>
                <Badge variant="secondary" data-testid="badge-correction-fidelity">
                  correction {fmt(report.correction_fidelity)}
                </Badge>
              </div>
            </div>

            {/* Stat grid */}
            <Card className="p-4 grid grid-cols-3 sm:grid-cols-6 gap-3">
              <Stat label="cm" value={fmt(report.avg_cm)} />
              <Stat label="da" value={fmt(report.avg_da)} />
              <Stat label="drift" value={fmt(report.avg_drift)} />
              <Stat label="dvg" value={fmt(report.avg_dvg)} />
              <Stat label="int" value={fmt(report.avg_int)} />
              <Stat label="tbf" value={fmt(report.avg_tbf)} />
              <Stat
                label="peak"
                value={fmt(report.peak_metric)}
                hint={report.peak_metric_name ?? undefined}
              />
            </Card>

            {/* Sparklines */}
            {messages.length > 1 && (
              <Card className="p-4 space-y-2" data-testid="card-sparklines">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Across this page ({messages.length} msgs)
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">cm</div>
                    <Sparkline values={sparklines.cm} color="hsl(var(--primary))" />
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">da</div>
                    <Sparkline values={sparklines.da} color="hsl(var(--primary))" />
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">drift</div>
                    <Sparkline values={sparklines.drift} color="hsl(var(--primary))" />
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">dvg</div>
                    <Sparkline values={sparklines.dvg} color="hsl(var(--primary))" />
                  </div>
                </div>
              </Card>
            )}

            {/* File breakdown + directives */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {fileBreakdown.length > 0 && (
                <Card className="p-4">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">
                    File breakdown
                  </div>
                  <div className="space-y-1" data-testid="list-file-breakdown">
                    {fileBreakdown.map((f, i) => (
                      <div key={i} className="flex justify-between text-xs">
                        <span className="font-mono truncate">{f.file}</span>
                        <span className="text-muted-foreground tabular-nums">{formatBytes(f.bytes)}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
              {directives.length > 0 && (
                <Card className="p-4">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">
                    Directives fired
                  </div>
                  <div className="flex flex-wrap gap-1" data-testid="list-directives">
                    {directives.map((d) => (
                      <Badge key={d} variant="secondary" className="font-mono text-[10px]">
                        {d}
                      </Badge>
                    ))}
                  </div>
                </Card>
              )}
            </div>

            {/* Top snippets */}
            {report.top_snippets && report.top_snippets.length > 0 && (
              <Card className="p-4">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">
                  Top snippets
                </div>
                <div className="space-y-2" data-testid="list-snippets">
                  {report.top_snippets.slice(0, 6).map((s, i) => (
                    <div
                      key={i}
                      className="text-xs p-2 rounded bg-muted/40 border border-border"
                      data-testid={`snippet-${i}`}
                    >
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                        <span className="font-mono">round {s.round}</span>
                        <span className="font-mono tabular-nums">peak {fmt(s.peak)}</span>
                      </div>
                      <div className="whitespace-pre-wrap text-foreground/90">{s.snippet}</div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Messages table */}
            <Card className="p-0 overflow-hidden">
              <div className="flex items-center justify-between p-3 border-b border-border">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Messages
                  {totalMessages > 0 && (
                    <span className="ml-2 text-muted-foreground/70">
                      {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalMessages)} of{" "}
                      {totalMessages}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={page === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    aria-label="Previous page"
                    data-testid="button-page-prev"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={!hasNext}
                    onClick={() => setPage((p) => p + 1)}
                    aria-label="Next page"
                    data-testid="button-page-next"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              {messagesIsError ? (
                <div className="p-4 flex flex-col items-start gap-2" data-testid="status-messages-error">
                  <div className="flex items-center gap-2 text-red-500 text-xs">
                    <AlertTriangle className="w-4 h-4" />
                    Failed to load messages.
                  </div>
                  <div className="text-[10px] font-mono text-muted-foreground break-all">
                    {(messagesError as Error | undefined)?.message ?? "unknown error"}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetchMessages()}
                    data-testid="button-retry-messages"
                  >
                    Retry
                  </Button>
                </div>
              ) : messagesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              ) : messages.length === 0 ? (
                <div className="p-4 text-xs text-muted-foreground">No messages on this page.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/30 text-[10px] uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="text-left p-2 w-10">#</th>
                        <th className="text-left p-2 w-20">speaker</th>
                        <th className="text-left p-2">content</th>
                        <th className="text-right p-2 w-12">cm</th>
                        <th className="text-right p-2 w-12">da</th>
                        <th className="text-right p-2 w-12">drift</th>
                        <th className="text-right p-2 w-12">dvg</th>
                        <th className="text-right p-2 w-12">int</th>
                        <th className="text-right p-2 w-12">tbf</th>
                      </tr>
                    </thead>
                    <tbody>
                      {messages.map((m) => (
                        <tr
                          key={m.id}
                          className="border-t border-border align-top"
                          data-testid={`row-message-${m.id}`}
                        >
                          <td className="p-2 text-muted-foreground tabular-nums">{m.idx}</td>
                          <td className="p-2 font-mono">{m.speaker ?? "—"}</td>
                          <td className="p-2 max-w-md">
                            <div
                              className="line-clamp-3 text-foreground/90"
                              data-testid={`text-message-content-${m.id}`}
                            >
                              {m.content ?? ""}
                            </div>
                          </td>
                          <td className="p-2 text-right font-mono tabular-nums">{fmt(m.cm)}</td>
                          <td className="p-2 text-right font-mono tabular-nums">{fmt(m.da)}</td>
                          <td className="p-2 text-right font-mono tabular-nums">{fmt(m.drift)}</td>
                          <td className="p-2 text-right font-mono tabular-nums">{fmt(m.dvg)}</td>
                          <td className="p-2 text-right font-mono tabular-nums">{fmt(m.int_val)}</td>
                          <td className="p-2 text-right font-mono tabular-nums">{fmt(m.tbf)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <div className="text-[10px] text-muted-foreground pt-2">
              Upload size: {report.message_count} msg · slug{" "}
              <span className="font-mono">{report.source_slug}</span>
              {uploads.find((u) => u.report_id === report.id)?.byte_size != null && (
                <> · {formatBytes(uploads.find((u) => u.report_id === report.id)!.byte_size)}</>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
