// 233:0
import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useBillingStatus } from "@/hooks/use-billing-status";
import { useSEO } from "@/hooks/use-seo";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Loader2, Save, X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface PromptContext {
  name: string;
  value: string;
  updated_by: string | null;
  updated_at: string | null;
}

interface AdminEmail {
  id: number;
  email: string;
  addedAt: string | null;
}

function ContextRow({ ctx, onSave }: { ctx: PromptContext; onSave: (name: string, value: string) => Promise<void> }) {
  const [value, setValue] = useState(ctx.value);
  const [saving, setSaving] = useState(false);
  const dirty = value !== ctx.value;

  async function handleSave() {
    setSaving(true);
    await onSave(ctx.name, value);
    setSaving(false);
  }

  return (
    <div className="border border-border rounded-lg p-4 bg-card space-y-2" data-testid={`context-row-${ctx.name}`}>
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="font-mono text-xs">{ctx.name}</Badge>
        {ctx.updated_by && (
          <span className="text-xs text-muted-foreground">by {ctx.updated_by}</span>
        )}
        {ctx.updated_at && (
          <span className="text-xs text-muted-foreground ml-auto">
            {new Date(ctx.updated_at).toLocaleDateString()}
          </span>
        )}
      </div>
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={4}
        placeholder="Enter context text..."
        className="font-mono text-xs resize-y"
        data-testid={`textarea-context-${ctx.name}`}
      />
      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={handleSave}
          disabled={!dirty || saving}
          data-testid={`btn-save-context-${ctx.name}`}
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          <span className="ml-1">{saving ? "Saving..." : "Save"}</span>
        </Button>
      </div>
    </div>
  );
}

function AdminEmailsSection({ currentEmail }: { currentEmail?: string | null }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [newEmail, setNewEmail] = useState("");

  const { data: adminEmails = [], isLoading } = useQuery<AdminEmail[]>({
    queryKey: ["/api/v1/admin/emails"],
    staleTime: 0,
  });

  const addMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await apiRequest("POST", "/api/v1/admin/emails", { email });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/v1/admin/emails"] });
      setNewEmail("");
      toast({ title: "Admin email added" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to add", description: err.message, variant: "destructive" });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await apiRequest("DELETE", `/api/v1/admin/emails/${encodeURIComponent(email)}`);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/v1/admin/emails"] });
      toast({ title: "Admin email removed" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to remove", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="mt-10">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-foreground">Admin Emails</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          These email addresses have full admin access. Add or remove without restarting.
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-2" data-testid="admin-emails-list">
          {adminEmails.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center justify-between gap-2 border border-border rounded-lg px-3 py-2 bg-card"
              data-testid={`admin-email-row-${entry.id}`}
            >
              <div>
                <span className="text-sm font-mono text-foreground">{entry.email}</span>
                {entry.addedAt && (
                  <span className="text-[10px] text-muted-foreground ml-2">
                    added {new Date(entry.addedAt).toLocaleDateString()}
                  </span>
                )}
              </div>
              <button
                onClick={() => removeMutation.mutate(entry.email)}
                disabled={removeMutation.isPending || entry.email === currentEmail}
                className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-30"
                title={entry.email === currentEmail ? "Cannot remove yourself" : "Remove"}
                data-testid={`btn-remove-admin-${entry.id}`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}

          {adminEmails.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No admin emails in registry.</p>
          )}
        </div>
      )}

      <div className="flex gap-2 mt-3">
        <Input
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          placeholder="new@example.com"
          className="text-sm"
          onKeyDown={(e) => e.key === "Enter" && newEmail && addMutation.mutate(newEmail)}
          data-testid="input-new-admin-email"
        />
        <Button
          size="sm"
          onClick={() => addMutation.mutate(newEmail)}
          disabled={addMutation.isPending || !newEmail.includes("@")}
          data-testid="btn-add-admin-email"
        >
          {addMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          <span className="ml-1">Add</span>
        </Button>
      </div>
    </div>
  );
}

export default function AdminContextsPage() {
  useSEO({ title: "Prompt Contexts — a0p Admin", description: "Admin-only prompt context editor for a0p system and tier contexts." });
  const [, navigate] = useLocation();
  const { isAdmin, isLoading: billingLoading } = useBillingStatus();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: contexts = [], isLoading } = useQuery<PromptContext[]>({
    queryKey: ["/api/v1/contexts"],
    enabled: isAdmin,
  });

  const saveMutation = useMutation({
    mutationFn: async ({ name, value }: { name: string; value: string }) => {
      await apiRequest("PUT", `/api/v1/contexts/${name}`, { value });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/v1/contexts"] });
      toast({ title: "Context saved" });
    },
    onError: (err: Error) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  if (billingLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    navigate("/");
    return null;
  }

  async function handleSave(name: string, value: string) {
    await saveMutation.mutateAsync({ name, value });
  }

  return (
    <div className="h-full overflow-y-auto">
    <div className="max-w-2xl mx-auto px-4 pt-6 pb-16">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground mb-1">Prompt Contexts</h1>
        <p className="text-sm text-muted-foreground">
          Edit the system prompt context strings injected per tier. Changes take effect on the next message.
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : contexts.length === 0 ? (
        <p className="text-muted-foreground text-sm text-center py-8">No contexts found.</p>
      ) : (
        <div className="space-y-4">
          {contexts.map((ctx) => (
            <ContextRow key={ctx.name} ctx={ctx} onSave={handleSave} />
          ))}
        </div>
      )}

      <AdminEmailsSection currentEmail={user?.email} />
    </div>
    </div>
  );
}
// 233:0
