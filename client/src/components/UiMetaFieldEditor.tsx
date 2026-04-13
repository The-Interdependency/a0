// 343:1
// // 1:1
import { useState, useCallback } from "react";
import { Plus, Trash2, ChevronDown, ChevronRight, Code2, FormInput } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const FIELD_TYPES = ["text", "gauge", "badge", "list", "json", "link"] as const;
type FieldType = typeof FIELD_TYPES[number];

interface FieldDef { key: string; type: FieldType; label: string }
interface SectionDef { id: string; label: string; endpoint: string; fields: FieldDef[] }
interface UiMetaDef {
  tab_id: string;
  label: string;
  icon: string;
  order: number;
  sections: SectionDef[];
  [key: string]: unknown;
}

function emptySection(): SectionDef {
  return { id: `section_${Date.now()}`, label: "New Section", endpoint: "", fields: [] };
}
function emptyField(): FieldDef {
  return { key: "", type: "text", label: "" };
}

function parseMeta(raw: unknown): UiMetaDef {
  const obj = (typeof raw === "object" && raw !== null) ? raw as Record<string, unknown> : {};
  return {
    tab_id: String(obj.tab_id ?? ""),
    label: String(obj.label ?? ""),
    icon: String(obj.icon ?? ""),
    order: Number(obj.order ?? 0),
    sections: Array.isArray(obj.sections)
      ? obj.sections.map((s: unknown) => {
          const sec = (s && typeof s === "object") ? s as Record<string, unknown> : {};
          return {
            id: String(sec.id ?? `s_${Math.random()}`),
            label: String(sec.label ?? ""),
            endpoint: String(sec.endpoint ?? ""),
            fields: Array.isArray(sec.fields)
              ? sec.fields.map((f: unknown) => {
                  const fd = (f && typeof f === "object") ? f as Record<string, unknown> : {};
                  return {
                    key: String(fd.key ?? ""),
                    type: (FIELD_TYPES.includes(fd.type as FieldType) ? fd.type : "text") as FieldType,
                    label: String(fd.label ?? ""),
                  };
                })
              : [],
          };
        })
      : [],
  };
}

function serializeMeta(meta: UiMetaDef): string {
  return JSON.stringify(meta, null, 2);
}

interface Props {
  value: string;
  onChange: (json: string) => void;
  disabled?: boolean;
}

export default function UiMetaFieldEditor({ value, onChange, disabled = false }: Props) {
  const [mode, setMode] = useState<"visual" | "raw">("visual");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const parsed = (() => { try { return parseMeta(JSON.parse(value)); } catch { return parseMeta({}); } })();

  const update = useCallback((next: UiMetaDef) => { onChange(serializeMeta(next)); }, [onChange]);

  const setTop = (key: keyof UiMetaDef, val: unknown) => update({ ...parsed, [key]: val });

  const toggleCollapse = (id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const addSection = () => update({ ...parsed, sections: [...parsed.sections, emptySection()] });

  const removeSection = (idx: number) =>
    update({ ...parsed, sections: parsed.sections.filter((_, i) => i !== idx) });

  const updateSection = (idx: number, patch: Partial<SectionDef>) =>
    update({
      ...parsed,
      sections: parsed.sections.map((s, i) => i === idx ? { ...s, ...patch } : s),
    });

  const addField = (sIdx: number) =>
    updateSection(sIdx, { fields: [...parsed.sections[sIdx].fields, emptyField()] });

  const removeField = (sIdx: number, fIdx: number) =>
    updateSection(sIdx, {
      fields: parsed.sections[sIdx].fields.filter((_, i) => i !== fIdx),
    });

  const updateField = (sIdx: number, fIdx: number, patch: Partial<FieldDef>) =>
    updateSection(sIdx, {
      fields: parsed.sections[sIdx].fields.map((f, i) => i === fIdx ? { ...f, ...patch } : f),
    });

  return (
    <div className="space-y-2" data-testid="uimeta-field-editor">
      <div className="flex items-center justify-between">
        <Label className="text-xs">UI Meta</Label>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 text-xs gap-1"
          onClick={() => setMode(m => m === "visual" ? "raw" : "visual")}
          data-testid="uimeta-toggle-mode"
        >
          {mode === "visual" ? <><Code2 className="h-3 w-3" />Raw JSON</> : <><FormInput className="h-3 w-3" />Visual</>}
        </Button>
      </div>

      {mode === "raw" ? (
        <Textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
          className="font-mono text-xs min-h-[180px] resize-y"
          spellCheck={false}
          data-testid="uimeta-raw-textarea"
        />
      ) : (
        <div className="space-y-3 border border-border rounded-md p-3 bg-muted/20">
          {/* Top-level tab fields */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Tab ID</Label>
              <Input
                value={parsed.tab_id}
                onChange={e => setTop("tab_id", e.target.value)}
                disabled={disabled}
                className="h-7 text-xs font-mono"
                placeholder="my_module"
                data-testid="uimeta-tab-id"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Label</Label>
              <Input
                value={parsed.label}
                onChange={e => setTop("label", e.target.value)}
                disabled={disabled}
                className="h-7 text-xs"
                placeholder="My Module"
                data-testid="uimeta-label"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Icon (lucide name)</Label>
              <Input
                value={parsed.icon}
                onChange={e => setTop("icon", e.target.value)}
                disabled={disabled}
                className="h-7 text-xs font-mono"
                placeholder="Layers"
                data-testid="uimeta-icon"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Order</Label>
              <Input
                type="number"
                value={parsed.order}
                onChange={e => setTop("order", parseInt(e.target.value) || 0)}
                disabled={disabled}
                className="h-7 text-xs"
                data-testid="uimeta-order"
              />
            </div>
          </div>

          {/* Sections */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                Sections ({parsed.sections.length})
              </span>
              {!disabled && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 text-xs gap-1"
                  onClick={addSection}
                  data-testid="uimeta-add-section"
                >
                  <Plus className="h-3 w-3" /> Section
                </Button>
              )}
            </div>

            {parsed.sections.length === 0 && (
              <p className="text-xs text-muted-foreground px-1">No sections yet. Add one above.</p>
            )}

            {parsed.sections.map((sec, sIdx) => (
              <div
                key={sec.id}
                className="border border-border rounded-md bg-background"
                data-testid={`uimeta-section-${sIdx}`}
              >
                {/* Section header */}
                <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border">
                  <button
                    type="button"
                    onClick={() => toggleCollapse(sec.id)}
                    className="flex items-center gap-1 flex-1 min-w-0 text-left"
                    data-testid={`uimeta-section-collapse-${sIdx}`}
                  >
                    {collapsed.has(sec.id)
                      ? <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                      : <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                    }
                    <span className="text-xs font-medium truncate">{sec.label || `Section ${sIdx + 1}`}</span>
                    <span className="text-[10px] text-muted-foreground ml-1 font-mono shrink-0">
                      {sec.fields.length} fields
                    </span>
                  </button>
                  {!disabled && (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-5 w-5 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeSection(sIdx)}
                      data-testid={`uimeta-remove-section-${sIdx}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>

                {!collapsed.has(sec.id) && (
                  <div className="p-2 space-y-2">
                    {/* Section metadata */}
                    <div className="grid grid-cols-3 gap-1.5">
                      <div className="space-y-0.5">
                        <Label className="text-[10px] text-muted-foreground">ID</Label>
                        <Input
                          value={sec.id}
                          onChange={e => updateSection(sIdx, { id: e.target.value })}
                          disabled={disabled}
                          className="h-6 text-xs font-mono"
                          data-testid={`uimeta-section-id-${sIdx}`}
                        />
                      </div>
                      <div className="space-y-0.5">
                        <Label className="text-[10px] text-muted-foreground">Label</Label>
                        <Input
                          value={sec.label}
                          onChange={e => updateSection(sIdx, { label: e.target.value })}
                          disabled={disabled}
                          className="h-6 text-xs"
                          data-testid={`uimeta-section-label-${sIdx}`}
                        />
                      </div>
                      <div className="space-y-0.5 col-span-1">
                        <Label className="text-[10px] text-muted-foreground">Endpoint</Label>
                        <Input
                          value={sec.endpoint}
                          onChange={e => updateSection(sIdx, { endpoint: e.target.value })}
                          disabled={disabled}
                          className="h-6 text-xs font-mono"
                          placeholder="/api/v1/..."
                          data-testid={`uimeta-section-endpoint-${sIdx}`}
                        />
                      </div>
                    </div>

                    {/* Fields */}
                    <div className="space-y-1">
                      {sec.fields.map((field, fIdx) => (
                        <div
                          key={fIdx}
                          className="grid grid-cols-[1fr_100px_1fr_auto] gap-1 items-center"
                          data-testid={`uimeta-field-${sIdx}-${fIdx}`}
                        >
                          <Input
                            value={field.key}
                            onChange={e => updateField(sIdx, fIdx, { key: e.target.value })}
                            disabled={disabled}
                            className="h-6 text-xs font-mono"
                            placeholder="key.path"
                            data-testid={`uimeta-field-key-${sIdx}-${fIdx}`}
                          />
                          <Select
                            value={field.type}
                            onValueChange={v => updateField(sIdx, fIdx, { type: v as FieldType })}
                            disabled={disabled}
                          >
                            <SelectTrigger
                              className="h-6 text-xs"
                              data-testid={`uimeta-field-type-${sIdx}-${fIdx}`}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {FIELD_TYPES.map(t => (
                                <SelectItem key={t} value={t}>{t}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            value={field.label}
                            onChange={e => updateField(sIdx, fIdx, { label: e.target.value })}
                            disabled={disabled}
                            className="h-6 text-xs"
                            placeholder="Display label"
                            data-testid={`uimeta-field-label-${sIdx}-${fIdx}`}
                          />
                          {!disabled && (
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0"
                              onClick={() => removeField(sIdx, fIdx)}
                              data-testid={`uimeta-remove-field-${sIdx}-${fIdx}`}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      ))}
                      {!disabled && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-6 text-xs gap-1 w-full justify-start"
                          onClick={() => addField(sIdx)}
                          data-testid={`uimeta-add-field-${sIdx}`}
                        >
                          <Plus className="h-3 w-3" /> Add field
                        </Button>
                      )}
                      {sec.fields.length === 0 && (
                        <p className="text-[10px] text-muted-foreground px-1">No fields. Add one above.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
// 343:1
