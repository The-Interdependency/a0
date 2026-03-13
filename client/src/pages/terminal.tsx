import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Terminal as TermIcon, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CommandHistory } from "@shared/schema";

export default function TerminalPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [input, setInput] = useState("");
  const [histIndex, setHistIndex] = useState(-1);
  const [localHistory, setLocalHistory] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: history = [] } = useQuery<CommandHistory[]>({
    queryKey: ["/api/terminal/history"],
    refetchInterval: false,
  });

  const execCmd = useMutation({
    mutationFn: (command: string) =>
      apiRequest("POST", "/api/terminal/exec", { command }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/terminal/history"] });
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const clearHistory = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/terminal/history"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/terminal/history"] }),
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || execCmd.isPending) return;
    const cmd = input.trim();
    setLocalHistory((prev) => [cmd, ...prev]);
    setHistIndex(-1);
    setInput("");
    execCmd.mutate(cmd);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = histIndex + 1;
      if (next < localHistory.length) {
        setHistIndex(next);
        setInput(localHistory[next]);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = histIndex - 1;
      if (next < 0) {
        setHistIndex(-1);
        setInput("");
      } else {
        setHistIndex(next);
        setInput(localHistory[next]);
      }
    }
  }

  const sortedHistory = [...history].reverse();

  return (
    <div className="flex flex-col h-full bg-background font-mono">
      {/* Header */}
      <header className="flex items-center justify-between px-3 py-2 border-b border-border bg-card flex-shrink-0">
        <div className="flex items-center gap-2">
          <TermIcon className="w-4 h-4 text-emerald-400" />
          <span className="font-semibold text-sm">Terminal</span>
          <span className="text-xs text-muted-foreground">/ Termux</span>
        </div>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => clearHistory.mutate()}
          data-testid="button-clear-terminal"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </header>

      {/* Output */}
      <ScrollArea className="flex-1 px-3 py-2">
        {sortedHistory.length === 0 && !execCmd.isPending && (
          <div className="py-8 text-center text-muted-foreground">
            <TermIcon className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-xs">No commands yet. Type below to begin.</p>
            <div className="mt-3 flex flex-wrap gap-1 justify-center">
              {["ls -la", "pwd", "env | grep PATH", "df -h", "ps aux | head -10"].map((s) => (
                <button
                  key={s}
                  onClick={() => setInput(s)}
                  className="px-2 py-1 text-xs rounded border border-border hover-elevate"
                  data-testid={`suggestion-${s.replace(/\s+/g, "-")}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="space-y-2 pb-2">
          {sortedHistory.map((entry) => (
            <div key={entry.id} data-testid={`cmd-entry-${entry.id}`}>
              <div className="flex items-center gap-1 text-xs text-emerald-400">
                <ChevronRight className="w-3 h-3" />
                <span>{entry.command}</span>
              </div>
              {entry.output && (
                <pre
                  className={cn(
                    "text-xs mt-0.5 whitespace-pre-wrap break-all pl-4 leading-relaxed",
                    entry.exitCode !== 0 ? "text-red-400" : "text-muted-foreground"
                  )}
                >
                  {entry.output}
                </pre>
              )}
            </div>
          ))}
          {execCmd.isPending && (
            <div className="flex items-center gap-1 text-xs text-yellow-400">
              <span className="animate-pulse">Running...</span>
            </div>
          )}
        </div>
        <div ref={bottomRef} />
      </ScrollArea>

      {/* Input */}
      <div className="border-t border-border bg-card flex-shrink-0">
        <form onSubmit={handleSubmit} className="flex items-center gap-2 px-3 py-2">
          <span className="text-emerald-400 text-sm flex-shrink-0">$</span>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter command..."
            className="flex-1 bg-transparent text-sm outline-none font-mono text-foreground placeholder:text-muted-foreground"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            disabled={execCmd.isPending}
            data-testid="input-terminal"
          />
          <Button
            type="submit"
            size="icon"
            variant="ghost"
            disabled={!input.trim() || execCmd.isPending}
            data-testid="button-run-command"
          >
            <ChevronRight className="w-4 h-4 text-emerald-400" />
          </Button>
        </form>
      </div>
    </div>
  );
}
