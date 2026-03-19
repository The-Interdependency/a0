import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Check, ChevronDown, ChevronRight, Crown, Lock, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

type Section = { label: string; key: string; editable: boolean; content: string };
type FullPreview = { sections: Section[]; persona: string; isOwner?: boolean };

function SectionBlock({ section, value, onChange, onSave, saving }: {
  section: Section;
  value: string;
  onChange?: (v: string) => void;
  onSave?: () => void;
  saving?: boolean;
}) {
  const [open, setOpen] = useState(section.editable);

  return (
    <div className={cn("rounded-lg border bg-card overflow-hidden", section.editable ? "border-primary/40" : "border-border")}>
      <button
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-accent/50 transition-colors"
        onClick={() => setOpen(o => !o)}
        data-testid={`button-section-${section.key}`}
      >
        {open ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
        <span className="text-xs font-semibold flex-1">{section.label}</span>
        {section.editable
          ? <Badge variant="outline" className="text-[9px] border-primary/50 text-primary gap-0.5"><Pencil className="w-2.5 h-2.5" />editable</Badge>
          : <Badge variant="outline" className="text-[9px] gap-0.5 text-muted-foreground"><Lock className="w-2.5 h-2.5" />system</Badge>
        }
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2">
          {section.editable && onChange ? (
            <>
              <Textarea
                value={value}
                onChange={e => onChange(e.target.value)}
                className="min-h-[80px] font-mono text-[10px] resize-none bg-background"
                data-testid={`textarea-${section.key}`}
              />
              {onSave && (
                <Button size="sm" className="w-full h-7 text-[11px] gap-1" onClick={onSave} disabled={saving} data-testid={`button-save-${section.key}`}>
                  <Check className="w-3 h-3" />{saving ? "Saving…" : "Save Section"}
                </Button>
              )}
            </>
          ) : (
            <pre className="font-mono text-[10px] text-muted-foreground whitespace-pre-wrap leading-relaxed bg-background rounded p-2 max-h-48 overflow-auto"
              data-testid={`text-section-${section.key}`}>
              {value}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

export function ContextTab() {
  const { toast } = useToast();
  const [view, setView] = useState<"sections" | "raw">("sections");
  const [values, setValues] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const { data: preview, isLoading } = useQuery<FullPreview>({
    queryKey: ["/api/v1/context/full-preview"],
    staleTime: 30000,
  });

  useEffect(() => {
    if (preview && !loaded) {
      const init: Record<string, string> = {};
      for (const s of preview.sections) { init[s.key] = s.content; }
      setValues(init);
      setLoaded(true);
    }
  }, [preview, loaded]);

  const saveCoreContextMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/context", {
      systemPrompt: values["systemPrompt"],
      contextPrefix: values["contextPrefix"],
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/context/full-preview"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/context"] });
      toast({ title: "Context saved" });
      setSavingKey(null);
    },
    onError: (e: any) => { setSavingKey(null); toast({ title: "Error", description: e.message, variant: "destructive" }); },
  });

  const saveSectionMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      apiRequest("PATCH", "/api/v1/context/system-sections", { key, value }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/context/full-preview"] });
      setSavingKey(null);
      toast({ title: `${vars.key} saved` });
    },
    onError: (e: any) => { setSavingKey(null); toast({ title: "Error", description: e.message, variant: "destructive" }); },
  });

  function handleSave(key: string) {
    setSavingKey(key);
    if (key === "systemPrompt" || key === "contextPrefix") {
      saveCoreContextMutation.mutate();
    } else {
      saveSectionMutation.mutate({ key, value: values[key] ?? "" });
    }
  }

  const isOwner = preview?.isOwner ?? false;

  const rawAssembled = preview?.sections.map(s => {
    const val = values[s.key] ?? s.content;
    return `# ${s.label.toUpperCase()}${s.editable ? " [editable]" : " [system]"}\n${val}`;
  }).join("\n\n---\n\n") ?? "";

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 px-3 pt-3 pb-2 flex-shrink-0 flex-wrap">
        <button
          onClick={() => setView("sections")}
          className={cn("px-3 py-1 rounded-full text-[11px] font-medium transition-colors", view === "sections" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
          data-testid="button-view-sections"
        >Sections</button>
        <button
          onClick={() => setView("raw")}
          className={cn("px-3 py-1 rounded-full text-[11px] font-medium transition-colors", view === "raw" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
          data-testid="button-view-raw"
        >Full Prompt</button>
        {preview && (
          <div className="ml-auto flex items-center gap-1.5">
            {isOwner && <Badge variant="outline" className="text-[9px] border-amber-400/50 text-amber-400 gap-0.5"><Crown className="w-2.5 h-2.5" />owner</Badge>}
            <Badge variant="outline" className="text-[9px]">persona: {preview.persona}</Badge>
          </div>
        )}
      </div>

      <ScrollArea className="flex-1 px-3">
        <div className="space-y-2 pb-4">
          {isLoading && <div className="text-xs text-muted-foreground text-center py-8">Loading prompt…</div>}

          {!isOwner && !isLoading && (
            <div className="rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-[10px] text-amber-500">
              System blocks are read-only. Owner account can edit all sections.
            </div>
          )}

          {view === "sections" && preview?.sections.map(section => (
            <SectionBlock
              key={section.key}
              section={section}
              value={values[section.key] ?? section.content}
              onChange={section.editable ? (v) => setValues(prev => ({ ...prev, [section.key]: v })) : undefined}
              onSave={section.editable ? () => handleSave(section.key) : undefined}
              saving={savingKey === section.key}
            />
          ))}

          {view === "raw" && (
            <div className="rounded-lg border border-border bg-card p-3">
              <p className="text-[10px] text-muted-foreground mb-2">Full assembled prompt sent to a0 each request.</p>
              <pre className="font-mono text-[10px] text-muted-foreground whitespace-pre-wrap leading-relaxed bg-background rounded p-2 overflow-auto max-h-[60vh]" data-testid="text-full-prompt">
                {rawAssembled}
              </pre>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
