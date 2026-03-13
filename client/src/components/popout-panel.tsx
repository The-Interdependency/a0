import { useState } from "react";
import { X, ChevronDown, ChevronUp, Pin } from "lucide-react";
import { usePopout } from "@/lib/popout-context";
import { MarkdownContent } from "@/lib/markdown";
import { cn } from "@/lib/utils";

export default function PopoutPanel() {
  const { content, label, clearContent } = usePopout();
  const [minimized, setMinimized] = useState(false);

  if (!content) return null;

  return (
    <div
      className={cn(
        "fixed bottom-3 right-3 z-[300] w-[min(340px,calc(100vw-16px))]",
        "rounded-2xl border border-border bg-card shadow-2xl shadow-black/50",
        "flex flex-col overflow-hidden"
      )}
      style={{ maxHeight: minimized ? "auto" : "50vh" }}
      data-testid="popout-panel"
    >
      {/* Header — full-width tap zone to toggle minimize */}
      <div
        className="flex items-center gap-2 px-3 bg-primary/10 border-b border-border flex-shrink-0"
        style={{ minHeight: 44 }}
      >
        <Pin className="w-3.5 h-3.5 text-primary flex-shrink-0" />
        <button
          onClick={() => setMinimized((m) => !m)}
          className="flex-1 flex items-center gap-2 py-2 text-left"
          data-testid="popout-minimize"
        >
          <span className="text-xs font-semibold text-primary truncate">{label}</span>
          {minimized
            ? <ChevronUp className="w-3.5 h-3.5 text-primary/60 flex-shrink-0" />
            : <ChevronDown className="w-3.5 h-3.5 text-primary/60 flex-shrink-0" />
          }
        </button>
        {/* Close — 44×44 touch target */}
        <button
          onClick={clearContent}
          className="flex items-center justify-center w-11 h-11 -mr-2 text-muted-foreground active:text-destructive"
          data-testid="popout-close"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {!minimized && (
        <div className="overflow-y-auto flex-1 px-3 py-3">
          <div className="text-sm break-words min-w-0 [&_.markdown-content]:text-sm [&_.code-block]:bg-black/20 [&_.code-block]:rounded-md [&_.code-block]:p-2 [&_.code-block]:text-xs [&_.code-block]:overflow-x-auto [&_.code-block]:my-1 [&_.code-block]:font-mono [&_.inline-code]:bg-black/20 [&_.inline-code]:px-1 [&_.inline-code]:rounded [&_.inline-code]:text-xs [&_.inline-code]:font-mono [&_.md-h1]:text-base [&_.md-h1]:font-bold [&_.md-h2]:text-sm [&_.md-h2]:font-bold [&_.md-h3]:text-sm [&_.md-h3]:font-semibold [&_.md-ul]:pl-4 [&_.md-li]:list-disc leading-relaxed">
            <MarkdownContent content={content} />
          </div>
        </div>
      )}
    </div>
  );
}
