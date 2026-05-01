// 409:32
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
  preview?: string;       // object URL for image previews; absent for documents
  kind?: "image" | "document";
  bytes?: number;
}

const MAX_BYTES = 25 * 1024 * 1024;
// Keep in sync with server/attachments.ts. Browsers honor the union of MIME
// types and extensions, so we cover both for code/text files which often
// arrive with empty or octet-stream mime types.
const ACCEPT_ATTR = [
  "image/*",
  "application/pdf",
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
  cut_mode?: string;
  // Resolved providers list as displayed in the picker — surfaced so the
  // page can render placeholder LiveOrchProgress cards before the server
  // emits orchestration_start (which only fires once the chat handler
  // reaches the multi-model branch).
  resolved_providers?: string[];
  // Per-message model id chosen in the composer's single-mode picker. When
  // present the backend pins this turn to that model; when absent the
  // backend falls back through agent_model > active_provider > conv.model.
  model?: string;
}

const MODES = [
  { id: "single", label: "single", multi: false },
  { id: "fan_out", label: "fan-out", multi: true },
  { id: "council", label: "council", multi: true },
  { id: "daisy_chain", label: "daisy chain", multi: true },
] as const;

interface AvailEntry { id: string; label: string; available: boolean; active: boolean; enabled?: boolean; disabled_models?: string[] }
interface PrefsRes { orchestration_mode?: string; cut_mode?: string; providers?: string[] }

export function ChatInput({
  onSend,
  isSending,
  hideModelPicker = false,
}: {
  onSend: (content: string, attachmentIds: number[], opts?: ChatSendOpts) => void;
  isSending: boolean;
  // Forge surfaces wire ChatInput but discard `opts` — surfacing a picker
  // there would mislead the user (the chosen model would silently do
  // nothing). Forge agents also carry their own configured model_id, so a
  // per-message override would conflict with that design. Pass true to
  // hide the picker on those surfaces.
  hideModelPicker?: boolean;
}) {
  const { toast } = useToast();
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<string>("single");
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);
  const [showOrch, setShowOrch] = useState(false);
  // Per-message model override (single mode only). null = "auto" — let the
  // backend resolve via agent model > active_provider > conv.model.
  const [selectedModel, setSelectedModel] = useState<string | null>(null);

  const { data: availability = [] } = useQuery<AvailEntry[]>({
    queryKey: ["/api/v1/agents/energy-providers"],
    refetchInterval: 60_000,
  });

  const { data: prefs } = useQuery<PrefsRes>({
    queryKey: ["/api/v1/users/me/preferences"],
  });

  useEffect(() => {
    if (!prefs) return;
    if (prefs.orchestration_mode) setMode(prefs.orchestration_mode);
    if (Array.isArray(prefs.providers) && prefs.providers.length) {
      setSelectedProviders(prefs.providers);
    }
  }, [prefs]);

  const savePrefs = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { orchestration_mode: mode };
      if (selectedProviders.length) body.extras = { providers: selectedProviders };
      const r = await apiRequest("PATCH", "/api/v1/users/me/preferences", body);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/users/me/preferences"] });
      toast({ title: "Saved as default" });
    },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const currentMode = MODES.find((m) => m.id === mode) ?? MODES[0];
  // Hide providers that the user has switched OFF in the energy settings —
  // the server will 400 them anyway, so don't dangle them in the chip row.
  const availableProviders = availability.filter(
    (a) => a.available && a.enabled !== false,
  );

  // Reconcile selectedProviders when availability changes. If a provider is
  // disabled in Energy settings, drop it from the selection so we don't ship
  // it in the request body and earn a 400.
  useEffect(() => {
    if (!availability.length) return;
    const allowed = new Set(availableProviders.map((a) => a.id));
    setSelectedProviders((prev) => {
      const next = prev.filter((id) => allowed.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [availability, availableProviders]);

  const toggleProvider = (pid: string) => {
    setSelectedProviders((prev) =>
      prev.includes(pid) ? prev.filter((p) => p !== pid) : [...prev, pid]
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
    const opts: ChatSendOpts = { orchestration_mode: mode };
    if (currentMode.multi && selectedProviders.length > 0) {
      opts.providers = selectedProviders;
      opts.resolved_providers = selectedProviders;
    } else if (currentMode.multi && availableProviders.length > 0) {
      // Default fan-out: server resolves to all available providers when
      // body.providers is absent. Mirror that here so the live placeholder
      // cards match what the server is about to call.
      opts.resolved_providers = availableProviders.map((a) => a.id);
    }
    // Single-mode model override is meaningless in fan-out / council /
    // daisy-chain (those route to multiple providers) — only attach it
    // when we're in single mode and the user picked something other than
    // auto.
    if (!currentMode.multi && selectedModel) {
      opts.model = selectedModel;
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

  const activeProviderId =
    availability.find((a) => a.active)?.id || availableProviders[0]?.id;

  return (
    <div className="px-4 py-3 border-t border-border" data-testid="chat-input-area">
      <div className="mb-2 flex flex-col gap-1.5">
        <div
          role="tablist"
          aria-label="Orchestration mode"
          className="flex items-center gap-0.5 rounded-md border border-border bg-muted/40 p-0.5 text-[10px] uppercase tracking-wider w-fit"
          data-testid="tabs-orchestration-mode"
        >
          {MODES.map((m) => {
            const selected = m.id === mode;
            return (
              <button
                key={m.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setMode(m.id)}
                className={
                  "px-2 py-0.5 rounded-sm transition-colors hover-elevate " +
                  (selected
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground")
                }
                data-testid={`tab-mode-${m.id}`}
              >
                {m.label}
                {m.multi && selected && selectedProviders.length > 0 && (
                  <span className="ml-1 text-primary normal-case">
                    ×{selectedProviders.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 flex-wrap text-[10px]">
          {currentMode.multi ? (
            <>
              <span className="text-muted-foreground">providers:</span>
              {availableProviders.length === 0 && (
                <span className="text-muted-foreground italic">
                  none available
                </span>
              )}
              {availableProviders.map((p) => {
                const on = selectedProviders.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggleProvider(p.id)}
                    aria-pressed={on}
                    className={
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 hover-elevate " +
                      (on
                        ? "bg-primary/15 border-primary text-primary"
                        : "border-border text-muted-foreground")
                    }
                    data-testid={`chip-provider-${p.id}`}
                    title={on ? `Click to exclude ${p.id}` : `Click to include ${p.id}`}
                  >
                    {on && <Check className="h-2.5 w-2.5" />}
                    {p.id}
                  </button>
                );
              })}
              {availableProviders.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setSelectedProviders(
                      selectedProviders.length === availableProviders.length
                        ? []
                        : availableProviders.map((a) => a.id),
                    )
                  }
                  className="text-muted-foreground hover:text-foreground underline underline-offset-2"
                  data-testid="btn-toggle-all-providers"
                >
                  {selectedProviders.length === availableProviders.length
                    ? "none"
                    : "all"}
                </button>
              )}
            </>
          ) : hideModelPicker ? (
            <span className="text-muted-foreground">
              provider:{" "}
              <span className="text-foreground">{activeProviderId ?? "—"}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              model:
              <ModelPicker value={selectedModel} onChange={setSelectedModel} />
              {!selectedModel && activeProviderId && (
                <span
                  className="text-foreground/70"
                  data-testid="text-default-provider"
                  title="Default provider when picker is set to auto"
                >
                  → {activeProviderId}
                </span>
              )}
            </span>
          )}
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
      </div>
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
// 409:32
