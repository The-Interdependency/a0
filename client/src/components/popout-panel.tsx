import { useState } from "react";
import { X, Minus, Pin } from "lucide-react";
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
        "fixed bottom-4 right-3 z-[300] w-[min(320px,calc(100vw-24px))]",
        "rounded-xl border border-border bg-card shadow-2xl shadow-black/40",
        "flex flex-col overflow-hidden transition-all duration-200"
      )}
      style={{ maxHeight: minimized ? "auto" : "52vh" }}
      data-testid="popout-panel"
    >
      <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 border-b border-border flex-shrink-0 select-none">
        <Pin className="w-3.5 h-3.5 text-primary flex-shrink-0" />
        <span className="text-xs font-semibold text-primary flex-1 truncate">{label}</span>
        <button
          onClick={() => setMinimized((m) => !m)}
          className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
          data-testid="popout-minimize"
          title={minimized ? "Expand" : "Minimize"}
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={clearContent}
          className="text-muted-foreground hover:text-destructive transition-colors p-0.5"
          data-testid="popout-close"
          title="Close"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {!minimized && (
        <div className="overflow-y-auto flex-1 px-3 py-2">
          <div className="text-sm break-words min-w-0 [&_.markdown-content]:text-sm [&_.code-block]:bg-black/20 [&_.code-block]:rounded-md [&_.code-block]:p-2 [&_.code-block]:text-xs [&_.code-block]:overflow-x-auto [&_.code-block]:my-1 [&_.code-block]:font-mono [&_.inline-code]:bg-black/20 [&_.inline-code]:px-1 [&_.inline-code]:rounded [&_.inline-code]:text-xs [&_.inline-code]:font-mono [&_.md-h1]:text-base [&_.md-h1]:font-bold [&_.md-h2]:text-sm [&_.md-h2]:font-bold [&_.md-h3]:text-sm [&_.md-h3]:font-semibold [&_.md-ul]:pl-4 [&_.md-li]:list-disc">
            <MarkdownContent content={content} />
          </div>
        </div>
      )}
    </div>
  );
}
