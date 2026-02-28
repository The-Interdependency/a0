import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Folder, FileText, ChevronRight, ChevronLeft, RefreshCw,
  Move, FileCode, File, Upload, Camera, Loader2,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";

interface FileItem {
  name: string;
  type: "file" | "directory";
  path: string;
  size: number;
}

interface FileListing {
  path: string;
  items: FileItem[];
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function getFileIcon(name: string, type: string) {
  if (type === "directory") return <Folder className="w-4 h-4 text-yellow-400" />;
  if (name.endsWith(".ts") || name.endsWith(".tsx") || name.endsWith(".js") || name.endsWith(".jsx"))
    return <FileCode className="w-4 h-4 text-blue-400" />;
  if (name.endsWith(".md") || name.endsWith(".txt")) return <FileText className="w-4 h-4 text-green-400" />;
  return <File className="w-4 h-4 text-muted-foreground" />;
}

export default function FilesPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [currentPath, setCurrentPath] = useState(".");
  const [pathHistory, setPathHistory] = useState<string[]>([]);
  const [viewFile, setViewFile] = useState<{ path: string; content: string } | null>(null);
  const [moveDialog, setMoveDialog] = useState<{ from: string } | null>(null);
  const [moveTo, setMoveTo] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const manifestInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, refetch } = useQuery<FileListing>({
    queryKey: ["/api/files", currentPath],
    queryFn: async () => {
      const res = await fetch(`/api/files?path=${encodeURIComponent(currentPath)}`);
      return res.json();
    },
  });

  const readFile = useMutation({
    mutationFn: async (path: string) => {
      const res = await fetch(`/api/files/read?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => setViewFile(data),
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const moveFile = useMutation({
    mutationFn: ({ from, to }: { from: string; to: string }) =>
      apiRequest("POST", "/api/files/move", { from, to }),
    onSuccess: () => {
      toast({ title: "Moved", description: "File moved successfully" });
      setMoveDialog(null);
      setMoveTo("");
      refetch();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const saveFile = useMutation({
    mutationFn: ({ path, content }: { path: string; content: string }) =>
      apiRequest("POST", "/api/files/write", { path, content }),
    onSuccess: () => {
      toast({ title: "Saved", description: "File saved" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  async function handleUpload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setUploadProgress(0);
    const formData = new FormData();
    Array.from(files).forEach((f) => formData.append("files", f));

    try {
      const xhr = new XMLHttpRequest();
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
      };
      await new Promise<void>((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const result = JSON.parse(xhr.responseText);
            const eng = result.engine?.[0];
            const edcmInfo = eng?.decision ? ` [EDCM: ${eng.decision}, delta=${eng.delta?.toFixed(3)}]` : "";
            toast({
              title: "Uploaded + EDCM processed",
              description: `${result.uploaded.length} file(s) hash-chained${edcmInfo}`,
            });
            resolve();
          } else {
            reject(new Error("Upload failed"));
          }
        };
        xhr.onerror = () => reject(new Error("Upload failed"));
        xhr.open("POST", "/api/files/upload");
        xhr.send(formData);
      });
      refetch();
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleManifestUpload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("manifest", files[0]);

    try {
      const res = await fetch("/api/files/upload-manifest", { method: "POST", body: formData });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const engInfo = data.engine?.decision ? ` [EDCM: ${data.engine.decision}]` : "";
      toast({
        title: "Snapshot uploaded + EDCM processed",
        description: `${data.totalEntries} entries hash-chained${engInfo}. Ask the agent to analyze "${data.path}" for dedup.`,
      });
      refetch();
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (manifestInputRef.current) manifestInputRef.current.value = "";
    }
  }

  function navigate(item: FileItem) {
    if (item.type === "directory") {
      setPathHistory((h) => [...h, currentPath]);
      setCurrentPath(item.path);
    } else {
      readFile.mutate(item.path);
    }
  }

  function goBack() {
    const prev = pathHistory[pathHistory.length - 1];
    if (prev !== undefined) {
      setPathHistory((h) => h.slice(0, -1));
      setCurrentPath(prev);
    }
  }

  const breadcrumbs = currentPath === "." ? ["."] : [".", ...currentPath.split("/").filter(Boolean)];

  return (
    <div className="flex flex-col h-full">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => handleUpload(e.target.files)}
        data-testid="input-file-upload"
      />
      <input
        ref={manifestInputRef}
        type="file"
        accept=".txt,.csv,.json,.log"
        className="hidden"
        onChange={(e) => handleManifestUpload(e.target.files)}
        data-testid="input-manifest-upload"
      />

      <header className="flex items-center gap-1 px-3 py-2 border-b border-border bg-card flex-shrink-0">
        <Button
          size="icon"
          variant="ghost"
          onClick={goBack}
          disabled={pathHistory.length === 0}
          data-testid="button-back"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <ScrollArea className="flex-1" orientation="horizontal">
          <div className="flex items-center gap-1 text-xs whitespace-nowrap">
            {breadcrumbs.map((crumb, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                <span className={i === breadcrumbs.length - 1 ? "font-semibold" : "text-muted-foreground"}>
                  {crumb}
                </span>
              </span>
            ))}
          </div>
        </ScrollArea>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => refetch()}
          data-testid="button-refresh-files"
        >
          <RefreshCw className="w-4 h-4" />
        </Button>
      </header>

      <div className="flex gap-2 px-3 py-2 border-b border-border bg-card/50 flex-shrink-0">
        <Button
          variant="outline"
          className="flex-1 gap-2"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          data-testid="button-upload"
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          <span className="text-sm">Upload Files</span>
        </Button>
        <Button
          variant="outline"
          className="flex-1 gap-2"
          onClick={() => manifestInputRef.current?.click()}
          disabled={uploading}
          data-testid="button-snapshot"
        >
          <Camera className="w-4 h-4" />
          <span className="text-sm">Phone Snapshot</span>
        </Button>
      </div>

      {uploading && uploadProgress > 0 && (
        <div className="px-3 py-1 flex-shrink-0">
          <Progress value={uploadProgress} className="h-1" />
          <p className="text-[10px] text-muted-foreground mt-0.5">{uploadProgress}% uploaded</p>
        </div>
      )}

      <ScrollArea className="flex-1 px-2 py-1">
        {isLoading ? (
          Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full mb-1 rounded-md" />
          ))
        ) : (
          <div className="space-y-0.5">
            {data?.items.map((item) => (
              <div
                key={item.path}
                className="flex items-center gap-2 rounded-md px-2 py-2 cursor-pointer hover-elevate group"
                onClick={() => navigate(item)}
                data-testid={`file-item-${item.name}`}
              >
                {getFileIcon(item.name, item.type)}
                <span className="flex-1 text-sm truncate">{item.name}</span>
                {item.type === "file" && (
                  <span className="text-xs text-muted-foreground">{formatSize(item.size)}</span>
                )}
                {item.type === "directory" && (
                  <ChevronRight className="w-3 h-3 text-muted-foreground" />
                )}
                {item.type === "file" && (
                  <button
                    className="invisible group-hover:visible p-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMoveDialog({ from: item.path });
                      setMoveTo(item.path);
                    }}
                    data-testid={`button-move-${item.name}`}
                  >
                    <Move className="w-3 h-3 text-muted-foreground" />
                  </button>
                )}
              </div>
            ))}
            {data?.items.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                Empty directory
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      <Dialog open={!!viewFile} onOpenChange={() => setViewFile(null)}>
        <DialogContent className="w-[95vw] max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-sm font-mono truncate">{viewFile?.path}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1 min-h-0">
            <Textarea
              value={viewFile?.content || ""}
              onChange={(e) => setViewFile((v) => v ? { ...v, content: e.target.value } : null)}
              className="font-mono text-xs min-h-[300px] resize-none border-0 focus-visible:ring-0"
              data-testid="textarea-file-content"
            />
          </ScrollArea>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setViewFile(null)}
              data-testid="button-close-file"
            >
              Close
            </Button>
            <Button
              onClick={() => viewFile && saveFile.mutate({ path: viewFile.path, content: viewFile.content })}
              disabled={saveFile.isPending}
              data-testid="button-save-file"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!moveDialog} onOpenChange={() => setMoveDialog(null)}>
        <DialogContent className="w-[90vw] max-w-sm">
          <DialogHeader>
            <DialogTitle>Move File</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground truncate">From: {moveDialog?.from}</p>
            <Input
              value={moveTo}
              onChange={(e) => setMoveTo(e.target.value)}
              placeholder="New path..."
              className="text-sm"
              data-testid="input-move-to"
            />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setMoveDialog(null)}>Cancel</Button>
            <Button
              onClick={() => moveDialog && moveFile.mutate({ from: moveDialog.from, to: moveTo })}
              disabled={moveFile.isPending}
              data-testid="button-confirm-move"
            >
              Move
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
