import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { MarkdownContent } from "@/lib/markdown";
import {
  Zap, Plus, Play, Trash2, FileCode, CheckCircle,
  Clock, AlertCircle, Loader, ChevronDown, ChevronUp,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { AutomationTask } from "@shared/schema";

const STATUS_CONFIG = {
  pending: { label: "Pending", icon: Clock, color: "text-yellow-400" },
  running: { label: "Running", icon: Loader, color: "text-blue-400" },
  completed: { label: "Done", icon: CheckCircle, color: "text-green-400" },
  failed: { label: "Failed", icon: AlertCircle, color: "text-red-400" },
};

export default function AutomationPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [specContent, setSpecContent] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [streamMap, setStreamMap] = useState<Record<number, string>>({});
  const [runningIds, setRunningIds] = useState<Set<number>>(new Set());

  const { data: tasks = [], isLoading } = useQuery<AutomationTask[]>({
    queryKey: ["/api/automation"],
  });

  const createTask = useMutation({
    mutationFn: () => apiRequest("POST", "/api/automation", { name, specContent }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/automation"] });
      setCreateOpen(false);
      setName("");
      setSpecContent("");
      toast({ title: "Task created" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteTask = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/automation/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/automation"] }),
  });

  async function runTask(id: number) {
    if (runningIds.has(id)) return;
    setRunningIds((s) => new Set([...s, id]));
    setStreamMap((m) => ({ ...m, [id]: "" }));
    setExpandedId(id);

    try {
      const res = await fetch(`/api/automation/${id}/run`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to run task");

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.content) {
                setStreamMap((m) => ({ ...m, [id]: (m[id] || "") + data.content }));
              }
              if (data.done || data.error) {
                setRunningIds((s) => { const ns = new Set(s); ns.delete(id); return ns; });
                qc.invalidateQueries({ queryKey: ["/api/automation"] });
              }
            } catch {}
          }
        }
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
      setRunningIds((s) => { const ns = new Set(s); ns.delete(id); return ns; });
    }
  }

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card flex-shrink-0">
        <Zap className="w-4 h-4 text-yellow-400 flex-shrink-0" />
        <span className="font-semibold text-sm flex-1">Automation</span>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => setCreateOpen(true)}
          data-testid="button-new-task"
        >
          <Plus className="w-4 h-4" />
        </Button>
      </header>

      <ScrollArea className="flex-1 px-2 py-1">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full mb-2 rounded-md" />
          ))
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-center px-4">
            <div className="w-12 h-12 rounded-full bg-yellow-400/10 flex items-center justify-center">
              <Zap className="w-6 h-6 text-yellow-400" />
            </div>
            <div>
              <p className="font-medium text-sm">No automation tasks</p>
              <p className="text-xs text-muted-foreground mt-1">
                Create a task by pasting a spec.md to automate cloud structure implementation.
              </p>
            </div>
            <Button onClick={() => setCreateOpen(true)} data-testid="button-create-first-task">
              <Plus className="w-3.5 h-3.5 mr-1" />
              New Task
            </Button>
          </div>
        ) : (
          <div className="space-y-2 pb-2">
            {tasks.map((task) => {
              const cfg = STATUS_CONFIG[task.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.pending;
              const isRunning = runningIds.has(task.id);
              const expanded = expandedId === task.id;
              const liveContent = streamMap[task.id];
              const resultContent = liveContent || task.result;

              return (
                <div
                  key={task.id}
                  className="rounded-md border border-border bg-card overflow-hidden"
                  data-testid={`task-${task.id}`}
                >
                  <div className="flex items-center gap-2 px-3 py-2">
                    <FileCode className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{task.name}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <cfg.icon
                          className={cn("w-3 h-3", cfg.color, isRunning && "animate-spin")}
                        />
                        <span className={cn("text-[10px]", cfg.color)}>{cfg.label}</span>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {(task.status === "pending" || task.status === "failed") && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => runTask(task.id)}
                          disabled={isRunning}
                          data-testid={`button-run-${task.id}`}
                        >
                          <Play className="w-3.5 h-3.5 text-green-400" />
                        </Button>
                      )}
                      {resultContent && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setExpandedId(expanded ? null : task.id)}
                          data-testid={`button-expand-${task.id}`}
                        >
                          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteTask.mutate(task.id)}
                        data-testid={`button-delete-task-${task.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>

                  {expanded && resultContent && (
                    <div className="border-t border-border px-3 py-2 bg-background">
                      <div className="text-xs [&_.markdown-content]:text-xs [&_.code-block]:bg-card [&_.code-block]:rounded-md [&_.code-block]:p-2 [&_.code-block]:text-xs [&_.code-block]:overflow-x-auto [&_.code-block]:my-1 [&_.code-block]:font-mono [&_.inline-code]:bg-card [&_.inline-code]:px-1 [&_.inline-code]:rounded [&_.inline-code]:font-mono">
                        <MarkdownContent content={resultContent} />
                        {isRunning && (
                          <span className="inline-block w-0.5 h-3 bg-current ml-0.5 animate-pulse" />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="w-[95vw] max-w-md max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-yellow-400" />
              New Automation Task
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 flex-1 overflow-auto">
            <Input
              placeholder="Task name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="input-task-name"
            />
            <Textarea
              placeholder="Paste your spec.md content here..."
              value={specContent}
              onChange={(e) => setSpecContent(e.target.value)}
              className="min-h-[200px] font-mono text-xs resize-none"
              data-testid="textarea-spec-content"
            />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createTask.mutate()}
              disabled={!name || !specContent || createTask.isPending}
              data-testid="button-create-task"
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
