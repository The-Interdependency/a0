// 89:0
import { Switch, Route, useLocation, Redirect } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import ChatPage from "@/pages/chat";
import ConsolePage from "@/pages/console";
import SplashPage from "@/pages/splash";
import LoginPage from "@/pages/login";
import RegisterPage from "@/pages/register";
import ResetPage from "@/pages/reset";
import PricingPage from "@/pages/pricing";
import AdminContextsPage from "@/pages/admin-contexts";
import ArchivePage from "@/pages/archive";
import TopNav from "@/components/top-nav";
import HmmmDoctrine from "@/components/hmmm-doctrine";

function Router() {
  return (
    <Switch>
      <Route path="/splash" component={SplashPage} />
      <Route path="/login" component={LoginPage} />
      <Route path="/register" component={RegisterPage} />
      <Route path="/reset" component={ResetPage} />
      <Route path="/" component={ChatPage} />
      <Route path="/console" component={ConsolePage} />
      <Route path="/pricing" component={PricingPage} />
      <Route path="/admin/contexts" component={AdminContextsPage} />
      <Route path="/archive" component={ArchivePage} />
      <Route component={ChatPage} />
    </Switch>
  );
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen w-screen bg-background" data-testid="auth-loading-spinner">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Redirect to="/login" />;
  }

  return <>{children}</>;
}

function AppShell() {
  const [location] = useLocation();
  const isPublicPage =
    location === "/splash" ||
    location === "/login" ||
    location === "/register" ||
    location === "/reset" ||
    location === "/pricing";

  if (isPublicPage) {
    return (
      <div className="flex flex-col h-dvh w-screen overflow-hidden">
        <div className="flex-1 overflow-auto">
          <Router />
        </div>
      </div>
    );
  }

  return (
    <AuthGate>
      <div className="flex flex-col h-dvh w-screen bg-background text-foreground overflow-hidden">
        <TopNav />
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="flex-1 overflow-hidden">
            <Router />
          </div>
          <HmmmDoctrine />
        </div>
      </div>
    </AuthGate>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppShell />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
// 89:0
