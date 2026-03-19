import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Check } from "lucide-react";

export function ContextTab() {
  const { toast } = useToast();

  const { data: serverCtx } = useQuery<{ systemPrompt: string; contextPrefix: string }>({ queryKey: ["/api/v1/context"] });
  const [systemPrompt, setSystemPrompt] = useState("");
  const [contextPrefix, setContextPrefix] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (serverCtx && !loaded) {
      setSystemPrompt(serverCtx.systemPrompt);
      setContextPrefix(serverCtx.contextPrefix);
      setLoaded(true);
    }
  }, [serverCtx, loaded]);

  const saveMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/context", { systemPrompt, contextPrefix }),
    onSuccess: () => toast({ title: "Context saved and active" }),
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <ScrollArea className="h-full px-3 py-3">
      <div className="space-y-4 pb-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold text-sm mb-2">System Prompt</h3>
          <p className="text-[10px] text-muted-foreground mb-2">Editable. This is prepended to every AI request.</p>
          <Textarea value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} className="min-h-[120px] font-mono text-xs resize-none" data-testid="textarea-system-prompt" />
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold text-sm mb-2">Context Prefix</h3>
          <p className="text-[10px] text-muted-foreground mb-2">Additional context injected with each prompt.</p>
          <Textarea value={contextPrefix} onChange={e => setContextPrefix(e.target.value)} className="min-h-[100px] font-mono text-xs resize-none" data-testid="textarea-context-prefix" />
        </div>

        <Button className="w-full" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="button-save-context">
          <Check className="w-4 h-4 mr-1" />{saveMutation.isPending ? "Saving..." : "Save Context"}
        </Button>

        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold text-sm mb-2">Full Prompt Preview</h3>
          <div className="bg-background rounded p-3 font-mono text-[10px] text-muted-foreground whitespace-pre-wrap max-h-48 overflow-auto" data-testid="text-prompt-preview">
            {`[SYSTEM]\n${systemPrompt}\n\n[CONTEXT]\n${contextPrefix}\n\n[USER MESSAGE]\n<user input here>`}
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}
