// 248:0
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useBillingStatus } from "@/hooks/use-billing-status";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Download, Image as ImageIcon, FileText, FileJson, FileCode, FileBinary, Archive as ArchiveIcon } from "lucide-react";

type Artifact = {
  id: string;
  kind: string;
  tool_name: string | null;
  agent_run_id: string | null;
  storage_path: string;
  filename: string;
  mime: string;
  size_bytes: number;
  sha256: string;
  provenance: Record<string, unknown> | null;
  public: boolean;
  created_at: string | null;
};

const KIND_OPTIONS = ["all", "image", "text", "json", "code", "report", "recon", "exploit_evidence", "binary"];
const RANGE_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "24h", label: "Last 24h" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
];

function kindIcon(kind: string) {
  if (kind === "image") return ImageIcon;
  if (kind === "json") return FileJson;
  if (kind === "code") return FileCode;
  if (kind === "text" || kind === "report") return FileText;
  return FileBinary;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export default function ArchivePage() {
  const { isAdmin } = useBillingStatus();
  const [kind, setKind] = useState<string>("all");
  const [tool, setTool] = useState<string>("all");
  const [range, setRange] = useState<string>("all");
  const [selected, setSelected] = useState<Artifact | null>(null);

  const params = new URLSearchParams();
  if (kind !== "all") params.set("kind", kind);
  if (tool !== "all") params.set("tool", tool);
  if (range !== "all") params.set("range", range);
  params.set("limit", "50");
  const qs = params.toString();
  const listKey = ["/api/v1/artifacts", qs];

  const { data, isLoading } = useQuery<{ items: Artifact[] }>({
    queryKey: listKey,
    queryFn: async () => {
      const r = await fetch(`/api/v1/artifacts?${qs}`, { credentials: "include" });
      if (!r.ok) throw new Error("failed to load artifacts");
      return r.json();
    },
  });

  const { data: toolsMeta } = useQuery<{ tools: string[] }>({
    queryKey: ["/api/v1/artifacts/_meta/tools"],
    queryFn: async () => {
      const r = await fetch("/api/v1/artifacts/_meta/tools", { credentials: "include" });
      if (!r.ok) throw new Error("failed to load tool list");
      return r.json();
    },
  });

  const items = data?.items ?? [];
  const images = items.filter((a) => a.kind === "image");
  const others = items.filter((a) => a.kind !== "image");

  const togglePublic = async (a: Artifact, next: boolean) => {
    await apiRequest("PATCH", `/api/v1/artifacts/${a.id}`, { public: next });
    queryClient.invalidateQueries({ queryKey: ["/api/v1/artifacts"] });
    if (selected?.id === a.id) setSelected({ ...selected, public: next });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background text-foreground" data-testid="page-archive">
      <header className="flex flex-wrap items-center gap-3 p-4 border-b border-border">
        <ArchiveIcon className="w-5 h-5 text-muted-foreground" />
        <h1 className="text-base font-semibold mr-3" data-testid="text-archive-title">Archive</h1>
        <div className="flex items-center gap-2 ml-auto flex-wrap">
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger className="w-[140px]" data-testid="select-kind">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KIND_OPTIONS.map((k) => (
                <SelectItem key={k} value={k} data-testid={`option-kind-${k}`}>
                  {k === "all" ? "All kinds" : k}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={tool} onValueChange={setTool}>
            <SelectTrigger className="w-[180px]" data-testid="select-tool">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" data-testid="option-tool-all">All tools</SelectItem>
              {(toolsMeta?.tools ?? []).map((t) => (
                <SelectItem key={t} value={t} data-testid={`option-tool-${t}`}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger className="w-[140px]" data-testid="select-range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGE_OPTIONS.map((r) => (
                <SelectItem key={r.value} value={r.value} data-testid={`option-range-${r.value}`}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-4 space-y-6">
        {isLoading && (
          <div className="flex items-center justify-center py-10" data-testid="status-loading">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && items.length === 0 && (
          <div className="text-sm text-muted-foreground" data-testid="text-empty">
            No artifacts yet. Generate an image or run a tool that produces files.
          </div>
        )}

        {images.length > 0 && (
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Images</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {images.map((a) => (
                <Card
                  key={a.id}
                  className="overflow-hidden hover-elevate cursor-pointer"
                  onClick={() => setSelected(a)}
                  data-testid={`card-artifact-${a.id}`}
                >
                  <div className="aspect-square bg-muted">
                    <img
                      src={`/api/v1/artifacts/${a.id}/download`}
                      alt={a.filename}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      data-testid={`img-artifact-${a.id}`}
                    />
                  </div>
                  <div className="p-2 text-[11px] text-muted-foreground flex items-center justify-between gap-2">
                    <span className="truncate" data-testid={`text-filename-${a.id}`}>{a.filename}</span>
                    {a.public && <Badge variant="secondary" data-testid={`badge-public-${a.id}`}>public</Badge>}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {others.length > 0 && (
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Other</div>
            <div className="space-y-1">
              {others.map((a) => {
                const Icon = kindIcon(a.kind);
                return (
                  <Card
                    key={a.id}
                    className="flex items-center gap-3 p-3 hover-elevate cursor-pointer"
                    onClick={() => setSelected(a)}
                    data-testid={`row-artifact-${a.id}`}
                  >
                    <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate" data-testid={`text-row-filename-${a.id}`}>{a.filename}</div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {a.tool_name ?? "—"} · {a.kind} · {formatBytes(a.size_bytes)} · {a.created_at?.slice(0, 19).replace("T", " ")}
                      </div>
                    </div>
                    {a.public && <Badge variant="secondary" data-testid={`badge-public-${a.id}`}>public</Badge>}
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="dialog-artifact-detail">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle data-testid="text-detail-filename">{selected.filename}</DialogTitle>
              </DialogHeader>
              {selected.kind === "image" && (
                <img
                  src={`/api/v1/artifacts/${selected.id}/download`}
                  alt={selected.filename}
                  className="w-full max-h-[40vh] object-contain bg-muted rounded-md"
                  data-testid="img-detail"
                />
              )}
              <div className="text-xs text-muted-foreground space-y-1">
                <div><span className="font-mono">id:</span> {selected.id}</div>
                <div><span className="font-mono">kind:</span> {selected.kind}</div>
                <div><span className="font-mono">tool:</span> {selected.tool_name ?? "—"}</div>
                <div><span className="font-mono">mime:</span> {selected.mime}</div>
                <div><span className="font-mono">size:</span> {formatBytes(selected.size_bytes)}</div>
                <div><span className="font-mono">sha256:</span> <span className="break-all">{selected.sha256}</span></div>
                <div><span className="font-mono">created:</span> {selected.created_at}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Provenance</div>
                <pre className="text-[11px] bg-muted p-2 rounded-md overflow-auto max-h-48" data-testid="text-provenance">
                  {JSON.stringify(selected.provenance ?? {}, null, 2)}
                </pre>
              </div>
              <div className="flex items-center justify-between gap-3 pt-2 flex-wrap">
                <Button asChild variant="default" data-testid="button-download">
                  <a href={`/api/v1/artifacts/${selected.id}/download`} download={selected.filename}>
                    <Download className="w-4 h-4 mr-2" /> Download
                  </a>
                </Button>
                {isAdmin && (
                  <label className="flex items-center gap-2 text-sm" data-testid="label-public-toggle">
                    <span>Public</span>
                    <Switch
                      checked={selected.public}
                      onCheckedChange={(v) => togglePublic(selected, v)}
                      data-testid="switch-public"
                    />
                  </label>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
// 248:0
