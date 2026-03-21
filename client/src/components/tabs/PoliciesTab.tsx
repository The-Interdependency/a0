import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { ChevronDown, ChevronRight, Edit2, Plus, ScrollText, Trash2 } from "lucide-react";

type Toggle = { id: number; name: string; enabled: boolean; parameters?: any; updatedAt?: string };

export function PoliciesTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editParams, setEditParams] = useState("");
  const [newName, setNewName] = useState("");
  const [showNew, setShowNew] = useState(false);

  const { data: toggles = [], isLoading } = useQuery<Toggle[]>({
    queryKey: ["/api/v1/system/toggles"],
    staleTime: 10000,
  });

  const updateMutation = useMutation({
    mutationFn: ({ name, enabled, parameters }: { name: string; enabled?: boolean; parameters?: any }) =>
      apiRequest("POST", "/api/v1/system/toggles", { name, enabled, parameters }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/system/toggles"] });
      toast({ title: "Policy updated" });
      setEditingId(null);
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (name: string) => apiRequest("DELETE", `/api/v1/system/toggles/${name}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/system/toggles"] });
      toast({ title: "Policy deleted" });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const filtered = toggles.filter(t =>
    !search || t.name.toLowerCase().includes(search.toLowerCase())
  );

  function startEdit(t: Toggle) {
    setEditingId(t.id);
    setEditParams(t.parameters ? JSON.stringify(t.parameters, null, 2) : "{}");
  }

  function saveEdit(t: Toggle) {
    let params: any;
    try { params = JSON.parse(editParams); } catch { toast({ title: "Invalid JSON", variant: "destructive" }); return; }
    updateMutation.mutate({ name: t.name, parameters: params });
  }

  function toggleEnabled(t: Toggle) {
    updateMutation.mutate({ name: t.name, enabled: !t.enabled });
  }

  function createNew() {
    if (!newName.trim()) { toast({ title: "Name required", variant: "destructive" }); return; }
    updateMutation.mutate({ name: newName.trim(), enabled: true, parameters: {} });
    setNewName("");
    setShowNew(false);
  }

  return (
    <div className="h-full w-full overflow-y-auto overflow-x-hidden px-3 py-3 space-y-3">
      <div className="flex items-center gap-2">
        <ScrollText className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold" data-testid="text-policies-title">System Policies</h3>
        <Badge variant="outline" className="text-xs ml-auto">{toggles.length} total</Badge>
      </div>

      <div className="flex gap-2">
        <Input
          className="h-7 text-xs flex-1"
          placeholder="Search toggles…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          data-testid="input-policies-search"
        />
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => setShowNew(!showNew)}
          data-testid="button-policies-new"
        >
          <Plus className="w-3 h-3 mr-1" />New
        </Button>
      </div>

      {showNew && (
        <div className="rounded-lg border border-border bg-card p-3 space-y-2">
          <Input
            className="h-7 text-xs"
            placeholder="Toggle name (e.g. my_feature)"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            data-testid="input-new-toggle-name"
          />
          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-xs" onClick={createNew} disabled={updateMutation.isPending} data-testid="button-create-toggle">Create</Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowNew(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {isLoading && <div className="space-y-2">{[1,2,3,4].map(i => <Skeleton key={i} className="h-12" />)}</div>}

      {!isLoading && filtered.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-8">No toggles found.</p>
      )}

      <div className="space-y-1">
        {filtered.map(t => (
          <div key={t.id} className="rounded-lg border border-border bg-card" data-testid={`policy-${t.name}`}>
            <div
              className="flex items-center gap-2 p-2 cursor-pointer"
              onClick={() => setExpanded(prev => prev === t.id ? null : t.id)}
            >
              {expanded === t.id
                ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              }
              <span className="text-xs font-mono flex-1 truncate">{t.name}</span>
              <Switch
                checked={t.enabled}
                onCheckedChange={() => toggleEnabled(t)}
                onClick={e => e.stopPropagation()}
                data-testid={`switch-policy-${t.name}`}
              />
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 flex-shrink-0 text-muted-foreground hover:text-red-500"
                onClick={e => { e.stopPropagation(); deleteMutation.mutate(t.name); }}
                disabled={deleteMutation.isPending}
                data-testid={`button-delete-policy-${t.name}`}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
            {expanded === t.id && (
              <div className="border-t border-border p-3 space-y-2">
                {editingId === t.id ? (
                  <>
                    <Textarea
                      className="text-xs font-mono min-h-[120px]"
                      value={editParams}
                      onChange={e => setEditParams(e.target.value)}
                      data-testid={`textarea-policy-${t.name}`}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" className="h-7 text-xs" onClick={() => saveEdit(t)} disabled={updateMutation.isPending}>Save</Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingId(null)}>Cancel</Button>
                    </div>
                  </>
                ) : (
                  <>
                    <pre className="text-xs font-mono bg-muted/30 rounded p-2 overflow-x-auto max-h-40 text-muted-foreground">
                      {JSON.stringify(t.parameters ?? {}, null, 2)}
                    </pre>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => startEdit(t)}
                      data-testid={`button-edit-policy-${t.name}`}
                    >
                      <Edit2 className="w-3 h-3 mr-1" />Edit Parameters
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
