import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { ShoppingBag, Plus, Check, X, ChevronDown, ChevronRight, TrendingDown, TrendingUp } from "lucide-react";

export function DealsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | "active" | "won" | "lost" | "abandoned">("all");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCeiling, setNewCeiling] = useState("");
  const [newWalkAway, setNewWalkAway] = useState("");
  const [newGoals, setNewGoals] = useState("");

  const { data: deals = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/v1/deals"],
  });

  const filtered = filter === "all" ? deals : deals.filter((d: any) => d.status === filter);

  const createMut = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/deals", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/v1/deals"] }); setNewOpen(false); setNewTitle(""); setNewCeiling(""); setNewWalkAway(""); setNewGoals(""); toast({ title: "Deal opened" }); },
    onError: () => toast({ title: "Failed to create deal", variant: "destructive" }),
  });

  const closeMut = useMutation({
    mutationFn: ({ id, status, outcome }: any) => apiRequest("POST", `/api/deals/${id}/close`, { status, outcome }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/v1/deals"] }); toast({ title: "Deal closed" }); },
    onError: () => toast({ title: "Failed to close deal", variant: "destructive" }),
  });

  const statusColor: Record<string, string> = {
    active: "bg-blue-500/20 text-blue-300 border-blue-500/40",
    won: "bg-green-500/20 text-green-300 border-green-500/40",
    lost: "bg-red-500/20 text-red-300 border-red-500/40",
    abandoned: "bg-zinc-500/20 text-zinc-400 border-zinc-500/40",
  };

  function handleCreate() {
    if (!newTitle.trim()) return;
    createMut.mutate({
      title: newTitle.trim(),
      ceiling: newCeiling ? parseFloat(newCeiling) : null,
      walkAway: newWalkAway ? parseFloat(newWalkAway) : null,
      myGoals: newGoals ? newGoals.split("\n").map(s => s.trim()).filter(Boolean) : [],
    });
  }

  return (
    <div className="h-full w-full flex flex-col gap-3 p-3 overflow-y-auto overflow-x-hidden">
      <div className="flex items-center gap-2">
        <ShoppingBag className="w-4 h-4 text-zinc-400" />
        <span className="text-sm font-semibold text-zinc-200">Merchant Deals</span>
        <span className="text-xs text-zinc-500 ml-auto">{deals.filter((d: any) => d.status === "active").length} active</span>
        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setNewOpen(!newOpen)} data-testid="button-new-deal">
          <Plus className="w-3 h-3 mr-1" /> New Deal
        </Button>
      </div>

      {newOpen && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 flex flex-col gap-2">
          <span className="text-xs font-medium text-zinc-300">Open Negotiation</span>
          <Input placeholder="Deal title" value={newTitle} onChange={e => setNewTitle(e.target.value)} className="h-8 text-xs bg-zinc-800 border-zinc-600" data-testid="input-deal-title" />
          <div className="flex gap-2">
            <Input placeholder="Ceiling (max $)" type="number" value={newCeiling} onChange={e => setNewCeiling(e.target.value)} className="h-8 text-xs bg-zinc-800 border-zinc-600" data-testid="input-deal-ceiling" />
            <Input placeholder="Walk-away ($)" type="number" value={newWalkAway} onChange={e => setNewWalkAway(e.target.value)} className="h-8 text-xs bg-zinc-800 border-zinc-600" data-testid="input-deal-walkaway" />
          </div>
          <Textarea placeholder="Goals — one per line" value={newGoals} onChange={e => setNewGoals(e.target.value)} className="text-xs bg-zinc-800 border-zinc-600 min-h-[56px]" data-testid="input-deal-goals" />
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setNewOpen(false)}>Cancel</Button>
            <Button size="sm" className="h-7 text-xs" onClick={handleCreate} disabled={!newTitle.trim() || createMut.isPending} data-testid="button-submit-deal">
              {createMut.isPending ? "Opening..." : "Open Deal"}
            </Button>
          </div>
        </div>
      )}

      <div className="flex gap-1 flex-wrap">
        {(["all", "active", "won", "lost", "abandoned"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} data-testid={`filter-deal-${f}`}
            className={cn("px-2 py-0.5 rounded text-xs border transition-colors",
              filter === f ? "bg-zinc-700 text-zinc-100 border-zinc-500" : "bg-zinc-900 text-zinc-500 border-zinc-700 hover:border-zinc-600")}>
            {f}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">{[1, 2].map(i => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-zinc-600 text-sm">
          {filter === "all" ? "No deals yet — tell a0 what you want to negotiate." : `No ${filter} deals.`}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((deal: any) => {
            const isExp = expanded === deal.id;
            const goals: string[] = deal.myGoals || [];
            const history: any[] = deal.counterHistory || [];
            return (
              <div key={deal.id} className="rounded-lg border border-zinc-700 bg-zinc-900 overflow-hidden" data-testid={`card-deal-${deal.id}`}>
                <div className="flex items-start gap-2 p-3 cursor-pointer select-none" onClick={() => setExpanded(isExp ? null : deal.id)}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-zinc-200 truncate">{deal.title}</span>
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-medium", statusColor[deal.status] || statusColor.abandoned)}>{deal.status}</span>
                      {history.length > 0 && <span className="text-[10px] text-zinc-500">{history.length} moves</span>}
                    </div>
                    <div className="flex gap-3 mt-1 text-[11px] text-zinc-500 flex-wrap">
                      {deal.ceiling != null && <span className="flex items-center gap-0.5"><TrendingDown className="w-3 h-3 text-amber-400" /> ceiling: {deal.ceiling.toLocaleString()}</span>}
                      {deal.walkAway != null && <span className="flex items-center gap-0.5"><TrendingUp className="w-3 h-3 text-red-400" /> walk-away: {deal.walkAway.toLocaleString()}</span>}
                    </div>
                    {goals.length > 0 && !isExp && <div className="mt-1 text-[10px] text-zinc-600 truncate">Goals: {goals.join(" · ")}</div>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {deal.status === "active" && (
                      <>
                        <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px] text-green-400 hover:text-green-300"
                          onClick={e => { e.stopPropagation(); closeMut.mutate({ id: deal.id, status: "won", outcome: "Closed as won" }); }}
                          data-testid={`button-close-won-${deal.id}`} title="Mark won"><Check className="w-3 h-3" /></Button>
                        <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px] text-red-400 hover:text-red-300"
                          onClick={e => { e.stopPropagation(); closeMut.mutate({ id: deal.id, status: "lost", outcome: "Closed as lost" }); }}
                          data-testid={`button-close-lost-${deal.id}`} title="Mark lost"><X className="w-3 h-3" /></Button>
                      </>
                    )}
                    {isExp ? <ChevronDown className="w-3.5 h-3.5 text-zinc-500" /> : <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />}
                  </div>
                </div>
                {isExp && (
                  <div className="border-t border-zinc-800 px-3 pb-3 pt-2 flex flex-col gap-3">
                    {goals.length > 0 && (
                      <div>
                        <div className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1">Goals</div>
                        <ul className="flex flex-col gap-0.5">
                          {goals.map((g, i) => <li key={i} className="text-xs text-zinc-300 flex gap-1.5 items-start"><span className="text-zinc-600 mt-0.5">·</span>{g}</li>)}
                        </ul>
                      </div>
                    )}
                    {history.length > 0 && (
                      <div>
                        <div className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1">Negotiation History ({history.length})</div>
                        <div className="flex flex-col gap-2">
                          {history.map((h: any, i: number) => {
                            const isUs = h.side === "us";
                            const edcm = h.edcm || {};
                            return (
                              <div key={i} data-testid={`deal-move-${deal.id}-${i}`}
                                className={cn("rounded p-2 text-xs border", isUs ? "bg-blue-950/40 border-blue-800/40 ml-4" : "bg-zinc-800/60 border-zinc-700/60")}>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className={cn("font-medium text-[10px]", isUs ? "text-blue-300" : "text-amber-300")}>{isUs ? "Our move" : "Their offer"}</span>
                                  <span className="text-zinc-600 text-[10px] ml-auto">{new Date(h.timestamp).toLocaleDateString()}</span>
                                </div>
                                {h.text && <p className="text-zinc-400 mb-1 line-clamp-3">{h.text}</p>}
                                {Object.keys(edcm).length > 0 && (
                                  <div className="flex gap-2 flex-wrap mt-1">
                                    {Object.entries(edcm).map(([k, v]: any) => (
                                      <span key={k} className={cn("text-[10px] px-1 py-0.5 rounded", v > 0.6 ? "text-red-300 bg-red-900/30" : "text-zinc-400 bg-zinc-800")}>{k.toUpperCase()} {(v as number).toFixed(2)}</span>
                                    ))}
                                  </div>
                                )}
                                {h.notes && <p className="text-zinc-500 text-[10px] mt-1 italic">{h.notes}</p>}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {deal.outcome && <div><div className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1">Outcome</div><p className="text-xs text-zinc-300">{deal.outcome}</p></div>}
                    {!deal.outcome && history.length === 0 && <div className="text-[11px] text-zinc-600 italic">No moves logged yet. Ask a0 to analyze an offer and start negotiating.</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
