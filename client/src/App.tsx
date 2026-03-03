import { Switch, Route, useLocation } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import ChatPage from "@/pages/chat";
import TerminalPage from "@/pages/terminal";
import FilesPage from "@/pages/files";
import DrivePage from "@/pages/drive";
import MailPage from "@/pages/mail";
import AutomationPage from "@/pages/automation";
import ConsolePage from "@/pages/console";
import PricingPage from "@/pages/pricing";
import SplashPage from "@/pages/splash";
import LoginPage from "@/pages/login";
import BottomNav from "@/components/bottom-nav";
import HmmmDoctrine from "@/components/hmmm-doctrine";

function Router() {
  return (
    <Switch>
      <Route path="/splash" component={SplashPage} />
      <Route path="/login" component={LoginPage} />
      <Route path="/" component={ChatPage} />
      <Route path="/terminal" component={TerminalPage} />
      <Route path="/files" component={FilesPage} />
      <Route path="/drive" component={DrivePage} />
      <Route path="/mail" component={MailPage} />
      <Route path="/automation" component={AutomationPage} />
      <Route path="/console" component={ConsolePage} />
      <Route path="/pricing" component={PricingPage} />
      <Route component={ChatPage} />
    </Switch>
  );
}

function AppShell() {
  const [location] = useLocation();
  const isPublicPage = location === "/splash" || location === "/login";

  if (isPublicPage) {
    return (
      <div className="flex flex-col h-screen w-screen overflow-hidden">
        <div className="flex-1 overflow-auto">
          <Router />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-background text-foreground overflow-hidden">
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-hidden">
          <Router />
        </div>
        <HmmmDoctrine />
      </div>
      <BottomNav />
    </div>
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
