import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Edit3, Plus, Save, Trash2 } from "lucide-react";

type Draft = { id: string; title: string; content: string; updatedAt?: string };

const DRAFTS_KEY = "research_drafts";

export function DraftsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const { data: toggle, isLoading } = useQuery<{ parameters?: { drafts?: Draft[] } } | null>({
    queryKey: [`/api/v1/system/toggle/${DRAFTS_KEY}`],
    staleTime: 10000,
  });

  const drafts: Draft[] = (toggle as any)?.parameters?.drafts || (toggle as any)?.drafts || [];

  const saveMutation = useMutation({
    mutationFn: (updated: Draft[]) =>
      apiRequest("POST", "/api/v1/system/toggles", {
        name: DRAFTS_KEY,
        enabled: true,
        parameters: { drafts: updated },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/v1/system/toggle/${DRAFTS_KEY}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/system/toggles"] });
      toast({ title: "Draft saved" });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  function createDraft() {
    if (!newTitle.trim()) { toast({ title: "Title required", variant: "destructive" }); return; }
    const newDraft: Draft = { id: `draft-${Date.now()}`, title: newTitle.trim(), content: "", updatedAt: new Date().toISOString() };
    const updated = [...drafts, newDraft];
    saveMutation.mutate(updated);
    setNewTitle("");
    setShowNew(false);
    setActiveId(newDraft.id);
    setEditTitle(newDraft.title);
    setEditContent("");
  }

  function openDraft(d: Draft) {
    setActiveId(d.id);
    setEditTitle(d.title);
    setEditContent(d.content);
  }

  function saveDraft() {
    if (!activeId) return;
    const updated = drafts.map(d =>
      d.id === activeId
        ? { ...d, title: editTitle, content: editContent, updatedAt: new Date().toISOString() }
        : d
    );
    saveMutation.mutate(updated);
  }

  function deleteDraft(id: string) {
    const updated = drafts.filter(d => d.id !== id);
    saveMutation.mutate(updated);
    if (activeId === id) { setActiveId(null); setEditTitle(""); setEditContent(""); }
  }

  const active = drafts.find(d => d.id === activeId);

  return (
    <div className="h-full w-full overflow-hidden flex flex-col">
      <div className="flex items-center gap-2 px-3 py-3 flex-shrink-0 border-b border-border">
        <Edit3 className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold" data-testid="text-drafts-title">Research Drafts</h3>
        <Badge variant="outline" className="text-xs ml-auto">{drafts.length}</Badge>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => setShowNew(!showNew)}
          data-testid="button-new-draft"
        >
          <Plus className="w-3 h-3 mr-1" />New
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden min-h-0">
        <div className="w-36 flex-shrink-0 border-r border-border overflow-y-auto">
          {showNew && (
            <div className="p-2 space-y-1 border-b border-border">
              <Input
                className="h-6 text-xs"
                placeholder="Draft title"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                data-testid="input-draft-title"
              />
              <div className="flex gap-1">
                <Button size="sm" className="h-6 text-xs flex-1" onClick={createDraft} disabled={saveMutation.isPending} data-testid="button-create-draft">Create</Button>
                <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setShowNew(false)}>✕</Button>
              </div>
            </div>
          )}
          {isLoading && <div className="p-2 space-y-1">{[1,2].map(i => <Skeleton key={i} className="h-8" />)}</div>}
          {!isLoading && drafts.length === 0 && !showNew && (
            <p className="text-xs text-muted-foreground p-3">No drafts yet.</p>
          )}
          {drafts.map(d => (
            <div
              key={d.id}
              className={`flex items-center gap-1 px-2 py-2 cursor-pointer border-b border-border/50 group ${activeId === d.id ? "bg-accent" : "hover:bg-accent/50"}`}
              onClick={() => openDraft(d)}
              data-testid={`draft-item-${d.id}`}
            >
              <span className="text-xs truncate flex-1">{d.title}</span>
              <button
                onClick={e => { e.stopPropagation(); deleteDraft(d.id); }}
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                data-testid={`button-delete-draft-${d.id}`}
              >
                <Trash2 className="w-3 h-3 text-muted-foreground hover:text-destructive" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-hidden flex flex-col min-w-0">
          {activeId ? (
            <>
              <div className="flex items-center gap-2 px-3 py-2 border-b border-border flex-shrink-0">
                <Input
                  className="h-7 text-xs font-medium flex-1"
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  data-testid="input-edit-draft-title"
                />
                <Button
                  size="sm"
                  className="h-7 text-xs flex-shrink-0"
                  onClick={saveDraft}
                  disabled={saveMutation.isPending}
                  data-testid="button-save-draft"
                >
                  <Save className="w-3.5 h-3.5 mr-1" />Save
                </Button>
              </div>
              <Textarea
                className="flex-1 resize-none rounded-none border-0 text-sm font-mono focus-visible:ring-0 focus-visible:ring-offset-0"
                placeholder="Write your research draft in markdown…"
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
                data-testid="textarea-draft-content"
              />
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <p className="text-xs">Select a draft or create a new one</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
