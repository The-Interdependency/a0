import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { CloudIcon, Folder, FileText, ChevronLeft, ChevronRight, RefreshCw, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
}

function isFolder(f: DriveFile) {
  return f.mimeType === "application/vnd.google-apps.folder";
}

function getMimeLabel(mimeType: string) {
  const map: Record<string, string> = {
    "application/vnd.google-apps.document": "Doc",
    "application/vnd.google-apps.spreadsheet": "Sheet",
    "application/vnd.google-apps.presentation": "Slides",
    "application/vnd.google-apps.folder": "Folder",
    "application/pdf": "PDF",
    "text/plain": "TXT",
    "image/png": "PNG",
    "image/jpeg": "JPG",
  };
  return map[mimeType] || "File";
}

function formatDate(dateStr?: string) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function DrivePage() {
  const [folderId, setFolderId] = useState<string | undefined>(undefined);
  const [history, setHistory] = useState<Array<{ id?: string; name: string }>>([{ id: undefined, name: "My Drive" }]);

  const { data: files, isLoading, error, refetch } = useQuery<DriveFile[]>({
    queryKey: ["/api/drive/files", folderId],
    queryFn: async () => {
      const url = folderId ? `/api/drive/files?folderId=${folderId}` : "/api/drive/files";
      const res = await fetch(url);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      return data;
    },
  });

  function openFolder(file: DriveFile) {
    setHistory((h) => [...h, { id: file.id, name: file.name }]);
    setFolderId(file.id);
  }

  function goBack() {
    if (history.length <= 1) return;
    const prev = history[history.length - 2];
    setHistory((h) => h.slice(0, -1));
    setFolderId(prev.id);
  }

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card flex-shrink-0">
        <Button
          size="icon"
          variant="ghost"
          onClick={goBack}
          disabled={history.length <= 1}
          data-testid="button-drive-back"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <CloudIcon className="w-4 h-4 text-blue-400 flex-shrink-0" />
        <ScrollArea className="flex-1" orientation="horizontal">
          <div className="flex items-center gap-1 text-xs whitespace-nowrap">
            {history.map((h, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                <span className={i === history.length - 1 ? "font-semibold" : "text-muted-foreground"}>
                  {h.name}
                </span>
              </span>
            ))}
          </div>
        </ScrollArea>
        <Button size="icon" variant="ghost" onClick={() => refetch()} data-testid="button-drive-refresh">
          <RefreshCw className="w-4 h-4" />
        </Button>
      </header>

      <ScrollArea className="flex-1 px-2 py-1">
        {isLoading ? (
          Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full mb-1 rounded-md" />
          ))
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-center px-4">
            <AlertCircle className="w-8 h-8 text-destructive" />
            <div>
              <p className="font-medium text-sm">Google Drive not connected</p>
              <p className="text-xs text-muted-foreground mt-1">
                Connect your Google account to browse Drive files.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-0.5">
            {files?.map((file) => (
              <div
                key={file.id}
                className={cn(
                  "flex items-center gap-3 rounded-md px-2 py-2.5 hover-elevate",
                  isFolder(file) && "cursor-pointer"
                )}
                onClick={() => isFolder(file) && openFolder(file)}
                data-testid={`drive-file-${file.id}`}
              >
                {isFolder(file) ? (
                  <Folder className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                ) : (
                  <FileText className="w-4 h-4 text-blue-400 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{file.name}</p>
                  <p className="text-[10px] text-muted-foreground">{formatDate(file.modifiedTime)}</p>
                </div>
                <Badge variant="secondary" className="text-[9px] flex-shrink-0">
                  {getMimeLabel(file.mimeType)}
                </Badge>
                {isFolder(file) && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
              </div>
            ))}
            {files?.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                Empty folder
              </div>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
