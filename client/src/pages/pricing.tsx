import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Check, Crown, Heart, CreditCard, LogIn, LogOut, User, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";

export default function PricingPage() {
  const { user, isAuthenticated, logout } = useAuth();

  return (
    <ScrollArea className="h-full">
      <div className="px-3 py-4 space-y-6 pb-8 max-w-lg mx-auto">
        {!isAuthenticated ? (
          <div className="rounded-md border border-primary/30 bg-primary/5 p-4 text-center">
            <LogIn className="w-8 h-8 text-primary mx-auto mb-2" />
            <h3 className="font-semibold text-sm mb-1">Sign in to a0p</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Log in with your Replit account to access all features.
            </p>
            <Button asChild data-testid="button-login">
              <a href="/api/login">
                <LogIn className="w-4 h-4 mr-1" />
                Log in with Replit
              </a>
            </Button>
          </div>
        ) : (
          <Card className="p-4 flex items-center gap-3">
            {user?.profileImageUrl ? (
              <img src={user.profileImageUrl} className="w-10 h-10 rounded-full" alt="" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="w-5 h-5 text-primary" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate" data-testid="text-user-name">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => logout()} data-testid="button-logout">
              <LogOut className="w-4 h-4" />
            </Button>
          </Card>
        )}

        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-6 text-center">
          <Clock className="w-10 h-10 text-amber-400 mx-auto mb-3" />
          <h2 className="font-bold text-lg mb-2" data-testid="text-coming-soon-title">Coming Soon</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Payments and subscriptions are being prepared. All features are currently available during the preview period.
          </p>
          <Badge variant="secondary" data-testid="badge-preview">Preview Access</Badge>
        </div>

        <Card className="p-4 opacity-60">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="font-bold text-base">Core Access</h3>
            <div className="text-right">
              <span className="text-2xl font-bold">$15</span>
              <span className="text-xs text-muted-foreground"> / month</span>
            </div>
          </div>
          <div className="space-y-2">
            {[
              "Full console access",
              "EDCM instrumentation",
              "Hourly heartbeat",
              "BYO API keys",
              "Cost telemetry",
            ].map((f) => (
              <div key={f} className="flex items-center gap-2 text-xs">
                <Check className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                <span>{f}</span>
              </div>
            ))}
          </div>
          <Button className="w-full mt-3" disabled data-testid="button-subscribe-core">
            Coming Soon
          </Button>
        </Card>

        <Card className="p-4 opacity-60">
          <div className="flex items-center gap-2 mb-2">
            <Crown className="w-5 h-5 text-amber-400" />
            <h3 className="font-bold text-base">Founder</h3>
            <Badge variant="secondary" className="text-[10px]">Limited to 53</Badge>
          </div>
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="text-2xl font-bold">$153</span>
            <span className="text-xs text-muted-foreground">one-time</span>
          </div>
          <div className="space-y-2 mb-3">
            {[
              "Founder registry listing",
              "Founder badge",
              "Locked $15 base rate while active",
              "Early refinement channel",
            ].map((f) => (
              <div key={f} className="flex items-center gap-2 text-xs">
                <Crown className="w-3 h-3 text-amber-400 flex-shrink-0" />
                <span>{f}</span>
              </div>
            ))}
          </div>
          <Button variant="secondary" className="w-full" disabled data-testid="button-founder">
            Coming Soon
          </Button>
        </Card>

        <Card className="p-4 opacity-60">
          <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">
            <Heart className="w-4 h-4 text-pink-400" />
            Optional Support
          </h3>
          <p className="text-xs text-muted-foreground">Coming soon</p>
        </Card>

        <Card className="p-4 opacity-60">
          <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-blue-400" />
            Compute Credits
          </h3>
          <p className="text-xs text-muted-foreground">Coming soon</p>
        </Card>
      </div>
    </ScrollArea>
  );
}
