import { Shield } from "lucide-react";
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

          <div className="space-y-3 w-full">
            <Button
              size="lg"
              className="w-full"
              onClick={() => { window.location.href = "/api/login"; }}
              data-testid="button-sign-in"
            >
              Sign in with Replit
            </Button>
          </div>

          <p className="text-[11px] text-zinc-600 leading-relaxed">
            Uses your Replit account. No separate password needed.
          </p>
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
