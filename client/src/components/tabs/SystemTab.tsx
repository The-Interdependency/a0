import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Settings, X } from "lucide-react";
import { usePersona, type Persona } from "@/hooks/use-persona";

function PersonaSection() {
  const { persona, setPersona, isPending } = usePersona();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [newUserId, setNewUserId] = useState("");
  const [newUserPersona, setNewUserPersona] = useState<Persona>("free");
  const [showGrants, setShowGrants] = useState(false);

  const personas: Array<{ id: Persona; icon: string; label: string }> = [
    { id: "free", icon: "🧭", label: "Explorer" },
    { id: "legal", icon: "⚖️", label: "Legal" },
    { id: "researcher", icon: "🔬", label: "Research" },
    { id: "political", icon: "🏛️", label: "Political" },
  ];

  const { data: grants = {} } = useQuery<Record<string, string>>({ queryKey: ["/api/v1/persona-grants"] });

  const grantMutation = useMutation({
    mutationFn: ({ uid, p }: { uid: string; p: string }) => apiRequest("PATCH", `/api/persona-grants/${encodeURIComponent(uid)}`, { persona: p }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/v1/persona-grants"] }); setNewUserId(""); toast({ title: "Grant saved" }); },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });
  const revokeMutation = useMutation({
    mutationFn: (uid: string) => apiRequest("DELETE", `/api/persona-grants/${encodeURIComponent(uid)}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/v1/persona-grants"] }); toast({ title: "Grant revoked" }); },
  });

  const grantEntries = Object.entries(grants);

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-xs flex items-center gap-2 text-muted-foreground uppercase tracking-wide">
          <Settings className="w-3.5 h-3.5" /> Agent Persona
        </h3>
        <button onClick={() => setShowGrants(v => !v)} className="text-[10px] text-muted-foreground hover:text-foreground transition-colors" data-testid="button-toggle-grants">
          {showGrants ? "hide grants" : `grants (${grantEntries.length})`}
        </button>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {personas.map(({ id, icon, label }) => (
          <button key={id} data-testid={`persona-btn-${id}`} disabled={isPending} onClick={() => setPersona(id)}
            className={cn("flex flex-col items-center gap-1 py-2 px-1 rounded-lg border text-[10px] font-medium transition-all active:scale-95",
              persona === id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/30")}>
            <span className="text-base leading-none">{icon}</span>{label}
          </button>
        ))}
      </div>
      {showGrants && (
        <div className="space-y-2 pt-1 border-t border-border">
          <p className="text-[10px] text-muted-foreground">a0 enforces these grants automatically on each login.</p>
          {grantEntries.length > 0 && (
            <div className="space-y-1">
              {grantEntries.map(([uid, p]) => {
                const meta = personas.find(x => x.id === p);
                return (
                  <div key={uid} className="flex items-center gap-2 py-1 px-2 rounded-md bg-muted/30 text-xs" data-testid={`grant-row-${uid}`}>
                    <span className="font-mono text-muted-foreground truncate flex-1 text-[10px]">{uid}</span>
                    <span className="flex items-center gap-1 text-[10px]"><span>{meta?.icon}</span><span className="font-medium">{meta?.label ?? p}</span></span>
                    <button onClick={() => revokeMutation.mutate(uid)} disabled={revokeMutation.isPending} className="text-muted-foreground hover:text-destructive transition-colors ml-1" data-testid={`btn-revoke-${uid}`}>
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex gap-1.5">
            <Input value={newUserId} onChange={e => setNewUserId(e.target.value)} placeholder="userId (Replit sub)" className="h-7 text-[11px] flex-1 font-mono" data-testid="input-grant-userid" />
            <select value={newUserPersona} onChange={e => setNewUserPersona(e.target.value as Persona)} className="h-7 text-[11px] rounded-md border border-border bg-background px-1.5" data-testid="select-grant-persona">
              {personas.map(p => <option key={p.id} value={p.id}>{p.icon} {p.label}</option>)}
            </select>
            <Button size="sm" className="h-7 px-2 text-[11px]" disabled={!newUserId.trim() || grantMutation.isPending} onClick={() => grantMutation.mutate({ uid: newUserId.trim(), p: newUserPersona })} data-testid="btn-add-grant">
              Grant
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function SystemTab() {
  return (
    <div className="h-full w-full overflow-y-auto overflow-x-hidden px-3 py-3">
      <PersonaSection />
    </div>
  );
}
