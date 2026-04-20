// 190:1
import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send, Paperclip, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export interface PendingAttachment {
  id: number;
  storage_url: string;
  mime_type: string;
  name?: string;
  preview?: string;
}

export function ChatInput({
  onSend,
  isSending,
}: {
  onSend: (content: string, attachmentIds: number[]) => void;
  isSending: boolean;
}) {
  const { toast } = useToast();
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadOne = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Unsupported file", description: file.type || "unknown", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 10 MB", variant: "destructive" });
      return;
    }
    const fd = new FormData();
    fd.append("file", file);
    setUploading(true);
    try {
      const res = await fetch("/api/v1/attachments", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) {
        const msg = await res.text().catch(() => "upload failed");
        throw new Error(msg);
      }
      const data = await res.json();
      const preview = URL.createObjectURL(file);
      setAttachments((prev) => [...prev, {
        id: data.id,
        storage_url: data.storage_url,
        mime_type: data.mime_type ?? file.type,
        name: file.name,
        preview,
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
    onSend(trimmed, attachments.map((a) => a.id));
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
    <div className="px-4 py-3 border-t border-border" data-testid="chat-input-area">
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2" data-testid="chat-attachments-tray">
          {attachments.map((a) => (
            <div
              key={a.id}
              className="relative h-16 w-16 rounded-md overflow-hidden border border-border bg-muted"
              data-testid={`chip-attachment-${a.id}`}
            >
              {a.preview ? (
                <img src={a.preview} alt={a.name ?? "attachment"} className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-[10px] text-muted-foreground">img</div>
              )}
              <button
                type="button"
                aria-label="Remove attachment"
                onClick={() => removeAttachment(a.id)}
                className="absolute top-0.5 right-0.5 rounded-full bg-background/80 p-0.5 text-foreground hover-elevate"
                data-testid={`btn-remove-attachment-${a.id}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2 items-end">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
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
          aria-label="Attach image"
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
// 190:1
