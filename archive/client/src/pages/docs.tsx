// 109:0 1:1 1:2
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link } from "wouter";
import { ArrowLeft, Loader2, FileText, AlertCircle } from "lucide-react";
import { useBillingStatus } from "@/hooks/use-billing-status";

const DOC_FILES = [
  { key: "replit.md", label: "replit.md" },
  { key: "CLAUDE.md", label: "CLAUDE.md" },
  { key: "copilot.md", label: "copilot.md" },
  { key: "README.md", label: "README.md" },
] as const;

type DocKey = (typeof DOC_FILES)[number]["key"];

interface DocResponse {
  file: string;
  content: string;
}

function DocViewer({ file }: { file: DocKey }) {
  const { data, isLoading, isError } = useQuery<DocResponse>({
    queryKey: ["/api/v1/system/docs", file],
    queryFn: async () => {
      const res = await fetch(`/api/v1/system/docs?file=${encodeURIComponent(file)}`);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return res.json();
    },
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex items-center gap-2 py-12 text-destructive justify-center">
        <AlertCircle className="w-4 h-4" />
        <span className="text-sm">Failed to load {file}</span>
      </div>
    );
  }

  return (
    <div className="prose prose-sm prose-invert max-w-none px-1">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{data.content}</ReactMarkdown>
    </div>
  );
}

export default function DocsPage() {
  const [active, setActive] = useState<DocKey>("replit.md");
  const { isWs, isAdmin } = useBillingStatus();

  if (!isWs && !isAdmin) {
    return (
      <div className="min-h-screen bg-background px-4 pt-8 max-w-lg mx-auto">
        <div className="mb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            data-testid="link-back-home"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Link>
        </div>
        <p className="text-sm text-muted-foreground">ws/admin access required.</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      <div className="flex-shrink-0 border-b border-border px-4 pt-3 pb-0">
        <div className="mb-2">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            data-testid="link-back-home"
          >
            <ArrowLeft className="w-3 h-3" />
            Back
          </Link>
        </div>
        <div className="flex items-center gap-1.5 mb-3">
          <FileText className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Docs</span>
        </div>
        <div className="flex gap-0 overflow-x-auto">
          {DOC_FILES.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActive(key)}
              className={`px-3 py-1.5 text-xs font-mono border-b-2 transition-colors whitespace-nowrap ${
                active === key
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              data-testid={`tab-doc-${key}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6">
        <DocViewer key={active} file={active} />
      </div>
    </div>
  );
}
// 109:0 1:1 1:2
