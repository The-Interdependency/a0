import { Settings, FileText, Clock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { Skeleton } from "@/components/ui/skeleton";

interface ReadmeData {
  content: string;
  filename: string;
  updatedAt: string;
}

export function SystemTab() {
  const { data, isLoading, isError } = useQuery<ReadmeData>({
    queryKey: ["/api/v1/system/readme"],
  });

  return (
    <div className="h-full w-full overflow-y-auto overflow-x-hidden px-3 py-3 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Settings className="w-4 h-4" />
          <span>System Config</span>
        </div>
        {data && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <FileText className="w-3 h-3" />
            <span>{data.filename}</span>
            <Clock className="w-3 h-3 ml-1" />
            <span>{new Date(data.updatedAt).toLocaleString()}</span>
          </div>
        )}
      </div>

      {isLoading && (
        <div className="flex flex-col gap-2 mt-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-4/6" />
          <Skeleton className="h-6 w-36 mt-3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      )}

      {isError && (
        <div className="text-sm text-muted-foreground mt-2">
          No documentation file found (README.md or replit.md).
        </div>
      )}

      {data && (
        <div
          data-testid="system-readme-content"
          className="prose prose-sm dark:prose-invert max-w-none text-foreground
            [&>h1]:text-base [&>h1]:font-bold [&>h1]:mt-4 [&>h1]:mb-2
            [&>h2]:text-sm [&>h2]:font-semibold [&>h2]:mt-4 [&>h2]:mb-1.5
            [&>h3]:text-sm [&>h3]:font-medium [&>h3]:mt-3 [&>h3]:mb-1
            [&>p]:text-xs [&>p]:leading-relaxed [&>p]:mb-2
            [&>ul]:text-xs [&>ul]:pl-4 [&>ul]:mb-2
            [&>ol]:text-xs [&>ol]:pl-4 [&>ol]:mb-2
            [&>li]:mb-0.5
            [&>pre]:bg-muted [&>pre]:rounded [&>pre]:p-2 [&>pre]:text-xs [&>pre]:overflow-x-auto [&>pre]:mb-2
            [&>code]:bg-muted [&>code]:rounded [&>code]:px-1 [&>code]:text-xs
            [&_pre]:bg-muted [&_pre]:rounded [&_pre]:p-2 [&_pre]:text-xs [&_pre]:overflow-x-auto [&_pre]:mb-2
            [&_code]:bg-muted [&_code]:rounded [&_code]:px-1 [&_code]:text-xs
            [&>hr]:border-border [&>hr]:my-3
            [&>blockquote]:border-l-2 [&>blockquote]:border-border [&>blockquote]:pl-3 [&>blockquote]:italic [&>blockquote]:text-muted-foreground"
        >
          <ReactMarkdown>{data.content}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}
