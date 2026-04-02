import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { FieldDef } from "@/hooks/use-ui-structure";

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

function GaugeField({ value, label }: { value: unknown; label: string }) {
  const num = typeof value === "number" ? value : parseFloat(String(value ?? "0"));
  const pct = Math.min(100, Math.max(0, num * 100));
  const color = pct >= 80 ? "text-green-400" : pct >= 50 ? "text-yellow-400" : "text-red-400";
  return (
    <div className="flex flex-col gap-1" data-testid={`gauge-${label}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className={`text-xs font-mono ${color}`}>{num.toFixed(4)}</span>
      </div>
      <Progress value={pct} className="h-1.5" />
    </div>
  );
}

function BadgeField({ value, label }: { value: unknown; label: string }) {
  if (value === null || value === undefined) return null;
  const str = String(value);
  const variant =
    str === "active" || str === "true" || str === "ok"
      ? "default"
      : str === "inactive" || str === "false" || str === "error"
        ? "destructive"
        : "secondary";
  return (
    <div className="flex items-center gap-2" data-testid={`badge-${label}`}>
      <span className="text-xs text-muted-foreground w-20 shrink-0">{label}</span>
      <Badge variant={variant} className="text-[10px]">{str}</Badge>
    </div>
  );
}

function TextField({ value, label }: { value: unknown; label: string }) {
  const str = value === null || value === undefined ? "—" : String(value);
  return (
    <div className="flex items-center gap-2" data-testid={`text-${label}`}>
      <span className="text-xs text-muted-foreground w-20 shrink-0">{label}</span>
      <span className="text-xs font-mono break-all">{str}</span>
    </div>
  );
}

function ListField({ value, label }: { value: unknown; label: string }) {
  const items = Array.isArray(value) ? value : [];
  if (items.length === 0) return <TextField value="(empty)" label={label} />;
  return (
    <div className="flex flex-col gap-1" data-testid={`list-${label}`}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-1">
        {items.map((item, i) => (
          <Badge key={i} variant="outline" className="text-[10px]">
            {String(item)}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function TimelineField({ value, label }: { value: unknown; label: string }) {
  const items = Array.isArray(value) ? value : [];
  return (
    <div className="flex flex-col gap-1" data-testid={`timeline-${label}`}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex flex-col gap-1 pl-2 border-l-2 border-border">
        {items.length === 0 ? (
          <span className="text-xs text-muted-foreground">No entries</span>
        ) : (
          items.slice(-10).map((item, i) => (
            <span key={i} className="text-xs font-mono truncate">
              {typeof item === "object" ? JSON.stringify(item) : String(item)}
            </span>
          ))
        )}
      </div>
    </div>
  );
}

function SparklineField({ value, label }: { value: unknown; label: string }) {
  const nums = (Array.isArray(value) ? value : []).map(Number).filter((n) => !isNaN(n));
  if (nums.length === 0) return <TextField value="—" label={label} />;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const range = max - min || 1;
  const h = 24;
  const w = Math.min(120, nums.length * 4);
  const points = nums
    .map((v, i) => `${(i / (nums.length - 1 || 1)) * w},${h - ((v - min) / range) * h}`)
    .join(" ");
  return (
    <div className="flex items-center gap-2" data-testid={`sparkline-${label}`}>
      <span className="text-xs text-muted-foreground w-20 shrink-0">{label}</span>
      <svg width={w} height={h} className="text-primary">
        <polyline fill="none" stroke="currentColor" strokeWidth="1.5" points={points} />
      </svg>
      <span className="text-xs font-mono text-muted-foreground">{nums[nums.length - 1]}</span>
    </div>
  );
}

function JsonField({ value, label }: { value: unknown; label: string }) {
  const str = value === null || value === undefined ? "{}" : JSON.stringify(value, null, 2);
  return (
    <div className="flex flex-col gap-1" data-testid={`json-${label}`}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <pre className="text-[10px] font-mono bg-muted/50 rounded p-2 overflow-auto max-h-40 whitespace-pre-wrap break-all">
        {str}
      </pre>
    </div>
  );
}

const RENDERERS: Record<string, (props: { value: unknown; label: string }) => JSX.Element | null> = {
  gauge: GaugeField,
  text: TextField,
  badge: BadgeField,
  list: ListField,
  timeline: TimelineField,
  sparkline: SparklineField,
  json: JsonField,
};

interface Props {
  field: FieldDef;
  data: Record<string, unknown>;
}

export default function FieldRenderer({ field, data }: Props) {
  const value = getNestedValue(data, field.key);
  const Renderer = RENDERERS[field.type] ?? TextField;
  return <Renderer value={value} label={field.label} />;
}
