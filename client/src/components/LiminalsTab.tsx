import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Hourglass,
  ChevronDown,
  ChevronRight,
  Loader2,
  AlertTriangle,
  Inbox,
  CornerDownRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import TabShell from "@/components/TabShell";

interface CategoryItem {
  id: number | string;
  title?: string;
  summary?: string;
  name?: string;
  status?: string;
  parent_conv_id?: number | null;
  started_at?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
}

interface Category {
  id: string;
  label: string;
  description: string;
  count: number;
  items: CategoryItem[];
}

interface LiminalsResponse {
  categories: Category[];
  total: number;
}

function relTime(iso?: string | null): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function ItemRow({ category, item }: { category: string; item: CategoryItem }) {
  const ts = item.started_at || item.updated_at || item.created_at;
  const stamp = relTime(ts);

  // Click destination: archived & sub-agent convs jump to chat with that conv;
  // ws_modules jump to that tab in the console; drafts have no destination yet.
  let body = (
    <div className="flex items-start justify-between gap-3 px-3 py-2 hover-elevate active-elevate-2 rounded-md">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm truncate">
          {category === "pending_subagents" && item.parent_conv_id != null && (
            <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          )}
          <span className="truncate" data-testid={`liminal-item-title-${category}-${item.id}`}>
            {item.title || item.name || item.summary || `#${item.id}`}
          </span>
          {item.status && (
            <Badge variant="outline" className="text-[10px] py-0 h-4 shrink-0">
              {item.status}
            </Badge>
          )}
        </div>
        {category === "pending_subagents" && item.parent_conv_id != null && (
          <div className="text-[11px] text-muted-foreground mt-0.5">
            parent conv #{item.parent_conv_id}
          </div>
        )}
      </div>
      {stamp && (
        <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums">{stamp}</span>
      )}
    </div>
  );

  if (category === "archived_conversations" || category === "pending_subagents") {
    return (
      <Link
        href="/"
        onClick={() => {
          try {
            localStorage.setItem("a0p_active_conv_id", String(item.id));
          } catch {}
        }}
        data-testid={`liminal-link-${category}-${item.id}`}
      >
        {body}
      </Link>
    );
  }
  if (category === "inactive_ws_modules") {
    return (
      <Link
        href="/console"
        onClick={() => {
          try {
            localStorage.setItem("a0p_active_tab", "ws_modules");
          } catch {}
        }}
        data-testid={`liminal-link-${category}-${item.id}`}
      >
        {body}
      </Link>
    );
  }
  return <div data-testid={`liminal-item-${category}-${item.id}`}>{body}</div>;
}

function CategoryBlock({ cat }: { cat: Category }) {
  const [open, setOpen] = useState(cat.count > 0);
  return (
    <Card className="overflow-hidden" data-testid={`liminal-category-${cat.id}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 hover-elevate active-elevate-2"
        data-testid={`liminal-toggle-${cat.id}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          {open ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <span className="text-sm font-medium truncate">{cat.label}</span>
        </div>
        <Badge variant={cat.count > 0 ? "default" : "secondary"} data-testid={`liminal-count-${cat.id}`}>
          {cat.count}
        </Badge>
      </button>
      {open && (
        <div className="border-t border-border">
          <p className="text-[11px] text-muted-foreground px-3 pt-2">{cat.description}</p>
          {cat.items.length === 0 ? (
            <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
              <Inbox className="h-3.5 w-3.5" />
              <span>None</span>
            </div>
          ) : (
            <div className="p-1">
              {cat.items.map((it) => (
                <ItemRow key={`${cat.id}-${it.id}`} category={cat.id} item={it} />
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export default function LiminalsTab() {
  const { data, isLoading, isFetching, error, refetch } = useQuery<LiminalsResponse>({
    queryKey: ["/api/v1/liminals"],
    refetchInterval: 15000,
  });

  return (
    <TabShell label="Liminals" icon="Hourglass" onRefresh={() => refetch()} isRefreshing={isFetching}>
      <div className="flex-1 overflow-auto p-3 space-y-2" data-testid="liminals-body">
        <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
          <Hourglass className="h-3.5 w-3.5" />
          <span>
            In-between system states.{" "}
            {data && (
              <span className="tabular-nums" data-testid="liminals-total">
                {data.total} item{data.total === 1 ? "" : "s"}
              </span>
            )}
          </span>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-12 text-muted-foreground" data-testid="liminals-loading">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 p-3 text-sm text-destructive" data-testid="liminals-error">
            <AlertTriangle className="h-4 w-4" />
            <span>Failed to load liminals.</span>
          </div>
        )}

        {data?.categories.map((cat) => <CategoryBlock key={cat.id} cat={cat} />)}
      </div>
    </TabShell>
  );
}
