// 182:4
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Image as ImageIcon, FileText, FileJson, FileCode, ExternalLink } from "lucide-react";
import { useSEO } from "@/hooks/use-seo";

// Distinct from /archive: this page only shows artifacts whose `public`
// flag is true. Anyone with access to the route sees the same set, which
// makes it the natural surface for showcase / shareable agent output.
// Auth still happens at the API layer; the proxy enforces session cookies.
type Artifact = {
  id: string;
  kind: string;
  tool_name: string | null;
  agent_run_id: string | null;
  storage_path: string;
  filename: string;
  mime: string;
  size_bytes: number;
  public: boolean;
  created_at: string;
};

const KIND_ICON: Record<string, typeof ImageIcon> = {
  image: ImageIcon,
  text: FileText,
  json: FileJson,
  code: FileCode,
};

function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function GalleryPage() {
  useSEO({
    title: "a0p — Gallery",
    description: "Public artifacts produced by a0p agents: images, code, documents, and other tool outputs.",
  });
  const [kind, setKind] = useState<string>("all");
  const qs = new URLSearchParams({ public: "true", limit: "60" });
  if (kind !== "all") qs.set("kind", kind);

  const { data, isLoading, error } = useQuery<{ items: Artifact[] }>({
    queryKey: ["/api/v1/artifacts", "public", kind],
    queryFn: async () => {
      const r = await fetch(`/api/v1/artifacts?${qs.toString()}`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error(`gallery fetch failed: ${r.status}`);
      return r.json();
    },
  });

  const items = data?.items ?? [];

  return (
    <div className="flex-1 flex flex-col bg-background" data-testid="gallery-page">
      <div className="border-b border-border bg-card px-6 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-gallery-title">
              Gallery
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Public artifacts. Flip an artifact to public from your{" "}
              <Link href="/archive" className="text-primary hover:underline" data-testid="link-archive">
                archive
              </Link>
              .
            </p>
          </div>
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger className="w-40" data-testid="select-kind">
              <SelectValue placeholder="All kinds" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All kinds</SelectItem>
              <SelectItem value="image">Images</SelectItem>
              <SelectItem value="text">Text</SelectItem>
              <SelectItem value="json">JSON</SelectItem>
              <SelectItem value="code">Code</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {isLoading && (
          <div className="flex items-center justify-center py-16" data-testid="status-loading">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {error && (
          <Card className="p-6 border-destructive" data-testid="status-error">
            <p className="text-sm text-destructive">
              Couldn’t load gallery: {(error as Error).message}
            </p>
          </Card>
        )}
        {!isLoading && !error && items.length === 0 && (
          <Card className="p-12 text-center" data-testid="status-empty">
            <p className="text-muted-foreground">
              Nothing public yet. Open the{" "}
              <Link href="/archive" className="text-primary hover:underline">
                archive
              </Link>{" "}
              and toggle an artifact to public to see it here.
            </p>
          </Card>
        )}
        {!isLoading && items.length > 0 && (
          <div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
            data-testid="grid-gallery"
          >
            {items.map((a) => {
              const Icon = KIND_ICON[a.kind] ?? FileText;
              const isImage = a.kind === "image" || (a.mime || "").startsWith("image/");
              return (
                <Card
                  key={a.id}
                  className="overflow-hidden flex flex-col hover-elevate"
                  data-testid={`card-artifact-${a.id}`}
                >
                  <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden">
                    {isImage ? (
                      <img
                        src={`/api/v1/artifacts/${a.id}/download`}
                        alt={a.filename}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        data-testid={`img-artifact-${a.id}`}
                      />
                    ) : (
                      <Icon className="h-12 w-12 text-muted-foreground" />
                    )}
                  </div>
                  <div className="p-3 flex-1 flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs" data-testid={`badge-kind-${a.id}`}>
                        {a.kind}
                      </Badge>
                      {a.tool_name && (
                        <Badge variant="outline" className="text-xs" data-testid={`badge-tool-${a.id}`}>
                          {a.tool_name}
                        </Badge>
                      )}
                    </div>
                    <p
                      className="text-sm font-medium truncate"
                      title={a.filename}
                      data-testid={`text-filename-${a.id}`}
                    >
                      {a.filename}
                    </p>
                    <div className="flex items-center justify-between mt-auto">
                      <span className="text-xs text-muted-foreground" data-testid={`text-size-${a.id}`}>
                        {bytes(a.size_bytes)}
                      </span>
                      <Button
                        asChild
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        data-testid={`button-open-${a.id}`}
                      >
                        <a
                          href={`/api/v1/artifacts/${a.id}/download`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
// 182:4
