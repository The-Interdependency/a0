import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Settings, X } from "lucide-react";
import { usePersona, type Persona } from "@/hooks/use-persona";

const PERSONA_META: Record<Persona, { icon: string; label: string; description: string; color: string }> = {
  free: { icon: "🧭", label: "Explorer", description: "Curious and wide-ranging. Adventurous reasoning, broad references, relaxed tone.", color: "text-emerald-400" },
  legal: { icon: "⚖️", label: "Legal Analyst", description: "Precise, structured, evidence-based. Flags risks, cites sources, avoids speculation.", color: "text-blue-400" },
  researcher: { icon: "🔬", label: "Academic Researcher", description: "Rigorous, thorough, citation-aware. Prioritizes methodological precision and nuance.", color: "text-purple-400" },
  political: { icon: "🏛️", label: "Political Analyst", description: "Strategic, multi-perspective, nuanced. Balances ideology, power dynamics, and outcomes.", color: "text-amber-400" },
};

function PersonaSection() {
  const { persona, setPersona, isPending } = usePersona();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [newUserId, setNewUserId] = useState("");
  const [newUserPersona, setNewUserPersona] = useState<Persona>("free");
  const [showGrants, setShowGrants] = useState(false);

  const personaKeys = Object.keys(PERSONA_META) as Persona[];

  const { data: grants = {} } = useQuery<Record<string, string>>({ queryKey: ["/api/v1/persona-grants"] });
  const { data: personaBlockEnabled = true } = useQuery<boolean>({ queryKey: ["/api/v1/agent/persona-block-enabled"], staleTime: 10000 });

  const grantMutation = useMutation({
    mutationFn: ({ uid, p }: { uid: string; p: string }) => apiRequest("PATCH", `/api/persona-grants/${encodeURIComponent(uid)}`, { persona: p }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/v1/persona-grants"] }); setNewUserId(""); toast({ title: "Grant saved" }); },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });
  const revokeMutation = useMutation({
    mutationFn: (uid: string) => apiRequest("DELETE", `/api/persona-grants/${encodeURIComponent(uid)}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/v1/persona-grants"] }); toast({ title: "Grant revoked" }); },
  });
  const personaBlockMutation = useMutation({
    mutationFn: (enabled: boolean) => apiRequest("PATCH", "/api/v1/agent/persona-block-enabled", { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/v1/agent/persona-block-enabled"] }),
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const grantEntries = Object.entries(grants);
  const currentMeta = persona ? PERSONA_META[persona] : null;

  return (
    <div className="space-y-3">
      {/* Active Persona */}
      <div className="rounded-lg border border-border bg-card p-3 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-xs flex items-center gap-2 text-muted-foreground uppercase tracking-wide">
            <Settings className="w-3.5 h-3.5" /> Agent Persona
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">Send in prompt</span>
            <Switch
              checked={typeof personaBlockEnabled === "boolean" ? personaBlockEnabled : true}
              onCheckedChange={(v) => personaBlockMutation.mutate(v)}
              className="h-4 w-7"
              data-testid="toggle-persona-block"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {personaKeys.map((id) => {
            const meta = PERSONA_META[id];
            return (
              <button key={id} data-testid={`persona-btn-${id}`} disabled={isPending} onClick={() => setPersona(id)}
                className={cn("flex flex-col items-start gap-0.5 py-2 px-2.5 rounded-lg border text-left transition-all active:scale-95",
                  persona === id ? "border-primary bg-primary/10" : "border-border hover:border-primary/30")}>
                <div className="flex items-center gap-1.5">
                  <span className="text-base leading-none">{meta.icon}</span>
                  <span className={cn("text-[11px] font-semibold", persona === id ? "text-primary" : "text-foreground")}>{meta.label}</span>
                </div>
                <p className="text-[9px] text-muted-foreground leading-snug line-clamp-2 pl-0.5">{meta.description}</p>
              </button>
            );
          })}
        </div>
        {currentMeta && !isPending && (
          <div className={cn("rounded-md px-2.5 py-2 bg-muted/40 text-[10px]", currentMeta.color)}>
            <span className="font-semibold">{currentMeta.icon} {currentMeta.label}</span>
            <span className="text-muted-foreground ml-1.5">— {currentMeta.description}</span>
            {!personaBlockEnabled && <Badge variant="outline" className="ml-2 text-[9px] border-amber-400/40 text-amber-400">not sent to model</Badge>}
          </div>
        )}
      </div>

      {/* Persona Grants */}
      <div className="rounded-lg border border-border bg-card p-3 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-xs text-muted-foreground uppercase tracking-wide">Persona Grants</h3>
          <button onClick={() => setShowGrants(v => !v)} className="text-[10px] text-muted-foreground hover:text-foreground" data-testid="button-toggle-grants">
            {showGrants ? "collapse" : `${grantEntries.length} grant${grantEntries.length !== 1 ? "s" : ""}`}
          </button>
        </div>
        {showGrants && (
          <div className="space-y-2">
            <p className="text-[10px] text-muted-foreground">a0 enforces these automatically on each user login.</p>
            {grantEntries.length > 0 && (
              <div className="space-y-1">
                {grantEntries.map(([uid, p]) => {
                  const meta = PERSONA_META[p as Persona];
                  return (
                    <div key={uid} className="flex items-center gap-2 py-1 px-2 rounded-md bg-muted/30 text-xs" data-testid={`grant-row-${uid}`}>
                      <span className="font-mono text-muted-foreground truncate flex-1 text-[10px]">{uid}</span>
                      <span className="flex items-center gap-1 text-[10px]">{meta?.icon}<span className="font-medium">{meta?.label ?? p}</span></span>
                      <button onClick={() => revokeMutation.mutate(uid)} disabled={revokeMutation.isPending} className="text-muted-foreground hover:text-destructive ml-1" data-testid={`btn-revoke-${uid}`}>
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
                {personaKeys.map(p => <option key={p} value={p}>{PERSONA_META[p].icon} {PERSONA_META[p].label}</option>)}
              </select>
              <Button size="sm" className="h-7 px-2 text-[11px]" disabled={!newUserId.trim() || grantMutation.isPending} onClick={() => grantMutation.mutate({ uid: newUserId.trim(), p: newUserPersona })} data-testid="btn-add-grant">
                Grant
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function SystemTab() {
  return (
    <div className="h-full w-full overflow-y-auto overflow-x-hidden px-3 py-3">
      <div className="space-y-3 pb-4">
        <PersonaSection />
      </div>
    </div>
  );
}
