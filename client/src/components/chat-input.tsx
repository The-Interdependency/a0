// 364:7 0:3 0:6
// N:M
import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send, Paperclip, X, FileText, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ModelPicker } from "@/components/model-picker";

export interface PendingAttachment {
  id: number;
  storage_url: string;
  mime_type: string;
  name?: string;
  preview?: string;
  kind?: "image" | "document";
  bytes?: number;
}

const MAX_BYTES = 25 * 1024 * 1024;
const ACCEPT_ATTR = [
  "image/*", "application/pdf",
  "text/plain", "text/markdown", "text/csv", "text/html",
  "application/json", "application/xml", "application/yaml", "text/yaml",
  "application/zip",
  ".md", ".csv", ".tsv", ".json", ".yaml", ".yml", ".xml",
  ".py", ".js", ".ts", ".tsx", ".jsx",
  ".go", ".rs", ".java", ".c", ".cc", ".cpp", ".h",
  ".sh", ".sql", ".log", ".toml", ".ini", ".env",
].join(",");

export interface ChatSendOpts {
  orchestration_mode?: string;
  providers?: string[];
  resolved_providers?: string[];
  model?: string;
  instances?: string[];
}

// vendor → base provider_id for backward-compat fan-out routing
const VENDOR_TO_PROVIDER: Record<string, string> = {
  google: "gemini",
  openai: "openai",
  anthropic: "claude",
  xai: "grok",
};

const VENDOR_COLORS: Record<string, string> = {
  google: "bg-green-500",
  openai: "bg-blue-500",
  anthropic: "bg-orange-500",
  xai: "bg-purple-400",
};

interface InstanceRow {
  id: string;
  canonical_name: string;
  vendor: string;
  model_id: string;
  role_slot?: string | null;
}

interface PrefsRes { orchestration_mode?: string; cut_mode?: string; providers?: string[] }

export function ChatInput({
  onSend,
  isSending,
  hideModelPicker = false,
  hideBorderTop = false,
}: {
  onSend: (content: string, attachmentIds: number[], opts?: ChatSendOpts) => void;
  isSending: boolean;
  hideModelPicker?: boolean;
  hideBorderTop?: boolean;
}) {
  const { toast } = useToast();
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedInstances, setSelectedInstances] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);

  const instancesQ = useQuery<InstanceRow[]>({
    queryKey: ["/api/v1/agents/instances"],
    refetchInterval: 60_000,
  });
  const instances = instancesQ.data ?? [];

  const savePrefs = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("PATCH", "/api/v1/users/me/preferences", { orchestration_mode: "single" });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/users/me/preferences"] });
      toast({ title: "Saved as default" });
    },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const toggleInstance = (id: string) => {
    setSelectedInstances((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const uploadOne = useCallback(async (file: File) => {
    if (file.size > MAX_BYTES) {
      toast({ title: "File too large", description: "Max 25 MB", variant: "destructive" });
      return;
    }
    const fd = new FormData();
    fd.append("file", file);
    setUploading(true);
    try {
      const res = await fetch("/api/v1/attachments", { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) {
        const msg = await res.text().catch(() => "upload failed");
        throw new Error(msg);
      }
      const data = await res.json();
      const isImage = (data.kind === "image") || (file.type || "").startsWith("image/");
      const preview = isImage ? URL.createObjectURL(file) : undefined;
      setAttachments((prev) => [...prev, {
        id: data.id, storage_url: data.storage_url,
        mime_type: data.mime_type ?? file.type, name: file.name,
        preview, kind: isImage ? "image" : "document", bytes: file.size,
      }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "upload failed";
      toast({ title: "Upload failed", description: msg, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }, [toast]);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    for (const f of Array.from(files)) await uploadOne(f);
  }, [uploadOne]);

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (const it of Array.from(items)) {
      if (it.kind === "file") {
        const f = it.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      void handleFiles(files);
    }
  }, [handleFiles]);

  const removeAttachment = (id: number) => {
    setAttachments((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target?.preview) URL.revokeObjectURL(target.preview);
      return prev.filter((a) => a.id !== id);
    });
  };

  const handleSubmit = () => {
    const trimmed = input.trim();
    if ((!trimmed && attachments.length === 0) || isSending || uploading) return;

    const opts: ChatSendOpts = {};

    if (selectedInstances.length === 0) {
      // Auto mode — single, model from picker or auto
      opts.orchestration_mode = "single";
      if (selectedModel) opts.model = selectedModel;
    } else if (selectedInstances.length === 1) {
      // Single instance pinned
      const inst = instances.find((i) => i.id === selectedInstances[0]);
      opts.orchestration_mode = "single";
      opts.instances = selectedInstances;
      if (inst) opts.model = inst.model_id;
    } else {
      // Multi-lane fan-out — map vendors to provider IDs (dedup)
      const providerSet = new Set<string>();
      const selectedInst = instances.filter((i) => selectedInstances.includes(i.id));
      selectedInst.forEach((i) => {
        const pid = VENDOR_TO_PROVIDER[i.vendor];
        if (pid) providerSet.add(pid);
      });
      opts.orchestration_mode = "fan_out";
      opts.providers = Array.from(providerSet);
      opts.resolved_providers = Array.from(providerSet);
      opts.instances = selectedInstances;
    }

    onSend(trimmed, attachments.map((a) => a.id), opts);
    setInput("");
    setAttachments((prev) => {
      prev.forEach((a) => a.preview && URL.revokeObjectURL(a.preview));
      return [];
    });
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  useEffect(() => () => {
    attachments.forEach((a) => a.preview && URL.revokeObjectURL(a.preview));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`px-4 py-3 ${hideBorderTop ? "" : "border-t border-border"}`} data-testid="chat-input-area">

      {/* Instance lane selector */}
      {instances.length > 0 && (
        <div className="mb-2 flex items-center gap-1.5 flex-wrap text-[10px]">
          <span className="text-muted-foreground shrink-0">lanes:</span>
          <div className="flex items-center gap-1 flex-wrap overflow-x-auto">
            {instances.map((inst) => {
              const on = selectedInstances.includes(inst.id);
              const dot = VENDOR_COLORS[inst.vendor] ?? "bg-muted-foreground";
              return (
                <button
                  key={inst.id}
                  type="button"
                  onClick={() => toggleInstance(inst.id)}
                  aria-pressed={on}
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 transition-colors hover-elevate shrink-0 ${
                    on
                      ? "bg-primary/15 border-primary text-primary"
                      : "border-border text-muted-foreground"
                  }`}
                  title={inst.canonical_name}
                  data-testid={`chip-instance-${inst.id}`}
                >
                  {on && <Check className="h-2.5 w-2.5" />}
                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${dot}`} />
                  <span className="font-mono max-w-[120px] truncate">{inst.model_id}</span>
                  {inst.role_slot && <span className="opacity-60">({inst.role_slot})</span>}
                </button>
              );
            })}
            {selectedInstances.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedInstances([])}
                className="text-muted-foreground hover:text-foreground underline underline-offset-2"
                data-testid="btn-clear-instances"
              >
                clear
              </button>
            )}
          </div>
          {!hideModelPicker && selectedInstances.length === 0 && (
            <span className="ml-auto inline-flex items-center gap-1 text-muted-foreground shrink-0">
              model:
              <ModelPicker value={selectedModel} onChange={setSelectedModel} />
            </span>
          )}
          <button
            type="button"
            onClick={() => savePrefs.mutate()}
            disabled={savePrefs.isPending}
            className="ml-auto text-muted-foreground hover:text-primary underline underline-offset-2 shrink-0"
            data-testid="btn-save-orchestration-default"
          >
            {savePrefs.isPending ? "saving…" : "save as default"}
          </button>
        </div>
      )}

      {/* Model picker when no instances exist */}
      {instances.length === 0 && !hideModelPicker && (
        <div className="mb-2 flex items-center gap-2 text-[10px] text-muted-foreground">
          <span>model:</span>
          <ModelPicker value={selectedModel} onChange={setSelectedModel} />
          <button
            type="button"
            onClick={() => savePrefs.mutate()}
            disabled={savePrefs.isPending}
            className="ml-auto text-muted-foreground hover:text-primary underline underline-offset-2"
            data-testid="btn-save-orchestration-default"
          >
            {savePrefs.isPending ? "saving…" : "save as default"}
          </button>
        </div>
      )}

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2" data-testid="chat-attachments-tray">
          {attachments.map((a) => {
            const isImage = a.kind === "image" || !!a.preview;
            return (
              <div
                key={a.id}
                className={
                  isImage
                    ? "relative h-16 w-16 rounded-md overflow-hidden border border-border bg-muted"
                    : "relative flex items-center gap-2 pl-2 pr-7 py-1.5 rounded-md border border-border bg-muted max-w-[200px]"
                }
                data-testid={`chip-attachment-${a.id}`}
              >
                {isImage ? (
                  a.preview ? (
                    <img src={a.preview} alt={a.name ?? "attachment"} className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-[10px] text-muted-foreground">img</div>
                  )
                ) : (
                  <>
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="text-xs truncate" title={a.name}>{a.name ?? "file"}</span>
                  </>
                )}
                <button
                  type="button"
                  aria-label="Remove attachment"
                  onClick={() => removeAttachment(a.id)}
                  className={
                    isImage
                      ? "absolute top-0.5 right-0.5 rounded-full bg-background/80 p-0.5 text-foreground hover-elevate"
                      : "absolute top-1/2 -translate-y-1/2 right-1 rounded-full bg-background/80 p-0.5 text-foreground hover-elevate"
                  }
                  data-testid={`btn-remove-attachment-${a.id}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex gap-2 items-end">
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT_ATTR}
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void handleFiles(e.target.files);
            if (fileInputRef.current) fileInputRef.current.value = "";
          }}
          data-testid="input-file-attach"
        />
        <Button
          size="icon"
          variant="ghost"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || isSending}
          className="shrink-0"
          aria-label="Attach file"
          title="Attach image or document"
          data-testid="btn-attach"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
        </Button>
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder="Message a0... (Ctrl+Enter to send)"
          className="resize-none min-h-[40px] max-h-[120px] text-sm"
          rows={1}
          data-testid="chat-input"
        />
        <Button
          size="icon"
          onClick={handleSubmit}
          disabled={(!input.trim() && attachments.length === 0) || isSending || uploading}
          className="shrink-0 h-10 w-10"
          data-testid="btn-send"
        >
          {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
// N:M
// 364:7 0:3 0:6
