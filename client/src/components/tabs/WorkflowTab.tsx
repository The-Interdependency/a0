import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { AlertTriangle, Heart, OctagonX, Play } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

export function WorkflowTab() {
  const { toast } = useToast();
  const [stopDialogOpen, setStopDialogOpen] = useState(false);

  const { data: status, isLoading } = useQuery<{ isRunning: boolean; emergencyStop: boolean; uptime: number }>({
    queryKey: ["/api/v1/a0p/status"],
    refetchInterval: 5000,
  });

  const { data: heartbeats = [] } = useQuery<any[]>({
    queryKey: ["/api/v1/a0p/heartbeat"],
    refetchInterval: 30000,
  });

  const { data: chainStatus } = useQuery<{ valid: boolean; length: number; errors: string[] }>({
    queryKey: ["/api/v1/a0p/chain/verify"],
    refetchInterval: 60000,
  });

  const stopMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/a0p/emergency-stop"),
    onSuccess: () => { toast({ title: "Engine stopped" }); setStopDialogOpen(false); },
  });

  const resumeMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/a0p/resume"),
    onSuccess: () => toast({ title: "Engine resumed" }),
  });

  const uptimeStr = status?.uptime
    ? `${Math.floor(status.uptime / 3600)}h ${Math.floor((status.uptime % 3600) / 60)}m`
    : "--";

  return (
    <ScrollArea className="h-full px-3 py-3">
      <div className="space-y-4 pb-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">Engine Status</h3>
            <Badge variant={status?.isRunning ? "default" : "destructive"} data-testid="status-engine">
              {status?.emergencyStop ? "STOPPED" : status?.isRunning ? "RUNNING" : "OFFLINE"}
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div><span className="text-muted-foreground">Uptime</span><p className="font-mono" data-testid="text-uptime">{uptimeStr}</p></div>
            <div><span className="text-muted-foreground">Heartbeat</span><p className="font-mono">1h interval</p></div>
            <div>
              <span className="text-muted-foreground">Hash Chain</span>
              <p className={cn("font-mono", chainStatus?.valid ? "text-green-400" : "text-red-400")} data-testid="text-chain-status">
                {chainStatus ? `${chainStatus.valid ? "VALID" : "BROKEN"} (${chainStatus.length} events)` : "..."}
              </p>
            </div>
            <div><span className="text-muted-foreground">Sentinels</span><p className="font-mono">9/9 active</p></div>
          </div>
        </div>

        <div className="flex gap-2">
          {status?.isRunning ? (
            <Button variant="destructive" className="flex-1 gap-2" onClick={() => setStopDialogOpen(true)} data-testid="button-emergency-stop">
              <OctagonX className="w-4 h-4" /> Emergency Stop
            </Button>
          ) : (
            <Button className="flex-1 gap-2" onClick={() => resumeMutation.mutate()} disabled={resumeMutation.isPending} data-testid="button-resume">
              <Play className="w-4 h-4" /> Resume Engine
            </Button>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <Heart className="w-4 h-4 text-red-400" /> Heartbeat Log
          </h3>
          <div className="space-y-2">
            {heartbeats.length === 0 ? (
              <p className="text-xs text-muted-foreground">No heartbeats yet. First one fires 5s after startup, then hourly.</p>
            ) : (
              heartbeats.slice(0, 10).map((hb: any) => (
                <div key={hb.id} className="flex items-center gap-2 text-xs">
                  <span className={cn("w-2 h-2 rounded-full", hb.status === "OK" ? "bg-green-400" : "bg-red-400")} />
                  <span className="font-mono flex-1">{hb.status}</span>
                  <span className="text-muted-foreground">{new Date(hb.createdAt).toLocaleTimeString()}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <Dialog open={stopDialogOpen} onOpenChange={setStopDialogOpen}>
        <DialogContent className="w-[90vw] max-w-sm" onKeyDown={e => { if (e.key === "Enter") stopMutation.mutate(); }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" /> Emergency Stop
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">This will immediately halt the a0p engine, stop the heartbeat, and prevent all operations. Are you sure?</p>
          <p className="text-xs text-muted-foreground mt-1">Press Enter to confirm.</p>
          <DialogFooter className="gap-2">
            <Button variant="secondary" onClick={() => setStopDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => stopMutation.mutate()} disabled={stopMutation.isPending} data-testid="button-confirm-stop">
              <OctagonX className="w-4 h-4 mr-1" /> Stop Engine
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScrollArea>
  );
}
