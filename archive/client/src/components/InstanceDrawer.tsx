// 363:2 0:2 0:10
// N:M
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Loader2, Trash2, Plus, Send, Archive, Save } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useBillingStatus } from "@/hooks/use-billing-status";

export interface ModelInstance {
  id: string;
  canonical_name: string;
  kind: string;
  vendor: string;
  model_id: string;
  swarm_context?: string | null;
  role_slot?: string | null;
  memory_count: number;
  open_task_count: number;
  created_at: string;
}

interface MemoryEntry { id: string; tier: string; content: string; created_at: string }
interface Task { id: string; title: string; status: string; created_at: string }
interface ChatMsg { id: string; role: string; content: string; created_at: string }

const VENDOR_COLORS: Record<string, string> = {
  google: "bg-green-500", openai: "bg-blue-500",
  anthropic: "bg-orange-500", xai: "bg-purple-400",
};
const KIND_LABELS: Record<string, string> = { zfae: "ZFAE", bare: "bare", remote: "remote" };

export function InstanceDrawer({
  instance, open, onClose,
}: { instance: ModelInstance | null; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { isAdmin } = useBillingStatus();
  const [tab, setTab] = useState<"chat" | "memory" | "tasks">("chat");
  const [chatInput, setChatInput] = useState("");
  const [memContent, setMemContent] = useState("");
  const [memTier, setMemTier] = useState("st");
  const [taskTitle, setTaskTitle] = useState("");
  const [swarmDraft, setSwarmDraft] = useState(instance?.swarm_context ?? "");

  useEffect(() => {
    setSwarmDraft(instance?.swarm_context ?? "");
  }, [instance?.id]);

  const iid = instance?.id ?? "";

  const chatQ = useQuery<ChatMsg[]>({
    queryKey: [`/api/v1/agents/instances/${iid}/chat`],
    enabled: !!iid && tab === "chat",
    refetchInterval: 5000,
  });

  const memQ = useQuery<MemoryEntry[]>({
    queryKey: [`/api/v1/agents/instances/${iid}/memory`],
    enabled: !!iid && tab === "memory",
  });

  const taskQ = useQuery<Task[]>({
    queryKey: [`/api/v1/agents/instances/${iid}/tasks`],
    enabled: !!iid && tab === "tasks",
  });

  const sendMsg = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/v1/agents/instances/${iid}/chat`,
        { role: "user", content: chatInput });
      return r.json();
    },
    onSuccess: () => {
      setChatInput("");
      qc.invalidateQueries({ queryKey: [`/api/v1/agents/instances/${iid}/chat`] });
    },
    onError: (e: Error) => toast({ title: "Send failed", description: e.message, variant: "destructive" }),
  });

  const archiveChat = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/v1/agents/instances/${iid}/chat/archive`, {});
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/v1/agents/instances/${iid}/chat`] });
      toast({ title: "Chat archived" });
    },
    onError: (e: Error) => toast({ title: "Archive failed", description: e.message, variant: "destructive" }),
  });

  const saveSwarm = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("PATCH", `/api/v1/agents/instances/${iid}`, {
        swarm_context: swarmDraft.trim() || null,
      });
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/v1/agents/instances"] });
      toast({ title: "Swarm context saved" });
    },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const addMem = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/v1/agents/instances/${iid}/memory`,
        { tier: memTier, content: memContent });
      return r.json();
    },
    onSuccess: () => {
      setMemContent("");
      qc.invalidateQueries({ queryKey: [`/api/v1/agents/instances/${iid}/memory`] });
      qc.invalidateQueries({ queryKey: ["/api/v1/agents/instances"] });
    },
    onError: (e: Error) => toast({ title: "Add failed", description: e.message, variant: "destructive" }),
  });

  const delMem = useMutation({
    mutationFn: async (eid: string) => {
      await apiRequest("DELETE", `/api/v1/agents/instances/${iid}/memory/${eid}`, {});
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [`/api/v1/agents/instances/${iid}/memory`] }),
    onError: (e: Error) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const addTask = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/v1/agents/instances/${iid}/tasks`,
        { title: taskTitle });
      return r.json();
    },
    onSuccess: () => {
      setTaskTitle("");
      qc.invalidateQueries({ queryKey: [`/api/v1/agents/instances/${iid}/tasks`] });
    },
    onError: (e: Error) => toast({ title: "Add failed", description: e.message, variant: "destructive" }),
  });

  const updateTask = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await apiRequest("PATCH", `/api/v1/agents/instances/${iid}/tasks/${id}`, { status });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [`/api/v1/agents/instances/${iid}/tasks`] }),
  });

  const delTask = useMutation({
    mutationFn: async (tid: string) => {
      await apiRequest("DELETE", `/api/v1/agents/instances/${iid}/tasks/${tid}`, {});
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [`/api/v1/agents/instances/${iid}/tasks`] }),
  });

  if (!instance) return null;

  const dot = VENDOR_COLORS[instance.vendor] ?? "bg-muted-foreground";
  const TABS = ["chat", "memory", "tasks"] as const;

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col p-0">
        <SheetHeader className="px-4 pt-4 pb-3 border-b border-border shrink-0">
          <SheetTitle className="flex items-center gap-2 text-sm">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${dot}`} />
            <span className="font-mono truncate max-w-xs" title={instance.canonical_name}>
              {instance.canonical_name}
            </span>
            <Badge variant="outline" className="text-[10px] shrink-0">{KIND_LABELS[instance.kind] ?? instance.kind}</Badge>
            {instance.role_slot && (
              <Badge variant="secondary" className="text-[10px] shrink-0">{instance.role_slot}</Badge>
            )}
          </SheetTitle>
          <p className="text-[11px] text-muted-foreground font-mono mt-0.5">{instance.model_id}</p>
        </SheetHeader>

        {/* Tab bar */}
        <div className="flex border-b border-border shrink-0">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-xs capitalize transition-colors ${
                tab === t
                  ? "border-b-2 border-primary text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid={`drawer-tab-${t}`}
            >
              {t}
              {t === "tasks" && instance.open_task_count > 0 && (
                <span className="ml-1 text-[9px] bg-primary/20 text-primary rounded-full px-1.5 py-0.5">
                  {instance.open_task_count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Chat tab */}
        {tab === "chat" && (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2" data-testid="instance-chat-messages">
              {chatQ.isLoading && <Loader2 className="h-4 w-4 animate-spin mx-auto mt-6 text-muted-foreground" />}
              {(chatQ.data ?? []).map((m) => (
                <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  }`}>
                    {m.content}
                  </div>
                </div>
              ))}
              {(chatQ.data ?? []).length === 0 && !chatQ.isLoading && (
                <p className="text-xs text-muted-foreground text-center mt-8">No messages yet.</p>
              )}
            </div>
            <div className="border-t border-border p-3 shrink-0 flex flex-col gap-2">
              <div className="flex gap-2">
                <Textarea
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Send a message to this instance…"
                  className="resize-none min-h-[40px] max-h-[100px] text-sm"
                  rows={1}
                  data-testid="instance-chat-input"
                />
                <Button
                  size="icon"
                  onClick={() => sendMsg.mutate()}
                  disabled={!chatInput.trim() || sendMsg.isPending}
                  data-testid="btn-instance-send"
                >
                  {sendMsg.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="self-end text-xs gap-1"
                onClick={() => archiveChat.mutate()}
                disabled={archiveChat.isPending}
                data-testid="btn-archive-chat"
              >
                {archiveChat.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Archive className="h-3 w-3" />}
                Archive conversation
              </Button>
            </div>
          </div>
        )}

        {/* Memory tab */}
        {tab === "memory" && (
          <div className="flex flex-col flex-1 overflow-hidden">

            {/* Swarm context editor */}
            <div className="px-3 pt-3 pb-2 border-b border-border shrink-0">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Swarm Context</span>
                {isAdmin && swarmDraft !== (instance.swarm_context ?? "") && (
                  <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1 px-2"
                    onClick={() => saveSwarm.mutate()} disabled={saveSwarm.isPending}
                    data-testid="btn-save-swarm">
                    {saveSwarm.isPending ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Save className="h-2.5 w-2.5" />}
                    Save
                  </Button>
                )}
              </div>
              <Textarea
                value={swarmDraft}
                onChange={(e) => setSwarmDraft(e.target.value)}
                placeholder={isAdmin
                  ? "Role description, standing instructions… Clear to stop injection."
                  : "No swarm context set."}
                readOnly={!isAdmin}
                className="text-xs font-mono resize-none min-h-[72px]"
                data-testid="textarea-swarm-context"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Injected first on every call. Clear + save to disable.
              </p>
            </div>

            <Separator />

            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2" data-testid="instance-memory-list">
              {memQ.isLoading && <Loader2 className="h-4 w-4 animate-spin mx-auto mt-6 text-muted-foreground" />}
              {(memQ.data ?? []).map((m) => (
                <div key={m.id} className="flex items-start gap-2 p-2 rounded border border-border text-xs">
                  <Badge variant={m.tier === "lt" ? "default" : "secondary"} className="text-[9px] shrink-0 mt-0.5">{m.tier.toUpperCase()}</Badge>
                  <span className="flex-1 break-words">{m.content}</span>
                  {isAdmin && (
                    <Button size="icon" variant="ghost" className="h-5 w-5 shrink-0"
                      onClick={() => delMem.mutate(m.id)} data-testid={`btn-del-mem-${m.id}`}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  )}
                </div>
              ))}
              {(memQ.data ?? []).length === 0 && !memQ.isLoading && (
                <p className="text-xs text-muted-foreground text-center mt-8">No memory entries.</p>
              )}
            </div>
            {isAdmin && (
              <div className="border-t border-border p-3 shrink-0 flex flex-col gap-2">
                <div className="flex gap-1.5">
                  {["st", "lt"].map((t) => (
                    <button key={t} type="button" onClick={() => setMemTier(t)}
                      className={`text-[10px] px-2 py-0.5 rounded border transition-colors uppercase ${
                        memTier === t ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"
                      }`}
                    >{t}</button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input value={memContent} onChange={(e) => setMemContent(e.target.value)}
                    placeholder="Memory content…" className="text-xs h-8" data-testid="input-mem-content" />
                  <Button size="sm" onClick={() => addMem.mutate()}
                    disabled={!memContent.trim() || addMem.isPending} className="shrink-0 gap-1" data-testid="btn-add-mem">
                    {addMem.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tasks tab */}
        {tab === "tasks" && (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-3" data-testid="instance-tasks-board">
              {taskQ.isLoading && <Loader2 className="h-4 w-4 animate-spin mx-auto mt-6 text-muted-foreground" />}
              <div className="grid grid-cols-2 gap-3">
                {(["open", "done"] as const).map((col) => (
                  <div key={col}>
                    <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">{col}</p>
                    <div className="flex flex-col gap-1.5">
                      {(taskQ.data ?? []).filter((t) => t.status === col).map((t) => (
                        <div key={t.id}
                          className="p-2 rounded border border-border text-xs flex items-start gap-1.5 bg-card/40"
                          data-testid={`task-${t.id}`}
                        >
                          <span className="flex-1 break-words">{t.title}</span>
                          <div className="flex flex-col gap-0.5 shrink-0">
                            <Button size="icon" variant="ghost" className="h-4 w-4"
                              onClick={() => updateTask.mutate({ id: t.id, status: col === "open" ? "done" : "open" })}
                              title={col === "open" ? "Mark done" : "Reopen"}
                              data-testid={`btn-task-toggle-${t.id}`}
                            >
                              <span className="text-[8px]">{col === "open" ? "✓" : "↩"}</span>
                            </Button>
                            <Button size="icon" variant="ghost" className="h-4 w-4"
                              onClick={() => delTask.mutate(t.id)} data-testid={`btn-task-del-${t.id}`}>
                              <Trash2 className="h-2.5 w-2.5 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      ))}
                      {(taskQ.data ?? []).filter((t) => t.status === col).length === 0 && !taskQ.isLoading && (
                        <p className="text-[10px] text-muted-foreground/60 italic">empty</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="border-t border-border p-3 shrink-0 flex gap-2">
              <Input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)}
                placeholder="New task…" className="text-xs h-8"
                onKeyDown={(e) => { if (e.key === "Enter" && taskTitle.trim()) addTask.mutate(); }}
                data-testid="input-task-title" />
              <Button size="sm" onClick={() => addTask.mutate()}
                disabled={!taskTitle.trim() || addTask.isPending} className="shrink-0 gap-1" data-testid="btn-add-task">
                {addTask.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
// N:M
// 363:2 0:2 0:10
