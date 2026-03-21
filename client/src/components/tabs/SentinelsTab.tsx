import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Shield, RefreshCw, Zap } from "lucide-react";

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

function activationToColor(activation: number): string {
  const t = Math.min(activation / 3, 1);
  if (t >= 0.8) return "#f87171";
  if (t >= 0.5) return "#fbbf24";
  if (t >= 0.2) return "#34d399";
  return "#64748b";
}

export function SentinelsTab() {
  const { data: s17State, isLoading: s17Loading, refetch: refetchS17 } = useQuery<any>({
    queryKey: ["/api/v1/subcore/state"],
    refetchInterval: 30000,
  });

  const { data: brainData, isLoading: brainLoading } = useQuery<any>({
    queryKey: ["/api/v1/brain"],
    staleTime: 15000,
  });

  const auditory = s17State?.auditory;
  const visual = s17State?.visual;
  const anomalySet = new Set<number>(auditory?.anomalies?.map((a: any) => a.seedIndex as number) ?? []);

  const svgSize = 200;
  const cx = svgSize / 2;
  const cy = svgSize / 2;
  const ringR = 72;
  const nodeR = 11;
  function nodePos(i: number) {
    const angle = (i / 17) * 2 * Math.PI - Math.PI / 2;
    return { x: cx + ringR * Math.cos(angle), y: cy + ringR * Math.sin(angle) };
  }

  return (
    <ScrollArea className="h-full">
      <div className="px-3 py-3 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm" data-testid="text-sentinels-title">Sentinels</span>
          </div>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => refetchS17()} data-testid="button-sentinels-refresh">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>

        {s17Loading ? (
          <Skeleton className="h-56" />
        ) : s17State ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <Badge variant="outline" className="text-xs">
                ♥ {s17State.heartbeat ?? "—"}
              </Badge>
              {anomalySet.size > 0 && (
                <Badge variant="destructive" className="text-xs">
                  {anomalySet.size} anomalies
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">S17 Sub-Core (17 sentinel nodes)</span>
            </div>

            <div className="flex justify-center">
              <svg width={svgSize} height={svgSize}>
                <circle cx={cx} cy={cy} r={ringR} fill="none" stroke="#334155" strokeWidth={1} />
                {S17_PRIMES.map((_, i) => {
                  const { x, y } = nodePos(i);
                  const mag = seedMagnitude(visual?.seedDeltas, i);
                  const act = seedActivation(auditory?.activationPattern, i);
                  const isAnomaly = anomalySet.has(i);
                  return (
                    <g key={i}>
                      <circle cx={x} cy={y} r={nodeR} fill={activationToColor(act)} opacity={0.8} stroke={isAnomaly ? "#f87171" : "#334155"} strokeWidth={isAnomaly ? 2 : 1} />
                      <text x={x} y={y + 4} textAnchor="middle" fontSize={9} fill="#f1f5f9" fontWeight="bold">{i + 1}</text>
                    </g>
                  );
                })}
                <circle cx={cx} cy={cy} r={8} fill="#1e293b" stroke="#334155" />
                <text x={cx} y={cy + 4} textAnchor="middle" fontSize={7} fill="#64748b">Φ</text>
              </svg>
            </div>

            {auditory?.anomalies?.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-red-500">Anomalies ({auditory.anomalies.length})</p>
                {auditory.anomalies.slice(0, 5).map((a: any, i: number) => (
                  <div key={i} className="text-xs text-muted-foreground">
                    Seed {a.seedIndex + 1}: z-score {a.zScore?.toFixed(2) ?? "?"}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No sub-core data available.</p>
        )}

        {brainLoading ? (
          <Skeleton className="h-32" />
        ) : brainData ? (
          <div className="rounded-lg border border-border bg-card p-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Brain Pipeline</p>
            <div className="space-y-1">
              {Object.entries(brainData).slice(0, 8).map(([k, v]) => (
                <div key={k} className="flex justify-between text-xs">
                  <span className="text-muted-foreground truncate">{k}</span>
                  <span className="font-mono ml-2 truncate max-w-[50%]">{typeof v === "object" ? JSON.stringify(v).slice(0, 30) : String(v)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </ScrollArea>
  );
}
