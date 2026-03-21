import { Badge } from "@/components/ui/badge";
import { Radio, GitBranch, Layers, Zap, MessageSquare, RefreshCw, ExternalLink } from "lucide-react";

const LIB_PATTERNS = [
  {
    id: "fan_out",
    name: "Fan-Out",
    icon: Zap,
    description: "Send a prompt to all slots simultaneously. Aggregate independent responses.",
  },
  {
    id: "daisy_chain",
    name: "Daisy Chain",
    icon: GitBranch,
    description: "Pass output from one slot to the next in sequence. Each model refines the prior.",
  },
  {
    id: "room_all",
    name: "Room (All)",
    icon: MessageSquare,
    description: "Multi-round conversation room where every slot sees all messages each round.",
  },
  {
    id: "room_synthesized",
    name: "Room (Synthesized)",
    icon: Layers,
    description: "Multi-round room with a synthesis model that merges outputs each round.",
  },
  {
    id: "council",
    name: "Council",
    icon: Layers,
    description: "Structured deliberation: each slot proposes, then votes on the best answer.",
  },
  {
    id: "roleplay",
    name: "Roleplay",
    icon: RefreshCw,
    description: "Assign distinct roles to slots. A designated DM manages turn order.",
  },
];

export function AimmhTab() {
  return (
    <div className="h-full w-full overflow-y-auto overflow-x-hidden px-3 py-3 space-y-4">
      <div className="flex items-center gap-2">
        <Radio className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold" data-testid="text-aimmh-title">aimmh-lib</h3>
        <Badge variant="outline" className="text-xs">Task #9 Stub</Badge>
      </div>

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-1">
        <p className="text-xs font-medium text-amber-600 dark:text-amber-400">Task #9 — Hub Persistence</p>
        <p className="text-xs text-muted-foreground">
          Full hub instance and group management (create, list, delete hub instances; persist group configurations across restarts) is planned for Task #9. This tab shows the current library pattern catalog and serves as the integration surface.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">6 Library Patterns</p>
        <div className="space-y-2">
          {LIB_PATTERNS.map(p => {
            const Icon = p.icon;
            return (
              <div
                key={p.id}
                className="rounded-lg border border-border bg-card p-3 flex gap-3"
                data-testid={`pattern-${p.id}`}
              >
                <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{p.name}</span>
                    <Badge variant="secondary" className="text-xs font-mono">{p.id}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{p.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-3 space-y-1">
        <p className="text-xs font-medium">Current Hub Instances</p>
        <p className="text-xs text-muted-foreground">Instance persistence not yet implemented (Task #9). Use the <strong>System &gt; aimmh-lib</strong> (Hub) tab for live pattern execution.</p>
      </div>
    </div>
  );
}
