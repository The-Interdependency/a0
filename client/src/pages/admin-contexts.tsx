import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useBillingStatus } from "@/hooks/use-billing-status";
import { useSEO } from "@/hooks/use-seo";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

interface PromptContext {
  name: string;
  value: string;
  updated_by: string | null;
  updated_at: string | null;
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

export default function AdminContextsPage() {
  useSEO({ title: "Prompt Contexts — a0p Admin" });
  const [, navigate] = useLocation();
  const { isAdmin, isLoading: billingLoading } = useBillingStatus();
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
    </div>
  );
}
