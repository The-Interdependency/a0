import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { ChevronDown, ChevronRight, FileText, Plus, RefreshCw, Scan, Trash2, Upload } from "lucide-react";

type Source = { slug: string; displayName: string; fileCount: number; lastScannedAt?: string; lastScan?: string; report?: any; latestReport?: any };

export function IngestTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [fetchUrl, setFetchUrl] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadSlug, setUploadSlug] = useState<string | null>(null);

  const { data: sources = [], isLoading } = useQuery<Source[]>({
    queryKey: ["/api/v1/transcripts/sources"],
    staleTime: 15000,
  });

  const createMutation = useMutation({
    mutationFn: (displayName: string) =>
      apiRequest("POST", "/api/v1/transcripts/sources", { displayName }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/transcripts/sources"] });
      toast({ title: "Source created" });
      setNewName("");
      setShowNew(false);
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (slug: string) => apiRequest("DELETE", `/api/v1/transcripts/sources/${slug}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/transcripts/sources"] });
      toast({ title: "Source deleted" });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const scanMutation = useMutation({
    mutationFn: (slug: string) =>
      apiRequest("POST", `/api/v1/transcripts/sources/${slug}/scan`).then(r => r.json()),
    onSuccess: (data: any, slug: string) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/transcripts/sources"] });
      toast({ title: `Scan complete — ${data.filesScanned ?? 0} files` });
    },
    onError: (e: any) => toast({ title: "Scan failed", description: e.message, variant: "destructive" }),
  });

  const fetchUrlMutation = useMutation({
    mutationFn: ({ slug, url }: { slug: string; url: string }) =>
      apiRequest("POST", "/api/v1/transcripts/fetch-url", { url, sourceSlug: slug }).then(r => r.json()),
    onSuccess: (_data: any, { slug }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/transcripts/sources"] });
      toast({ title: "URL fetched and saved" });
      setFetchUrl(prev => ({ ...prev, [slug]: "" }));
    },
    onError: (e: any) => toast({ title: "Fetch failed", description: e.message, variant: "destructive" }),
  });

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!uploadSlug || !e.target.files?.length) return;
    const formData = new FormData();
    Array.from(e.target.files).forEach(f => formData.append("files", f));
    fetch(`/api/v1/transcripts/sources/${uploadSlug}/upload`, { method: "POST", body: formData })
      .then(r => r.json())
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/v1/transcripts/sources"] });
        toast({ title: "Files uploaded" });
      })
      .catch(e => toast({ title: "Upload failed", description: e.message, variant: "destructive" }));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="h-full w-full overflow-y-auto overflow-x-hidden px-3 py-3 space-y-3">
      <div className="flex items-center gap-2">
        <Upload className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold" data-testid="text-ingest-title">Research Ingest</h3>
        <Badge variant="outline" className="text-xs ml-auto">{sources.length} sources</Badge>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => setShowNew(!showNew)}
          data-testid="button-ingest-new"
        >
          <Plus className="w-3 h-3 mr-1" />New
        </Button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".json,.jsonl,.txt,.md"
        className="hidden"
        onChange={handleFileUpload}
      />

      {showNew && (
        <div className="rounded-lg border border-border bg-card p-3 space-y-2">
          <Input
            className="h-7 text-xs"
            placeholder="Source display name"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            data-testid="input-source-name"
          />
          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-xs" onClick={() => createMutation.mutate(newName)} disabled={!newName.trim() || createMutation.isPending} data-testid="button-create-source">Create</Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowNew(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {isLoading && <div className="space-y-2">{[1,2].map(i => <Skeleton key={i} className="h-20" />)}</div>}

      {!isLoading && sources.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-8">No transcript sources yet. Create one to start ingesting.</p>
      )}

      {sources.map(src => (
        <div key={src.slug} className="rounded-lg border border-border bg-card" data-testid={`source-${src.slug}`}>
          <div
            className="flex items-center gap-2 p-3 cursor-pointer"
            onClick={() => setExpanded(prev => prev === src.slug ? null : src.slug)}
          >
            {expanded === src.slug
              ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            }
            <FileText className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{src.displayName}</p>
              <p className="text-xs text-muted-foreground">{src.fileCount} file(s) · slug: {src.slug}</p>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-xs"
                onClick={e => { e.stopPropagation(); scanMutation.mutate(src.slug); }}
                disabled={scanMutation.isPending && scanMutation.variables === src.slug}
                data-testid={`button-scan-${src.slug}`}
              >
                <Scan className="w-3 h-3 mr-1" />Scan
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={e => { e.stopPropagation(); deleteMutation.mutate(src.slug); }}
                data-testid={`button-delete-source-${src.slug}`}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </div>

          {expanded === src.slug && (
            <div className="border-t border-border p-3 space-y-3">
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs flex-1"
                  onClick={() => { setUploadSlug(src.slug); fileInputRef.current?.click(); }}
                  data-testid={`button-upload-${src.slug}`}
                >
                  <Upload className="w-3 h-3 mr-1" />Upload Files
                </Button>
              </div>
              <div className="flex gap-2">
                <Input
                  className="h-7 text-xs flex-1"
                  placeholder="Fetch from URL (ChatGPT export, GitHub raw…)"
                  value={fetchUrl[src.slug] || ""}
                  onChange={e => setFetchUrl(prev => ({ ...prev, [src.slug]: e.target.value }))}
                  data-testid={`input-fetch-url-${src.slug}`}
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => fetchUrlMutation.mutate({ slug: src.slug, url: fetchUrl[src.slug] || "" })}
                  disabled={!fetchUrl[src.slug]?.trim() || fetchUrlMutation.isPending}
                  data-testid={`button-fetch-url-${src.slug}`}
                >
                  Fetch
                </Button>
              </div>
              {(src.latestReport || src.report) && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Last Scan Summary:</p>
                  <pre className="text-xs font-mono bg-muted/30 rounded p-2 overflow-x-auto max-h-28 text-muted-foreground">
                    {JSON.stringify(src.latestReport || src.report, null, 2).slice(0, 400)}
                  </pre>
                  {(src.lastScannedAt || src.lastScan) && <p className="text-xs text-muted-foreground">Scanned: {new Date(src.lastScannedAt || src.lastScan!).toLocaleString()}</p>}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
