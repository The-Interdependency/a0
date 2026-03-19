import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RefreshCw, Zap } from "lucide-react";

const S17_PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59];
const DEPTH = 7;
const ANOMALY_THRESHOLD = 2.0;

function seedMagnitude(deltas: number[][] | undefined, i: number): number {
  if (!deltas?.[i]) return 0;
  return Math.sqrt(deltas[i].reduce((s, v) => s + v * v, 0));
}
function seedActivation(pattern: number[] | undefined, i: number): number {
  if (!pattern) return 0;
  const slice = pattern.slice(i * DEPTH, i * DEPTH + DEPTH);
  return Math.max(...slice.map(Math.abs));
}
function coherenceColor(c: number): string {
  if (c >= 0.8) return "text-green-400";
  if (c >= 0.5) return "text-amber-400";
  return "text-red-400";
}
function activationToColor(activation: number): string {
  const t = Math.min(activation / 3, 1);
  if (t >= 0.8) return "#f87171";
  if (t >= 0.5) return "#fbbf24";
  if (t >= 0.2) return "#34d399";
  return "#64748b";
}

export function S17Tab() {
  const [mode, setMode] = useState<"serial" | "parallel">(() => (localStorage.getItem("a0p-s17-mode") as "serial" | "parallel") ?? "serial");
  const { data: state, isLoading, refetch } = useQuery<any>({ queryKey: ["/api/v1/subcore/state"], refetchInterval: 30000 });

  function switchMode(m: "serial" | "parallel") { setMode(m); localStorage.setItem("a0p-s17-mode", m); }

  const auditory = state?.auditory;
  const visual = state?.visual;
  const anomalySet = new Set<number>(auditory?.anomalies?.map((a: any) => a.seedIndex as number) ?? []);

  const svgSize = 220;
  const cx = svgSize / 2;
  const cy = svgSize / 2;
  const ringR = 82;
  const nodeR = 13;
  function nodePos(i: number) { const angle = (i / 17) * 2 * Math.PI - Math.PI / 2; return { x: cx + ringR * Math.cos(angle), y: cy + ringR * Math.sin(angle) }; }

  return (
    <ScrollArea className="h-full">
      <div className="px-3 py-3 space-y-3 pb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm">S17 Sub-Core</span>
            {state && <span className="text-[10px] font-mono text-muted-foreground">♥ {state.heartbeat}</span>}
          </div>
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => refetch()} data-testid="button-s17-refresh"><RefreshCw className="w-3 h-3" /></Button>
        </div>

        <div className="flex gap-0.5 p-0.5 bg-muted rounded-lg">
          <button onClick={() => switchMode("serial")} data-testid="button-s17-serial" className={cn("flex-1 text-[11px] font-medium py-1.5 rounded-md transition-colors", mode === "serial" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground")}>
            Serial · Auditory
          </button>
          <button onClick={() => switchMode("parallel")} data-testid="button-s17-parallel" className={cn("flex-1 text-[11px] font-medium py-1.5 rounded-md transition-colors", mode === "parallel" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground")}>
            Parallel · Visual
          </button>
        </div>

        {isLoading && <Skeleton className="w-full h-24" />}

        {!isLoading && mode === "serial" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">Temporal · What changed?</span>
              <span className={cn("text-[11px] font-mono font-bold", coherenceColor(auditory?.coherence ?? 0))}>coh {((auditory?.coherence ?? 0) * 100).toFixed(0)}%</span>
            </div>
            {anomalySet.size > 0 && (
              <div className="rounded border border-red-500/30 bg-red-500/10 px-2 py-1 text-[10px] font-mono text-red-400">
                ⚠ {anomalySet.size} rhythm break{anomalySet.size > 1 ? "s" : ""} detected
              </div>
            )}
            <div className="space-y-1.5">
              {S17_PRIMES.map((prime, i) => {
                const mag = seedMagnitude(auditory?.deltas, i);
                const isAnomaly = anomalySet.has(i);
                const barWidth = Math.min((mag / ANOMALY_THRESHOLD) * 100, 100);
                return (
                  <div key={i} data-testid={`s17-seed-${i}`}>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-muted-foreground w-5 flex-shrink-0">{i}</span>
                      <span className="font-mono text-[9px] text-muted-foreground w-6 flex-shrink-0">p{prime}</span>
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden"><div className={cn("h-full rounded-full transition-all", isAnomaly ? "bg-red-400" : "bg-primary/70")} style={{ width: `${barWidth}%` }} /></div>
                      <span className="font-mono text-[10px] text-muted-foreground w-10 text-right flex-shrink-0">{mag.toFixed(3)}</span>
                      {isAnomaly && <span className="text-[9px] font-mono text-red-400 flex-shrink-0">!</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!isLoading && mode === "parallel" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">Structural · What shape?</span>
              <span className={cn("text-[11px] font-mono font-bold", coherenceColor(visual?.coherence ?? 0))}>coh {((visual?.coherence ?? 0) * 100).toFixed(0)}%</span>
            </div>
            <div className="flex justify-center">
              <svg width={svgSize} height={svgSize}>
                <text x={cx} y={cy - 5} textAnchor="middle" fontSize="8" fill="#94a3b8" fontFamily="monospace">S17</text>
                <text x={cx} y={cy + 9} textAnchor="middle" fontSize="11" fontFamily="monospace" fill="#e2e8f0" fontWeight="bold">{((visual?.coherence ?? 0) * 100).toFixed(0)}%</text>
                {S17_PRIMES.map((prime, i) => {
                  const pos = nodePos(i);
                  const activation = seedActivation(visual?.pattern, i);
                  const color = activationToColor(activation);
                  return (
                    <g key={i} data-testid={`s17-node-${i}`}>
                      <circle cx={pos.x} cy={pos.y} r={nodeR} fill={color} fillOpacity="0.2" stroke={color} strokeWidth="1.5" />
                      <text x={pos.x} y={pos.y - 0.5} textAnchor="middle" fontSize="8" fontFamily="monospace" fill={color} fontWeight="bold">{i}</text>
                      <text x={pos.x} y={pos.y + 8} textAnchor="middle" fontSize="6" fontFamily="monospace" fill="#94a3b8">{prime}</text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
