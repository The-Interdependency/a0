import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, ShieldX, Shield, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import TabShell from "@/components/TabShell";
import { useBillingStatus } from "@/hooks/use-billing-status";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const ACTIVE_KEY = "/api/v1/approval-scopes";
const CATALOG_KEY = "/api/v1/approval-scopes/catalog";

interface ActiveScope {
  id: number;
  user_id: string;
  scope: string;
  granted_at: string;
}

interface CatalogEntry {
  scope: string;
  label: string;
  description: string;
  covers: string[];
  safety_floor: boolean;
}

const GRANT_TIERS = new Set(["ws", "pro", "admin"]);

export default function ApprovalScopesTab() {
  const qc = useQueryClient();
  const { tier, isAdmin } = useBillingStatus();
  const { toast } = useToast();

  const canGrant = GRANT_TIERS.has(tier) || isAdmin;

  const { data: active = [], isLoading: activeLoading } = useQuery<ActiveScope[]>({
    queryKey: [ACTIVE_KEY],
  });

  const { data: catalog = [], isLoading: catalogLoading } = useQuery<CatalogEntry[]>({
    queryKey: [CATALOG_KEY],
  });

  const activeScopes = new Set(active.map((s) => s.scope));

  const invalidateBoth = () => {
    qc.invalidateQueries({ queryKey: [ACTIVE_KEY] });
    qc.invalidateQueries({ queryKey: [CATALOG_KEY] });
  };

  const grantMutation = useMutation({
    mutationFn: (scope: string) =>
      apiRequest("POST", "/api/v1/approval-scopes", { scope }),
    onSuccess: (_res, scope) => {
      invalidateBoth();
      toast({ title: "Scope granted", description: `${scope} is now pre-approved.` });
    },
    onError: (err: Error) => {
      toast({ title: "Grant failed", description: err.message, variant: "destructive" });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (scope: string) =>
      apiRequest("DELETE", `/api/v1/approval-scopes/${scope}`),
    onSuccess: (_res, scope) => {
      invalidateBoth();
      toast({ title: "Scope revoked", description: `${scope} has been removed.` });
    },
    onError: (err: Error) => {
      toast({ title: "Revoke failed", description: err.message, variant: "destructive" });
    },
  });

  const isPending = grantMutation.isPending || revokeMutation.isPending;

  const handleRefresh = () => invalidateBoth();

  return (
    <TabShell label="Approval Scopes" icon="ShieldCheck" onRefresh={handleRefresh} isRefreshing={activeLoading || catalogLoading}>
      <div className="flex flex-col gap-6">
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3" data-testid="section-header-scopes">
            Pre-Approved Scopes
          </h3>

          {activeLoading ? (
            <div className="flex items-center justify-center py-8" data-testid="section-loading-scopes">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : active.length === 0 ? (
            <div className="text-xs text-muted-foreground py-4 text-center" data-testid="section-empty-scopes">
              No scopes pre-approved yet. Grant one from the catalog below.
            </div>
          ) : (
            <div className="flex flex-col gap-3" data-testid="section-scopes">
              {active.map((s) => (
                <Card key={s.id} className="p-3" data-testid={`scope-active-${s.scope}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-col gap-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="h-3.5 w-3.5 text-green-500 shrink-0" />
                        <Badge variant="secondary" className="text-xs" data-testid={`badge-scope-${s.scope}`}>
                          {s.scope}
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground truncate">
                        Granted {new Date(s.granted_at).toLocaleString()}
                      </span>
                    </div>
                    {canGrant && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive shrink-0 h-7 px-2"
                        disabled={isPending}
                        onClick={() => revokeMutation.mutate(s.scope)}
                        data-testid={`button-revoke-${s.scope}`}
                      >
                        Revoke
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        <Separator />

        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3" data-testid="section-header-catalog">
            Scope Catalog
          </h3>

          {catalogLoading ? (
            <div className="flex items-center justify-center py-8" data-testid="section-loading-catalog">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="flex flex-col gap-3" data-testid="section-catalog">
              {catalog.map((entry) => {
                const isGranted = activeScopes.has(entry.scope);
                const isFloor = entry.safety_floor;
                return (
                  <Card key={entry.scope} className="p-3" data-testid={`catalog-entry-${entry.scope}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-col gap-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {isFloor ? (
                            <ShieldX className="h-3.5 w-3.5 text-destructive shrink-0" />
                          ) : isGranted ? (
                            <ShieldCheck className="h-3.5 w-3.5 text-green-500 shrink-0" />
                          ) : (
                            <Shield className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          )}
                          <Badge variant={isFloor ? "destructive" : isGranted ? "default" : "outline"} className="text-xs">
                            {entry.scope}
                          </Badge>
                          <span className="text-xs font-medium">{entry.label}</span>
                          {isFloor && (
                            <Badge variant="outline" className="text-xs border-destructive text-destructive">
                              safety floor
                            </Badge>
                          )}
                          {isGranted && !isFloor && (
                            <Badge variant="outline" className="text-xs border-green-500 text-green-600">
                              active
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {entry.description}
                        </p>
                        {entry.covers.length > 0 && (
                          <div className="flex gap-1 flex-wrap mt-0.5">
                            {entry.covers.map((c) => (
                              <span key={c} className="text-[10px] font-mono bg-muted rounded px-1 py-0.5 text-muted-foreground">
                                {c}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {canGrant && !isFloor && (
                        <div className="shrink-0">
                          {isGranted ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive h-7 px-2"
                              disabled={isPending}
                              onClick={() => revokeMutation.mutate(entry.scope)}
                              data-testid={`button-catalog-revoke-${entry.scope}`}
                            >
                              Revoke
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2"
                              disabled={isPending}
                              onClick={() => grantMutation.mutate(entry.scope)}
                              data-testid={`button-catalog-grant-${entry.scope}`}
                            >
                              Grant
                            </Button>
                          )}
                        </div>
                      )}

                      {!canGrant && isFloor && (
                        <span className="text-[10px] text-muted-foreground shrink-0 self-start pt-0.5">
                          always gated
                        </span>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {!canGrant && (
            <p className="text-xs text-muted-foreground mt-3 text-center italic" data-testid="text-grant-restriction">
              Scope granting requires ws, pro, or admin tier.
            </p>
          )}
        </div>
      </div>
    </TabShell>
  );
}
