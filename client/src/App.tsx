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
import BottomNav from "@/components/bottom-nav";

function Router() {
  return (
    <Switch>
      <Route path="/" component={ChatPage} />
      <Route path="/terminal" component={TerminalPage} />
      <Route path="/files" component={FilesPage} />
      <Route path="/drive" component={DrivePage} />
      <Route path="/mail" component={MailPage} />
      <Route path="/automation" component={AutomationPage} />
      <Route component={ChatPage} />
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="flex flex-col h-screen w-screen bg-background text-foreground overflow-hidden">
          <div className="flex-1 overflow-hidden">
            <Router />
          </div>
          <BottomNav />
        </div>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
