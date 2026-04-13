// 266:1
// DOC_UI sigma_tab
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layers, RefreshCw, Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import { useBillingStatus } from "@/hooks/use-billing-status";
import { useToast } from "@/hooks/use-toast";

interface ContentWatch {
  path: string;
  hash_prefix: string;
  last_changed: number;
  last_changed_iso: string;
}

interface SigmaState {
  name: string;
  symbol: string;
  resolution: number;
  n: number;
  entry_count: number;
  ring_coherence: number;
  tensor_mean: number;
  last_scan_iso: string | null;
  structural_interval: number;
  content_interval: number;
  content_watches: ContentWatch[];
  recent_events: Array<{ type: string; path?: string; ts: number }>;
}

function CoherenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct > 75 ? "bg-green-500" : pct > 45 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground w-10 text-right">{pct}%</span>
    </div>
  );
}

export default function SigmaTab() {
  const [newPath, setNewPath] = useState("");
  const { isWs } = useBillingStatus();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: state, isLoading } = useQuery<SigmaState>({
    queryKey: ["/api/v1/sigma/state"],
    refetchInterval: 15000,
  });

  const resolveMut = useMutation({
    mutationFn: (resolution: number) =>
      apiRequest("PATCH", "/api/v1/sigma/resolution", { resolution }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/v1/sigma/state"] }); },
    onError: () => toast({ title: "Failed to set resolution", variant: "destructive" }),
  });

  const rescanMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/v1/sigma/rescan", {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/v1/sigma/state"] }); },
    onError: () => toast({ title: "Rescan failed", variant: "destructive" }),
  });

  const addWatchMut = useMutation({
    mutationFn: (path: string) =>
      apiRequest("POST", "/api/v1/sigma/content-watch", { path }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/v1/sigma/state"] });
      setNewPath("");
    },
    onError: () => toast({ title: "Failed to add watch", variant: "destructive" }),
  });

  const removeWatchMut = useMutation({
    mutationFn: (path: string) =>
      apiRequest("DELETE", "/api/v1/sigma/content-watch", { path }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/v1/sigma/state"] }); },
    onError: () => toast({ title: "Failed to remove watch", variant: "destructive" }),
  });

  if (isLoading || !state) {
    return (
      <div className="flex items-center justify-center h-40" data-testid="sigma-loading">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const RESOLUTIONS = [
    { level: 1, label: "1", title: "Top-level dirs only" },
    { level: 2, label: "2", title: "Depth 2, code files" },
    { level: 3, label: "3", title: "Depth 3, all code types" },
    { level: 4, label: "4", title: "Full walk (no heavy dirs)" },
    { level: 5, label: "5", title: "Full walk, everything" },
  ];

  return (
    <div className="space-y-4 p-4" data-testid="sigma-tab">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Layers className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Σ Sigma — Substrate Core</h2>
        <Badge variant="outline" className="ml-auto font-mono text-xs">n={state.n}</Badge>
      </div>

      {/* State overview */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Ring State</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground text-xs mb-1">Filesystem Entries</div>
              <div className="font-mono" data-testid="sigma-entry-count">{state.entry_count}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs mb-1">Ring Size (N)</div>
              <div className="font-mono" data-testid="sigma-n">{state.n}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs mb-1">Tensor Mean</div>
              <div className="font-mono" data-testid="sigma-tensor-mean">{state.tensor_mean.toFixed(4)}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs mb-1">Last Scan</div>
              <div className="font-mono text-xs" data-testid="sigma-last-scan">{state.last_scan_iso ?? "—"}</div>
            </div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs mb-1">Coherence</div>
            <CoherenceBar value={state.ring_coherence} />
          </div>
        </CardContent>
      </Card>

      {/* Resolution control */}
      {isWs && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Scan Resolution</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-1" data-testid="sigma-resolution-controls">
              {RESOLUTIONS.map(({ level, label, title }) => (
                <button
                  key={level}
                  title={title}
                  data-testid={`sigma-resolution-${level}`}
                  onClick={() => resolveMut.mutate(level)}
                  disabled={resolveMut.isPending}
                  className={`flex-1 py-1.5 rounded text-sm font-mono font-medium transition-colors border ${
                    state.resolution === level
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background hover:bg-accent border-border text-muted-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Current: Level {state.resolution} — {RESOLUTIONS.find(r => r.level === state.resolution)?.title}
            </p>
            <Button
              size="sm"
              variant="outline"
              data-testid="sigma-rescan-btn"
              onClick={() => rescanMut.mutate()}
              disabled={rescanMut.isPending}
              className="w-full"
            >
              {rescanMut.isPending
                ? <><Loader2 className="h-3 w-3 animate-spin mr-1" />Scanning…</>
                : <><RefreshCw className="h-3 w-3 mr-1" />Rescan Now</>
              }
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Content watch panel */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Content Watches
            <Badge variant="secondary" className="ml-2 text-xs">{state.content_watches.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {state.content_watches.length === 0 ? (
            <p className="text-xs text-muted-foreground">No files being watched.</p>
          ) : (
            <div className="space-y-2">
              {state.content_watches.map((w) => (
                <div
                  key={w.path}
                  className="flex items-start gap-2 p-2 rounded-md bg-muted/40 text-xs"
                  data-testid={`sigma-watch-${w.path.replace(/\//g, "-")}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-mono truncate text-foreground" title={w.path}>{w.path}</div>
                    <div className="text-muted-foreground mt-0.5">
                      hash: <span className="font-mono">{w.hash_prefix || "—"}</span>
                      {" · "}
                      {w.last_changed_iso}
                    </div>
                  </div>
                  {isWs && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                      data-testid={`sigma-watch-remove-${w.path.replace(/\//g, "-")}`}
                      onClick={() => removeWatchMut.mutate(w.path)}
                      disabled={removeWatchMut.isPending}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {isWs && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (newPath.trim()) addWatchMut.mutate(newPath.trim());
              }}
              className="flex gap-2"
            >
              <Input
                value={newPath}
                onChange={(e) => setNewPath(e.target.value)}
                placeholder="path/to/file.py"
                className="text-xs h-8"
                data-testid="sigma-watch-input"
              />
              <Button
                type="submit"
                size="sm"
                className="h-8 shrink-0"
                data-testid="sigma-watch-add-btn"
                disabled={!newPath.trim() || addWatchMut.isPending}
              >
                <Plus className="h-3 w-3" />
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Recent events */}
      {state.recent_events.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Recent Events</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {state.recent_events.slice().reverse().map((evt, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline" className="text-xs py-0">{evt.type}</Badge>
                  {evt.path && <span className="font-mono truncate">{evt.path.split("/").slice(-2).join("/")}</span>}
                  <span className="ml-auto shrink-0">{new Date(evt.ts * 1000).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
// 266:1
