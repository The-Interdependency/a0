import { Shield, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useSEO } from "@/hooks/use-seo";
import { useEffect } from "react";

export default function LoginPage() {
  useSEO({ title: "Sign In — a0p", description: "Sign in to Agent Zero Platform." });
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isAuthenticated) {
      setLocation("/");
    }
  }, [isAuthenticated, setLocation]);

  const domains = (import.meta.env.VITE_REPLIT_DOMAINS ?? "").split(",");
  const appUrl = domains[0] ? `https://${domains[0].trim()}` : null;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-black text-white flex flex-col"
      data-testid="login-page"
    >
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 max-w-sm mx-auto w-full">
        <div className="text-center space-y-10 w-full">
          <div className="space-y-3">
            <h1
              className="text-5xl font-black tracking-tighter"
              data-testid="text-login-title"
            >
              Agent Zero
            </h1>
            <div className="flex items-center justify-center gap-2">
              <Shield className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs text-zinc-500 uppercase tracking-widest font-medium">
                Autonomous AI Platform
              </span>
            </div>
          </div>

          <div className="space-y-4 w-full">
            {appUrl ? (
              <Button
                size="lg"
                className="w-full gap-2"
                onClick={() => { window.location.href = appUrl; }}
                data-testid="button-open-in-replit"
              >
                <ExternalLink className="w-4 h-4" />
                Open in Replit Workspace
              </Button>
            ) : (
              <Button
                size="lg"
                className="w-full"
                onClick={() => { window.location.reload(); }}
                data-testid="button-sign-in"
              >
                Reload
              </Button>
            )}
            <p className="text-xs text-zinc-500 leading-relaxed">
              Access this app through the Replit workspace tab — authentication
              happens automatically when you're logged in to Replit.
            </p>
          </div>
        </div>
      </div>

      <div className="text-center pb-6 px-4">
        <p className="text-[10px] text-zinc-700">
          a0p v1.1.0-M1 · TIW Canon · EDCMBONE
        </p>
      </div>
    </div>
  );
}
