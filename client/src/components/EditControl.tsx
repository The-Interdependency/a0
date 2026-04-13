// 130:1
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import { useWsEditMode, type AnyEditableField } from "@/hooks/use-ws-edit-mode";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface EditControlProps {
  fieldKey: string;
  /** Optionally override the field value shown in the control (e.g. current row id). */
  valueOverride?: string;
}

function ControlInput({
  field,
  value,
  onChange,
}: {
  field: AnyEditableField;
  value: string | boolean;
  onChange: (v: string | boolean) => void;
}) {
  const ct = field.controlType;
  const opts = field.options ?? [];

  if (ct === "toggle") {
    return (
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
          value ? "bg-primary" : "bg-muted"
        }`}
        data-testid={`edit-control-toggle-${field.key}`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
            value ? "translate-x-4" : "translate-x-1"
          }`}
        />
      </button>
    );
  }

  if (ct === "select") {
    return (
      <select
        className="text-xs border border-border rounded px-1.5 py-1 bg-background text-foreground"
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
        data-testid={`edit-control-select-${field.key}`}
      >
        {opts.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }

  if (ct === "textarea") {
    return (
      <textarea
        className="text-xs border border-border rounded px-1.5 py-1 bg-background text-foreground w-full resize-y min-h-[60px]"
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
        data-testid={`edit-control-textarea-${field.key}`}
      />
    );
  }

  return (
    <input
      type="text"
      className="text-xs border border-border rounded px-1.5 py-1 bg-background text-foreground w-full"
      value={String(value)}
      onChange={(e) => onChange(e.target.value)}
      data-testid={`edit-control-input-${field.key}`}
    />
  );
}

export default function EditControl({ fieldKey, valueOverride }: EditControlProps) {
  const { editMode, schema } = useWsEditMode();
  const { toast } = useToast();

  const field = schema.get(fieldKey);

  const initialValue = (): string | boolean => {
    if (!field) return "";
    if (field.source === "frontend") return field.get();
    return valueOverride ?? "";
  };

  const [value, setValue] = useState<string | boolean>(initialValue);

  const saveMutation = useMutation({
    mutationFn: async (v: string | boolean) => {
      if (!field) return;
      if (field.source === "frontend") {
        field.patch(v);
        return;
      }
      const endpoint = valueOverride
        ? field.patchEndpoint.replace("{id}", valueOverride).replace("{subsystem}", String(v))
        : field.patchEndpoint;
      await apiRequest("PATCH", endpoint, { value: v });
    },
    onSuccess: () => {
      if (field?.source === "backend") {
        queryClient.invalidateQueries({ queryKey: [field.queryKey] });
      }
      toast({ title: "Saved", description: field?.label });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  if (!editMode || !field) return null;

  return (
    <div
      className="flex items-center gap-1.5 mt-1 p-1.5 rounded bg-primary/5 border border-primary/20"
      data-testid={`edit-control-${fieldKey}`}
    >
      <ControlInput field={field} value={value} onChange={setValue} />
      <button
        type="button"
        disabled={saveMutation.isPending}
        onClick={() => saveMutation.mutate(value)}
        className="shrink-0 p-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        data-testid={`edit-control-save-${fieldKey}`}
      >
        {saveMutation.isPending ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Check className="h-3 w-3" />
        )}
      </button>
    </div>
  );
}
// 130:1
